import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { Link, useLocation } from "wouter";
import { usePostHog } from "@posthog/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { DirectoryAgent } from "@compose-market/sdk";
import { Excerpt } from "@compose-market/theme/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Layers,
  Sparkles,
  ExternalLink,
  Zap,
  DollarSign,
  Copy,
  Plus,
  Activity,
  Clock,
  Shield,
  Award,
  Target,
  XCircle,
  CheckCircle,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { useWorkflowsByCreator, useRFAsByPublisher, type OnchainAgent, type OnchainWorkflow, type OnchainRFA } from "@/hooks/use-onchain";
import { getIpfsUrl } from "@/lib/pinata";
import { CHAIN_CONFIG } from "@/lib/chains";
import { formatUsdcPrice, getContractAddress, getRFAContract, weiToUsdc } from "@/lib/contracts";
import { sdk } from "@/lib/sdk";
import { useTabs } from "@/hooks/use-tabs";
import { RFADetails } from "@/components/RFADetails";
import { ShareSuccessDialog } from "@/components/share-dialog";
import { getMintSuccessForShare, clearMintSuccessShare, type MintShareData } from "@/lib/share";
import { AgentCard as SharedAgentCard } from "@/components/agent-card";

const AGENTS_LIMIT = 24;

type AgentSort = "newest" | "price-low" | "price-high";
type WorkflowSort = "newest" | "price-low" | "price-high";
type AssetTab = "agents" | "workflows" | "rfas";

type TabStatus = {
  count: string;
  busy: boolean;
};

type AgentPage = {
  agents: DirectoryAgent[];
  total: number;
  count?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

function amount(value: string | undefined): bigint {
  const raw = value?.trim();
  if (!raw) return 0n;
  if (/^\d+$/.test(raw)) return BigInt(raw);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? BigInt(Math.round(parsed * 1_000_000)) : 0n;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function agent(card: DirectoryAgent): OnchainAgent {
  const cost = amount(card.licensePrice);
  const licenses = finite(card.licenses) ?? 0;
  const minted = finite((card as { licensesMinted?: unknown }).licensesMinted) ?? 0;
  const available = finite(card.licensesAvailable) ?? (licenses === 0 ? Infinity : Math.max(0, licenses - minted));
  const creatorFee = finite(card.creatorFee) ?? 1;

  return {
    id: finite(card.agentId) ?? 0,
    dnaHash: card.dnaHash || "",
    walletAddress: card.walletAddress || "",
    licenses,
    licensesMinted: minted,
    licensesAvailable: available,
    licensePrice: weiToUsdc(cost),
    licensePriceFormatted: formatUsdcPrice(cost),
    creatorFee,
    creator: card.creator || "",
    cloneable: Boolean(card.cloneable),
    isClone: Boolean(card.isClone),
    parentAgentId: finite(card.parentAgentId) ?? 0,
    agentCardUri: card.cid ? `ipfs://${card.cid}` : "",
    metadata: {
      ...card,
      creatorFee,
      x402: true,
    } as OnchainAgent["metadata"],
    isWarped: false,
  };
}

async function page(input: { creator?: string; cursor?: string; q?: string; sort?: AgentSort; signal?: AbortSignal }): Promise<AgentPage> {
  const params = new URLSearchParams({ limit: String(AGENTS_LIMIT) });
  if (input.creator) params.set("creator", input.creator);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.q) params.set("q", input.q);
  if (!input.q && input.sort) params.set("sort", input.sort);
  const response = await sdk.fetch(`/agents?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: input.signal,
  });
  if (!response.ok) {
    throw new Error(`Agent lookup failed with status ${response.status}`);
  }
  return await response.json() as AgentPage;
}

export default function MyAssetsPage() {
  const { toast } = useToast();
  const account = useActiveAccount();
  const [activeTab, setActiveTab] = useTabs("my-assets", "agents");
  const tab: AssetTab = activeTab === "workflows" || activeTab === "rfas" ? activeTab : "agents";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const [sort, setSort] = useState<AgentSort>("newest");
  const [workflowSort, setWorkflowSort] = useState<WorkflowSort>("newest");
  const refreshers = useRef<Partial<Record<AssetTab, () => void>>>({});
  const [status, setStatus] = useState<Record<AssetTab, TabStatus>>({
    agents: { count: "0/0 agents", busy: false },
    workflows: { count: "0 workflows", busy: false },
    rfas: { count: "0 RFAs", busy: false },
  });
  const owner = account?.address;
  const q = deferredQuery.trim();

  const onStatus = useMemo(() => {
    return (key: AssetTab, next: TabStatus & { refresh?: () => void }) => {
      refreshers.current[key] = next.refresh;
      setStatus((current) => {
        const previous = current[key];
        if (previous.count === next.count && previous.busy === next.busy) return current;
        return { ...current, [key]: { count: next.count, busy: next.busy } };
      });
    };
  }, []);

  const {
    data: agentData,
    isLoading: isLoadingAgents,
    isFetchingNextPage,
    hasNextPage,
    error: agentError,
    refetch: refetchAgents,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["agents", "my-assets", owner?.toLowerCase() || "", q, q ? "relevance" : sort],
    queryFn: async ({ pageParam, signal }) => {
      const cursor = typeof pageParam === "string" ? pageParam : undefined;
      return await page({ creator: owner, cursor, q: q || undefined, sort: q ? undefined : sort, signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor ?? undefined : undefined,
    enabled: Boolean(owner),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const agents = useMemo(() => {
    const seen = new Set<string>();
    const out: OnchainAgent[] = [];
    for (const current of agentData?.pages || []) {
      for (const card of current.agents || []) {
        if (!card.walletAddress) continue;
        const key = card.walletAddress.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(agent(card));
      }
    }
    return out;
  }, [agentData]);

  const agentCount = agentData?.pages[0]?.total ?? agents.length;
  const currentStatus = status[tab];

  // RFA detail dialog state
  const [selectedRfaId, setSelectedRfaId] = useState<number | null>(null);
  const [showRFADetails, setShowRFADetails] = useState(false);

  // Share success dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareData, setShareData] = useState<MintShareData | null>(null);

  useEffect(() => {
    const data = getMintSuccessForShare();
    if (data) {
      setShareData(data);
      setShowShareDialog(true);
    }
  }, []);

  useEffect(() => {
    refreshers.current = {};
    setStatus({
      agents: { count: "0/0 agents", busy: false },
      workflows: { count: "0 workflows", busy: false },
      rfas: { count: "0 RFAs", busy: false },
    });
  }, [owner]);

  const handleCloseShareDialog = (open: boolean) => {
    setShowShareDialog(open);
    if (!open) {
      clearMintSuccessShare();
      setShareData(null);
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast({ title: "Address copied!" });
  };

  const handleRefresh = () => {
    refreshers.current[tab]?.();
  };

  if (!account) {
    return (
      <div className="cm-web-page">
        <div className="cm-web-page__canvas cm-workspace-canvas--fade">
          <div className="cm-web-page__body cm-web-page__body--narrow">
            <div className="cm-shell-page-header px-0">
              <div className="cm-shell-page-header__copy">
                <h1 className="cm-shell-page-header__title">
                  <span className="text-cyan-500 mr-2">//</span>
                  MY ASSETS
                </h1>
                <p className="cm-shell-page-header__subtitle">
                  View and manage your on-chain agents and workflows.
                </p>
              </div>
            </div>

            <Card className="glass-panel border-primary/20">
              <CardContent className="p-6 sm:p-8 text-center space-y-3">
                <Shield className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground/50" />
                <h2 className="text-lg sm:text-xl font-display text-foreground">Sign In Required</h2>
                <p className="text-muted-foreground font-mono text-xs sm:text-sm max-w-md mx-auto">
                  Connect with email, social, or wallet to view your on-chain assets.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-market-workspace">
      <div className="cm-page-header">
        <div className="cm-page-header__title-row">
          <h1 className="cm-page-header__title">
            <span className="text-cyan-500 mr-2">//</span>
            MY ASSETS
          </h1>
          <div className="cm-page-header__rule hidden md:block"></div>
          <Link href="/create-agent" className="ml-auto w-full sm:w-auto">
            <Button className="w-full sm:w-auto bg-cyan-500 text-black hover:bg-cyan-400 font-bold font-mono text-sm h-9">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              CREATE AGENT
            </Button>
          </Link>
        </div>
        <div className="cm-page-header__subtitle-row">
          <p className="cm-page-header__subtitle">
            All your agents, workflows, and RFAs at a glance.
          </p>
          <div className="cm-page-header__meta">
            <button
              type="button"
              onClick={() => copyAddress(account.address)}
              className="cm-page-header__account"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>{account.address.slice(0, 6)}...{account.address.slice(-4)}</span>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <Badge variant="outline" className="cm-page-header__metric">
              {currentStatus.count}
            </Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="cm-market-tabs w-full">
        <div className="cm-control-rail cm-market-control-rail cm-market-control-rail--unified">
          <TabsList className="cm-shell-tab-strip cm-market-control-rail__tabs">
            <TabsTrigger value="agents" className="cm-shell-tab min-w-0">
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">AGENTS</span>
            </TabsTrigger>
            <TabsTrigger value="workflows" className="cm-shell-tab min-w-0">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">WORKFLOWS</span>
            </TabsTrigger>
            <TabsTrigger value="rfas" className="cm-shell-tab min-w-0">
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">RFAs</span>
            </TabsTrigger>
          </TabsList>
          <div className="cm-market-control-rail__middle">
            <AssetSearch
              open={searchOpen}
              value={searchQuery}
              onOpenChange={setSearchOpen}
              onChange={setSearchQuery}
            />
          </div>
          <div className="cm-market-control-rail__actions">
            {tab === "agents" ? (
              <Select value={sort} onValueChange={(value) => setSort(value as AgentSort)} disabled={Boolean(q)}>
                <SelectTrigger className="w-[170px] bg-background/50 border-primary/20 h-9 text-sm">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {tab === "workflows" ? (
              <Select value={workflowSort} onValueChange={(value) => setWorkflowSort(value as WorkflowSort)}>
                <SelectTrigger className="w-[170px] bg-background/50 border-primary/20 h-9 text-sm">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="border-primary/20 h-9 w-9"
            >
              <RefreshCw className={`w-4 h-4 ${currentStatus.busy ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <TabsContent value="agents" className="cm-market-tab-panel cm-market-tab-panel--agents mt-0">
          {activeTab === "agents" ? (
            <AssetAgentsTab
              agents={agents}
              total={agentCount}
              sort={sort}
              isLoading={isLoadingAgents}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={Boolean(hasNextPage)}
              error={agentError instanceof Error ? agentError : null}
              refetch={() => void refetchAgents()}
              fetchNextPage={() => void fetchNextPage()}
              searchQuery={deferredQuery}
              onStatus={onStatus}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="workflows" className="cm-market-tab-panel cm-market-tab-panel--scroll mt-0">
          {activeTab === "workflows" ? (
            <WorkflowsTab
              creator={account.address}
              searchQuery={deferredQuery}
              sort={workflowSort}
              onStatus={onStatus}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="rfas" className="cm-market-tab-panel cm-market-tab-panel--scroll mt-0">
          {activeTab === "rfas" ? (
            <RFAsTab
              publisher={account.address}
              searchQuery={deferredQuery}
              onStatus={onStatus}
              onView={(id) => {
                setSelectedRfaId(id);
                setShowRFADetails(true);
              }}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      <ShareSuccessDialog
        open={showShareDialog}
        onOpenChange={handleCloseShareDialog}
        data={shareData}
      />

      <RFADetails
        rfaId={selectedRfaId}
        open={showRFADetails}
        onOpenChange={setShowRFADetails}
      />
    </div>
  );
}

function AssetSearch({
  open,
  value,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visible = open || value.trim().length > 0;

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div className="cm-market-search-fold" data-open={visible}>
      <label className="cm-search cm-search--market" aria-label="Search assets" aria-hidden={!visible}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          className="cm-search__input"
          type="search"
          placeholder="Search assets..."
          value={value}
          disabled={!visible}
          tabIndex={visible ? 0 : -1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (value) {
                onChange("");
              } else {
                onOpenChange(false);
              }
            }
          }}
        />
      </label>
      <button
        type="button"
        className="cm-hud-button cm-hud-button--icon cm-market-search-fold__toggle"
        aria-label="Search"
        aria-expanded={visible}
        onClick={() => onOpenChange(!visible)}
      >
        <Search className="cm-hud-icon" size={17} />
      </button>
    </div>
  );
}

function AssetAgentsTab({
  agents,
  total,
  sort,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  error,
  refetch,
  fetchNextPage,
  searchQuery,
  onStatus,
}: {
  agents: OnchainAgent[];
  total: number;
  sort: AgentSort;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  error: Error | null;
  refetch: () => void;
  fetchNextPage: () => void;
  searchQuery: string;
  onStatus: (tab: AssetTab, status: TabStatus & { refresh?: () => void }) => void;
}) {
  const [shown, setShown] = useState(120);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const visibleAgents = agents.length > 120 ? agents.slice(0, shown) : agents;
  const canReveal = visibleAgents.length < agents.length;

  useEffect(() => {
    setShown(120);
  }, [sort]);

  useEffect(() => {
    const query = searchQuery.trim();
    onStatus("agents", {
      count: query ? `${agents.length} results` : `${agents.length}/${total} agents`,
      busy: isLoading || isFetchingNextPage,
      refresh: refetch,
    });
  }, [agents.length, isFetchingNextPage, isLoading, onStatus, refetch, searchQuery, total]);

  useEffect(() => {
    const root = canvasRef.current;
    const node = moreRef.current;
    if (!root || !node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (canReveal) {
        setShown((value) => Math.min(value + 48, agents.length));
        return;
      }
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { root, rootMargin: "640px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [agents.length, canReveal, fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="cm-market-agents">
      {isLoading && (
        <div className="cm-market-agent-canvas cm-market-agent-canvas--loading">
          <div className="cm-market-agent-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <Card key={i} className="glass-panel cm-agent-card cm-agent-card--market">
                <CardContent className="p-4 sm:p-5 space-y-3 sm:space-y-4">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <Skeleton className="h-4 sm:h-5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-14 sm:h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-center py-10 sm:py-12">
          <Bot className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400">{error.message}</p>
          <Button variant="outline" className="mt-4" onClick={refetch}>
            Try Again
          </Button>
        </div>
      )}

      {!isLoading && visibleAgents.length > 0 && (
        <div className="cm-market-agent-canvas" ref={canvasRef} aria-label="My agents">
          <div className="cm-market-agent-grid">
            {visibleAgents.map((agent) => (
              <div
                key={agent.walletAddress || `agent-${agent.id}`}
                className="cm-market-agent-slot [content-visibility:auto] [contain-intrinsic-size:360px]"
              >
                <AgentAssetCard agent={agent} />
              </div>
            ))}
            {(canReveal || hasNextPage) ? (
              <div ref={moreRef} className="cm-market-agent-more">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (canReveal) {
                      setShown((value) => Math.min(value + 48, agents.length));
                    } else {
                      fetchNextPage();
                    }
                  }}
                  disabled={isFetchingNextPage}
                  className="border-sidebar-border h-9 text-xs"
                >
                  {isFetchingNextPage ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {agents.length === 0 && !isLoading && !error && (
        <div className="text-center py-8 sm:py-10">
          <Bot className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm sm:text-base">
            No agents minted by this account yet
          </p>
          <Link href="/create-agent">
            <Button className="mt-4 bg-cyan-500 text-black hover:bg-cyan-400 font-bold font-mono text-sm">
              <Plus className="w-4 h-4 mr-2" />
              CREATE AGENT
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function WorkflowsTab({
  creator,
  searchQuery,
  sort,
  onStatus,
}: {
  creator: string;
  searchQuery: string;
  sort: WorkflowSort;
  onStatus: (tab: AssetTab, status: TabStatus & { refresh?: () => void }) => void;
}) {
  const { data: workflows, isLoading: isLoadingWorkflows, refetch } = useWorkflowsByCreator(creator);
  const filteredWorkflows = useMemo(() => {
    let filtered = workflows || [];
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((workflow) =>
        workflow.title.toLowerCase().includes(query) ||
        workflow.description.toLowerCase().includes(query)
      );
    }
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "price-low":
          return parseFloat(a.totalPrice) - parseFloat(b.totalPrice);
        case "price-high":
          return parseFloat(b.totalPrice) - parseFloat(a.totalPrice);
        case "newest":
        default:
          return (b.metadata?.createdAt ? new Date(b.metadata.createdAt).getTime() : 0) -
            (a.metadata?.createdAt ? new Date(a.metadata.createdAt).getTime() : 0);
      }
    });
  }, [searchQuery, sort, workflows]);

  useEffect(() => {
    onStatus("workflows", {
      count: searchQuery.trim() ? `${filteredWorkflows.length} results` : `${filteredWorkflows.length} workflows`,
      busy: isLoadingWorkflows,
      refresh: () => void refetch(),
    });
  }, [filteredWorkflows.length, isLoadingWorkflows, onStatus, refetch, searchQuery]);

  if (isLoadingWorkflows) {
    return (
      <div className="cm-market-row-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="cm-surface-card">
            <CardContent className="p-4 sm:p-5 space-y-3 sm:space-y-4">
              <Skeleton className="h-24 sm:h-32 w-full rounded-sm" />
              <Skeleton className="h-4 sm:h-5 w-3/4" />
              <Skeleton className="h-14 sm:h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (filteredWorkflows.length > 0) {
    return (
      <div className="cm-market-row-grid">
        {filteredWorkflows.map((workflow) => (
          <WorkflowAssetCard key={workflow.id} workflow={workflow} />
        ))}
      </div>
    );
  }

  return (
    <Card className="cm-surface-card">
      <CardContent className="p-6 sm:p-8 text-center space-y-3">
        <Layers className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground/50" />
        <h3 className="text-base sm:text-lg font-display text-foreground">No Workflows Yet</h3>
        <p className="text-muted-foreground font-mono text-xs sm:text-sm max-w-md mx-auto">
          {searchQuery ? "No workflows match your search." : "Compose your first Workflow by combining multiple agents."}
        </p>
        <Link href="/compose">
          <Button className="bg-fuchsia-500 text-white hover:bg-fuchsia-400 font-bold font-mono text-sm">
            <Layers className="w-4 h-4 mr-2" />
            START COMPOSING
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RFAsTab({
  publisher,
  searchQuery,
  onStatus,
  onView,
}: {
  publisher: string;
  searchQuery: string;
  onStatus: (tab: AssetTab, status: TabStatus & { refresh?: () => void }) => void;
  onView: (id: number) => void;
}) {
  const { data: rfas, isLoading: isLoadingRFAs, refetch: refetchRFAs } = useRFAsByPublisher(publisher);
  const filteredRFAs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const source = rfas || [];
    if (!query) return source;
    return source.filter((rfa) =>
      rfa.title.toLowerCase().includes(query) ||
      rfa.description.toLowerCase().includes(query)
    );
  }, [rfas, searchQuery]);

  useEffect(() => {
    onStatus("rfas", {
      count: searchQuery.trim() ? `${filteredRFAs.length} results` : `${filteredRFAs.length} RFAs`,
      busy: isLoadingRFAs,
      refresh: () => void refetchRFAs(),
    });
  }, [filteredRFAs.length, isLoadingRFAs, onStatus, refetchRFAs, searchQuery]);

  if (isLoadingRFAs) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="cm-surface-card">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (filteredRFAs.length > 0) {
    return (
      <div className="space-y-3">
        {filteredRFAs.map((rfa) => (
          <RFAAssetCard
            key={rfa.id}
            rfa={rfa}
            onViewDetails={() => onView(rfa.id)}
            onRefresh={refetchRFAs}
          />
        ))}
      </div>
    );
  }

  return (
    <Card className="cm-surface-card">
      <CardContent className="p-6 sm:p-8 text-center space-y-3">
        <FileSearch className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground/50" />
        <h3 className="text-base sm:text-lg font-display text-foreground">No RFAs Published</h3>
        <p className="text-muted-foreground font-mono text-xs sm:text-sm max-w-md mx-auto">
          {searchQuery ? "No RFAs match your search." : "You haven't published any Request-For-Agent bounties yet. Create one from the Compose page."}
        </p>
        <Link href="/compose">
          <Button className="bg-amber-500 text-black hover:bg-amber-400 font-bold font-mono text-sm">
            <Award className="w-4 h-4 mr-2" />
            GO TO COMPOSE
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function AgentAssetCard({ agent }: { agent: OnchainAgent }) {
  const [, setLocation] = useLocation();

  // Agent page URL using wallet address (primary) or ID (fallback)
  const agentPageUrl = agent.walletAddress
    ? `/agent/${agent.walletAddress}`
    : agent.id > 0 ? `/agent/${agent.id}` : "/agents";

  return (
    <SharedAgentCard
      agent={agent}
      variant="market"
      onOpen={() => setLocation(agentPageUrl)}
    />
  );
}

function WorkflowAssetCard({ workflow }: { workflow: OnchainWorkflow }) {
  let bannerUrl: string | null = null;
  if (workflow.image && workflow.image.startsWith("ipfs://")) {
    bannerUrl = getIpfsUrl(workflow.image.replace("ipfs://", ""));
  }

  // Use chainId from workflow's first agent metadata (source of truth)
  const workflowChainId = workflow.metadata?.agents?.[0]?.chain;
  const explorerUrl = workflowChainId && CHAIN_CONFIG[workflowChainId]
    ? `${CHAIN_CONFIG[workflowChainId].explorer}/token/${getContractAddress("Workflow", workflowChainId)}?a=${workflow.id}`
    : null;

  // Use wallet address for navigation (primary), fallback to numeric ID
  const workflowPageUrl = workflow.walletAddress
    ? `/workflow/${workflow.walletAddress}`
    : `/workflow/${workflow.id}`;

  return (
    <Link href={workflowPageUrl} className="block">
      <Card
        className="cm-surface-card hover:border-fuchsia-500/50 transition-colors overflow-hidden cursor-pointer group"
      >
        {bannerUrl ? (
          <div className="h-24 sm:h-32 bg-cover bg-center" style={{ backgroundImage: `url(${bannerUrl})` }} />
        ) : (
          <div className="h-24 sm:h-32 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center">
            <Layers className="w-10 h-10 sm:w-12 sm:h-12 text-fuchsia-400/50" />
          </div>
        )}

        <CardContent className="p-4 sm:p-5 space-y-3 sm:space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-display font-bold text-foreground text-sm sm:text-base truncate group-hover:text-fuchsia-400 transition-colors">
                {workflow.title || `Workflow #${workflow.id}`}
              </h3>
              <p className="text-[10px] sm:text-xs font-mono text-muted-foreground">
                Workflow #{workflow.id} • ERC7401
              </p>
            </div>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-muted-foreground hover:text-fuchsia-400 transition-colors shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </a>
            )}
          </div>

          {workflow.description && (
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              <Excerpt title={workflow.title || `Workflow #${workflow.id}`} text={workflow.description} lines={2}>
                {workflow.description}
              </Excerpt>
            </div>
          )}

          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            <Badge variant="outline" className="text-[8px] sm:text-[10px] font-mono border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10 px-1 sm:px-1.5 py-0">
              <Sparkles className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
              nestable NFT
            </Badge>
            {workflow.leaseEnabled && (
              <Badge variant="outline" className="text-[8px] sm:text-[10px] font-mono border-green-500/30 text-green-400 bg-green-500/10 px-1 sm:px-1.5 py-0">
                <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                leasable ({workflow.leasePercent}%)
              </Badge>
            )}
            {workflow.hasActiveRfa && (
              <Badge variant="outline" className="text-[8px] sm:text-[10px] font-mono border-yellow-500/30 text-yellow-400 bg-yellow-500/10 px-1 sm:px-1.5 py-0">
                active RFA
              </Badge>
            )}
            {workflow.coordinatorModel && (
              <Badge variant="outline" className="text-[8px] sm:text-[10px] font-mono border-purple-500/30 text-purple-400 bg-purple-500/10 px-1 sm:px-1.5 py-0">
                + coordinator
              </Badge>
            )}
          </div>

          <div className="cm-stat-grid cm-stat-grid--3col">
            <div className="cm-stat-grid__cell">
              <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 mx-auto mb-0.5 sm:mb-1 text-green-400" />
              <p className="text-foreground font-bold truncate">${workflow.totalPrice}</p>
              <p className="text-muted-foreground text-[8px] sm:text-[10px]">total cost</p>
            </div>
            <div className="cm-stat-grid__cell">
              <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 mx-auto mb-0.5 sm:mb-1 text-cyan-400" />
              <p className="text-foreground font-bold">{workflow.agentIds?.length || 0}</p>
              <p className="text-muted-foreground text-[8px] sm:text-[10px]">agents</p>
            </div>
            <div className="cm-stat-grid__cell">
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 mx-auto mb-0.5 sm:mb-1 text-fuchsia-400" />
              <p className="text-foreground font-bold">
                {workflow.units === 0 ? "∞" : workflow.units - workflow.unitsMinted}
              </p>
              <p className="text-muted-foreground text-[8px] sm:text-[10px]">avail</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// RFA Asset Card Component
function RFAAssetCard({
  rfa,
  onViewDetails,
  onRefresh,
}: {
  rfa: OnchainRFA;
  onViewDetails: () => void;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const posthog = usePostHog();
  const { mutateAsync: sendTransaction, isPending } = useSendTransaction();
  const [isCancelling, setIsCancelling] = useState(false);

  // Format dates
  const createdDate = new Date(rfa.createdAt * 1000);

  // Handle cancel
  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      setIsCancelling(true);

      const contract = getRFAContract();
      const tx = prepareContractCall({
        contract,
        method: "function cancelRFA(uint256 rfaId)",
        params: [BigInt(rfa.id)],
      });

      await sendTransaction(tx);

      posthog?.capture("rfa_cancelled", {
        rfa_id: rfa.id,
        rfa_title: rfa.title,
        offer_amount: rfa.offerAmount,
        workflow_id: rfa.workflowId,
      });

      onRefresh();
    } catch (error) {
      console.error("Cancel error:", error);
      toast({
        title: "Failed to Cancel",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const statusColor = {
    Open: "border-green-500/30 text-green-400 bg-green-500/10",
    Fulfilled: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
    Cancelled: "border-red-500/30 text-red-400 bg-red-500/10",
    None: "border-gray-500/30 text-gray-400 bg-gray-500/10",
  }[rfa.status];

  return (
    <Card
      className="cm-surface-card hover:border-amber-500/50 transition-colors cursor-pointer"
      onClick={onViewDetails}
    >
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px]">
                <Target className="w-2 h-2 mr-1" />
                RFA #{rfa.id}
              </Badge>
              <Badge variant="outline" className={`text-[9px] ${statusColor}`}>
                {rfa.status === 'Open' && <Clock className="w-2 h-2 mr-1" />}
                {rfa.status === 'Fulfilled' && <CheckCircle className="w-2 h-2 mr-1" />}
                {rfa.status === 'Cancelled' && <XCircle className="w-2 h-2 mr-1" />}
                {rfa.status}
              </Badge>
            </div>
            <h3 className="font-display font-bold text-foreground truncate text-sm sm:text-base">
              {rfa.title}
            </h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {rfa.description}
            </p>
          </div>

          {/* Bounty Amount */}
          <div className="text-right shrink-0">
            <p className="text-[9px] text-muted-foreground uppercase">Bounty</p>
            <p className="font-mono font-bold text-amber-400 text-lg">
              {rfa.offerAmountFormatted}
            </p>
          </div>
        </div>

        {/* Meta Row */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>For: Workflow #{rfa.workflowId}</span>
          <span>{createdDate.toLocaleDateString()}</span>
        </div>

        {/* Actions */}
        {rfa.status === 'Open' && (
          <div className="flex items-center gap-2 pt-2 border-t border-primary/15">
            <Button
              variant="outline"
              size="sm"
              onClick={onViewDetails}
              className="flex-1 text-xs h-8"
            >
              <Bot className="w-3 h-3 mr-1" />
              View Submissions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isCancelling || isPending}
              className="text-xs h-8 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              {isCancelling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <XCircle className="w-3 h-3 mr-1" />
                  Cancel
                </>
              )}
            </Button>
          </div>
        )}

        {rfa.status === 'Fulfilled' && (
          <div className="flex items-center gap-2 p-2 rounded-sm bg-cyan-500/5 border border-cyan-500/20 text-[10px]">
            <CheckCircle className="w-3 h-3 text-cyan-400" />
            <span className="text-cyan-400">Fulfilled by Agent #{rfa.fulfilledByAgentId}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
