/**
 * Market - Agents, Workflows & RFA Bounties
 * 
 * Browse and purchase ERC7401 workflow NFTs and submit agents for RFA bounties.
 */
import { useState, useDeferredValue } from "react";
import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import type { DirectoryAgent } from "@compose-market/sdk";
import { mpTrack } from "@/lib/mixpanel";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOnchainWorkflows, useOpenRFAs, type OnchainAgent, type OnchainWorkflow, type OnchainRFA } from "@/hooks/use-onchain";
import { useTabs } from "@/hooks/use-tabs";
import { getIpfsUrl } from "@/lib/pinata";
import { RFA_BOUNTY_LIMITS, formatUsdcPrice, getContractAddress, weiToUsdc } from "@/lib/contracts";
import { CHAIN_CONFIG } from "@/lib/chains";
import { sdk } from "@/lib/sdk";
import { RFADetails } from "@/components/RFADetails";
import { AgentCard as SharedAgentCard } from "@/components/agent-card";
import {
  Box,
  Layers,
  Search,
  Sparkles,
  RefreshCw,
  DollarSign,
  Clock,
  Users,
  Zap,
  FileQuestion,
  Award,
  Package,
  Percent,
  Calendar,
  Target,
  ExternalLink,
  Bot,
} from "lucide-react";

export default function Market() {
  const [searchQuery, setSearchQuery] = useState("");
  // Defer search filtering so typing stays responsive (Fix 8)
  const deferredQuery = useDeferredValue(searchQuery);

  // Persisted tab state - survives browser back/forward navigation
  const [activeTab, setActiveTab] = useTabs("market", "agents");

  return (
    <div className="cm-market-workspace">
      {/* Page Header */}
      <div className="cm-page-header">
        <div className="cm-page-header__title-row">
          <h1 className="cm-page-header__title">
            <span className="text-fuchsia-500 mr-2">//</span>
            MARKET
          </h1>
          <div className="cm-page-header__rule hidden md:block"></div>
        </div>
        <p className="cm-page-header__subtitle">
          Discover workflows and RFA bounties on the Manowar protocol.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="cm-market-tabs w-full">
        <div className="cm-control-rail cm-market-control-rail">
          <div className="cm-market-control-rail__search relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search workflows, agents, and bounties..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim()) {
                  mpTrack("Search", { "Search Query": e.target.value.trim() });
                }
              }}
              className="pl-10 bg-background/50 border-primary/20 focus:border-cyan-500 font-mono text-sm"
            />
          </div>
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
              <FileQuestion className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">RFAs</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="agents" className="cm-market-tab-panel cm-market-tab-panel--agents mt-0">
          <AgentsTab searchQuery={deferredQuery} />
        </TabsContent>

        <TabsContent value="workflows" className="cm-market-tab-panel cm-market-tab-panel--scroll mt-0">
          <WorkflowsTab searchQuery={deferredQuery} />
        </TabsContent>

        <TabsContent value="rfas" className="cm-market-tab-panel cm-market-tab-panel--scroll mt-0">
          <RFAsTab searchQuery={deferredQuery} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Workflows Tab - Complete ERC7401 Workflows
// =============================================================================

function WorkflowsTab({ searchQuery }: { searchQuery: string }) {
  const [sort, setSort] = useState<"newest" | "price-low" | "price-high">("newest");
  const { data: workflows, isLoading, error, refetch } = useOnchainWorkflows({
    onlyComplete: true,
    includeRFA: false
  });

  // Filter and sort
  const filteredWorkflows = React.useMemo(() => {
    if (!workflows) return [];

    let filtered = workflows;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sort) {
        case "price-low":
          return parseFloat(a.totalPrice) - parseFloat(b.totalPrice);
        case "price-high":
          return parseFloat(b.totalPrice) - parseFloat(a.totalPrice);
        case "newest":
        default:
          // Sort by minting date (from IPFS metadata), newest first
          const aDate = a.metadata?.createdAt ? new Date(a.metadata.createdAt).getTime() : 0;
          const bDate = b.metadata?.createdAt ? new Date(b.metadata.createdAt).getTime() : 0;
          return bDate - aDate;
      }
    });

    return filtered;
  }, [workflows, searchQuery, sort]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="cm-filter-bar">
        <div className="cm-filter-bar__actions">
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full sm:w-[160px] bg-background/50 border-sidebar-border h-9 text-sm">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="cm-filter-bar__actions">
          {workflows && (
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
              {filteredWorkflows.length} workflows
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-sidebar-border h-9 w-9"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="cm-card-grid">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="glass-panel">
              <CardHeader className="pb-2">
                <Skeleton className="h-32 w-full rounded" />
                <Skeleton className="h-4 w-3/4 mt-4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-20">
          <Box className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400">{error.message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Workflows Grid */}
      {!isLoading && filteredWorkflows.length > 0 && (
        <div className="cm-card-grid">
          {filteredWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredWorkflows.length === 0 && !isLoading && (
        <div className="cm-empty-state-inline">
          <Layers className="cm-empty-state-inline__icon" />
          <p className="cm-empty-state-inline__text">
            {searchQuery ? "No workflows match your search" : "No workflows available yet"}
          </p>
          <Link href="/compose">
            <Button className="mt-4 bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-sm">
              CREATE FIRST WORKFLOW
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// Memoized card component to avoid re-renders when list changes (Fix 9)
const WorkflowCard = React.memo(function WorkflowCard({ workflow }: { workflow: OnchainWorkflow }) {
  const posthog = usePostHog();
  const bannerUrl = workflow.image && workflow.image.startsWith("ipfs://")
    ? getIpfsUrl(workflow.image.replace("ipfs://", ""))
    : null;

  const unitsAvailable = workflow.units === 0 ? "∞" : `${workflow.units - workflow.unitsMinted}/${workflow.units}`;

  // Use wallet address for navigation (primary), fallback to numeric ID
  const workflowPageUrl = workflow.walletAddress
    ? `/workflow/${workflow.walletAddress}`
    : `/workflow/${workflow.id}`;

  return (
    <Link href={workflowPageUrl} className="block">
      <Card
        className="glass-panel border-cyan-500/20 hover:border-cyan-500/60 transition-all duration-300 group overflow-hidden cursor-pointer"
      >
        {/* Banner */}
        <div className="h-28 sm:h-36 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 relative overflow-hidden">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt={workflow.title}
              width={400}
              height={144}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(6,182,212,0.1)_25%,rgba(6,182,212,0.1)_50%,transparent_50%,transparent_75%,rgba(6,182,212,0.1)_75%,rgba(6,182,212,0.1)_100%)] bg-[length:20px_20px]"></div>
              <Layers className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-500/30 absolute" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-2 right-2 flex gap-1">
            {/* Chain badge */}
            {workflow.metadata?.agents?.[0]?.chain && (() => {
              const chainId = workflow.metadata.agents[0].chain;
              const chainInfo = CHAIN_CONFIG[chainId];
              const colorClass = chainInfo?.color === 'red'
                ? 'border-red-500/30 text-red-400 bg-red-500/10'
                : 'border-blue-500/30 text-blue-400 bg-blue-500/10';
              return (
                <Badge variant="outline" className={`text-[8px] sm:text-[10px] ${colorClass}`}>
                  {chainInfo?.name || `Chain ${chainId}`}
                </Badge>
              );
            })()}
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[8px] sm:text-[10px]">
              <Sparkles className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
              ERC-7401
            </Badge>
          </div>

          {/* Lease badge */}
          {workflow.leaseEnabled && (
            <div className="absolute top-2 left-2">
              <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30 text-[8px] sm:text-[10px]">
                <Percent className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                Leaseable
              </Badge>
            </div>
          )}
        </div>

        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="text-base sm:text-lg font-display font-bold text-white group-hover:text-cyan-400 transition-colors truncate">
            {workflow.title || `Workflow #${workflow.id}`}
          </CardTitle>
          <CardDescription className="line-clamp-2 text-[10px] sm:text-xs h-7 sm:h-8">
            {workflow.description || "No description"}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Total Price</p>
              <div className="flex items-center gap-1">
                <DollarSign className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-400" />
                <span className="font-mono text-xs sm:text-sm text-green-400 truncate">{workflow.totalPrice} USDC</span>
              </div>
            </div>
            <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Agents</p>
              <div className="flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-cyan-400" />
                <span className="font-mono text-xs sm:text-sm text-cyan-400 truncate">{workflow.agentIds?.length || "?"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Supply</p>
              <div className="flex items-center gap-1">
                <Package className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-cyan-400" />
                <span className="font-mono text-xs sm:text-sm text-cyan-400">{unitsAvailable}</span>
              </div>
            </div>
            {workflow.leaseEnabled && (
              <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Lease</p>
                <div className="flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-fuchsia-400" />
                  <span className="font-mono text-[10px] sm:text-sm text-fuchsia-400 truncate">{workflow.leaseDuration}d @ {workflow.leasePercent}%</span>
                </div>
              </div>
            )}
            {workflow.coordinatorModel && (
              <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Coordinator</p>
                <div className="flex items-center gap-1">
                  <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
                  <span className="font-mono text-[10px] sm:text-sm text-amber-400 truncate">{workflow.coordinatorModel || "Active"}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="p-3 sm:p-4 pt-0 flex gap-2">
          <Button
            className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold font-mono text-[10px] sm:text-xs h-8 sm:h-9"
            onClick={(e) => {
              e.stopPropagation();
              posthog?.capture("market_workflow_purchase_clicked", {
                workflow_id: workflow.id,
                workflow_title: workflow.title,
                total_price: workflow.totalPrice,
                workflow_wallet: workflow.walletAddress,
              });
              mpTrack("Purchase", {
                transaction_id: `market_${workflow.id}`,
                revenue: Number(workflow.totalPrice) || 0,
                currency: "USDC",
              });
              /* TODO: Purchase */
            }}
          >
            <DollarSign className="w-3 h-3 mr-1" />
            PURCHASE
          </Button>
          <Button
            variant="outline"
            className="border-sidebar-border hover:border-cyan-500/50 h-8 sm:h-9 w-8 sm:w-9"
            onClick={(e) => {
              e.stopPropagation();
              const metadataChainId = workflow.metadata?.agents?.[0]?.chain;
              if (metadataChainId && CHAIN_CONFIG[metadataChainId]) {
                window.open(`${CHAIN_CONFIG[metadataChainId].explorer}/token/${getContractAddress("Workflow", metadataChainId)}?a=${workflow.id}`, "_blank");
              }
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
});

// =============================================================================
// RFAs Tab - Request-For-Agent Bounties
// =============================================================================

function RFAsTab({ searchQuery }: { searchQuery: string }) {
  // Use real RFA data from the contract
  const { data: rfas, isLoading, error, refetch } = useOpenRFAs();

  // State for RFA detail dialog
  const [selectedRfaId, setSelectedRfaId] = React.useState<number | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);

  // Filter and sort by newest
  const filteredRFAs = React.useMemo(() => {
    if (!rfas) return [];

    let filtered = rfas;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(rfa =>
        rfa.title.toLowerCase().includes(q) ||
        rfa.description.toLowerCase().includes(q)
      );
    }

    // Sort by createdAt (newest first)
    return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
  }, [rfas, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 sm:w-5 sm:h-5 text-fuchsia-400 shrink-0" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Submit an agent to claim RFA bounties
          </span>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2">
          {rfas && (
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs border-fuchsia-500/30 text-fuchsia-400">
              {filteredRFAs.length} active bounties
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-sidebar-border h-9 w-9"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-panel">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-20">
          <FileQuestion className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400">{error.message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* RFAs Grid */}
      {!isLoading && filteredRFAs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {filteredRFAs.map((rfa) => (
            <RFACard
              key={rfa.id}
              rfa={rfa}
              onViewDetails={() => {
                setSelectedRfaId(rfa.id);
                setShowDetails(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredRFAs.length === 0 && !isLoading && (
        <div className="text-center py-12 sm:py-20 border border-dashed border-sidebar-border rounded-lg">
          <FileQuestion className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm sm:text-base">
            {searchQuery ? "No RFAs match your search" : "No active bounties right now"}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-2 px-4">
            Create a workflow with missing agents to post an RFA
          </p>
        </div>
      )}

      {/* RFA Details Dialog */}
      <RFADetails
        rfaId={selectedRfaId}
        open={showDetails}
        onOpenChange={setShowDetails}
      />
    </div>
  );
}

// Memoized RFA card component
const RFACard = React.memo(function RFACard({
  rfa,
  onViewDetails
}: {
  rfa: OnchainRFA;
  onViewDetails: () => void;
}) {
  const posthog = usePostHog();

  // Calculate bounty breakdown
  const offerNum = parseFloat(rfa.offerAmount);
  const basicBounty = RFA_BOUNTY_LIMITS.BASIC_BOUNTY;
  const readmeBonus = Math.max(0, offerNum - basicBounty);

  // Format creation date
  const createdDate = new Date(rfa.createdAt * 1000);

  return (
    <Card className="glass-panel border-fuchsia-500/30 hover:border-fuchsia-500/60 transition-all duration-300 group">
      <CardHeader className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
              <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30 text-[8px] sm:text-[10px]">
                <Target className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                RFA #{rfa.id}
              </Badge>
              <Badge variant="outline" className="text-[8px] sm:text-[10px] border-green-500/30 text-green-400">
                <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                {rfa.status}
              </Badge>
            </div>
            <CardTitle className="text-base sm:text-lg font-display font-bold text-white group-hover:text-fuchsia-400 transition-colors truncate">
              {rfa.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2 text-[10px] sm:text-xs">
              {rfa.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
        {/* Bounty Info */}
        <div className="p-2.5 sm:p-3 bg-gradient-to-r from-fuchsia-500/10 to-transparent border border-fuchsia-500/20 rounded">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase mb-0.5 sm:mb-1">Bounty Reward</p>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fuchsia-400 shrink-0" />
                <span className="font-mono text-base sm:text-lg font-bold text-fuchsia-400">
                  {rfa.offerAmountFormatted}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase mb-0.5 sm:mb-1">Escrowed</p>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[8px] sm:text-xs">
                ✓ Secured
              </Badge>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-sidebar-border/50 text-[9px] text-muted-foreground">
            <span>Basic: ${basicBounty.toFixed(2)}</span>
            <span className="mx-1">+</span>
            <span className="text-cyan-400">README bonus: ${readmeBonus.toFixed(2)}</span>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
          <span>For: Workflow #{rfa.workflowId}</span>
          <span>{createdDate.toLocaleDateString()}</span>
        </div>
      </CardContent>

      <CardFooter className="p-3 sm:p-4 pt-0 flex flex-row gap-1.5 sm:gap-2">
        <Button
          onClick={() => {
            posthog?.capture("market_rfa_details_viewed", {
              rfa_id: rfa.id,
              rfa_title: rfa.title,
              offer_amount: rfa.offerAmount,
              workflow_id: rfa.workflowId,
            });
            onViewDetails();
          }}
          className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-bold font-mono text-[9px] sm:text-xs h-8 sm:h-9 px-2 sm:px-3 min-w-0"
        >
          <Award className="w-3 h-3 mr-0.5 sm:mr-1 shrink-0" />
          <span className="truncate">VIEW & SUBMIT</span>
        </Button>
        <Button
          variant="outline"
          className="border-sidebar-border hover:border-fuchsia-500/50 h-8 sm:h-9 text-[9px] sm:text-xs px-2 sm:px-3 shrink-0"
          onClick={onViewDetails}
        >
          <span className="truncate">Details</span>
        </Button>
      </CardFooter>
    </Card>
  );
});

// =============================================================================
// Agents Tab - Cloudflare-backed native agents, progressively loaded
// =============================================================================

const AGENTS_LIMIT = 24;

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

type AgentSort = "newest" | "price-low" | "price-high";

async function page(input: { cursor?: string; q?: string; sort?: AgentSort; signal?: AbortSignal }): Promise<AgentPage> {
  const params = new URLSearchParams({ limit: String(AGENTS_LIMIT) });
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

function AgentsTab({ searchQuery }: { searchQuery: string }) {
  const [sort, setSort] = useState<AgentSort>("newest");
  const [shown, setShown] = useState(120);
  const [, setLocation] = useLocation();
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const moreRef = React.useRef<HTMLDivElement | null>(null);
  const q = searchQuery.trim();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    error,
    refetch,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["agents", "market", q, q ? "relevance" : sort],
    queryFn: async ({ pageParam, signal }) => {
      const cursor = typeof pageParam === "string" ? pageParam : undefined;
      return await page({ cursor, q: q || undefined, sort: q ? undefined : sort, signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor ?? undefined : undefined,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const agents = React.useMemo(() => {
    const seen = new Set<string>();
    const out: OnchainAgent[] = [];
    for (const page of data?.pages || []) {
      for (const card of page.agents || []) {
        if (!card.walletAddress) continue;
        const key = card.walletAddress.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(agent(card));
      }
    }
    return out;
  }, [data]);

  const total = data?.pages[0]?.total ?? 0;
  const visibleAgents = agents.length > 120 ? agents.slice(0, shown) : agents;
  const canReveal = visibleAgents.length < agents.length;

  React.useEffect(() => {
    setShown(120);
  }, [q, sort]);

  React.useEffect(() => {
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
        void fetchNextPage();
      }
    }, { root, rootMargin: "640px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [agents.length, canReveal, fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="cm-market-agents">
      {/* Filters */}
      <div className="cm-control-rail cm-control-rail--compact">
        <div className="cm-control-rail__main">
          <Select value={sort} onValueChange={(v) => setSort(v as AgentSort)} disabled={Boolean(q)}>
            <SelectTrigger className="w-full sm:w-[170px] bg-background/50 border-primary/20 h-9 text-sm">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="cm-control-rail__actions">
          {data && (
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
              {q ? `${agents.length} results` : `${agents.length}/${total} agents`}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-primary/20 h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="cm-market-agent-canvas cm-market-agent-canvas--loading">
          <div className="cm-market-agent-grid">
          {[...Array(9)].map((_, i) => (
            <Card key={i} className="glass-panel cm-agent-card--market-full">
              <CardHeader className="pb-2">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-4 w-3/4 mt-4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-20">
          <Bot className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400">{error.message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Agents Grid */}
      {!isLoading && visibleAgents.length > 0 && (
        <div className="cm-market-agent-canvas" ref={canvasRef} aria-label="Agents">
          <div className="cm-market-agent-grid">
          {visibleAgents.map((agent) => {
            const agentPageUrl = agent.walletAddress
              ? `/agent/${agent.walletAddress}`
              : agent.id > 0 ? `/agent/${agent.id}` : "/agents";

            return (
              <div
                key={agent.walletAddress || `agent-${agent.id}`}
                className="cm-market-agent-slot [content-visibility:auto] [contain-intrinsic-size:360px]"
              >
                <SharedAgentCard
                  agent={agent}
                  className="cm-agent-card--market-full"
                  onOpen={() => setLocation(agentPageUrl)}
                />
              </div>
            );
          })}
          {(canReveal || hasNextPage) ? (
            <div ref={moreRef} className="cm-market-agent-more">
              <Button
                variant="outline"
                onClick={() => {
                  if (canReveal) {
                    setShown((value) => Math.min(value + 48, agents.length));
                  } else {
                    void fetchNextPage();
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

      {/* Empty State */}
      {agents.length === 0 && !isLoading && (
        <div className="text-center py-12 sm:py-20">
          <Bot className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm sm:text-base">
            {searchQuery ? "No agents match your search" : "No agents available yet"}
          </p>
        </div>
      )}
    </div>
  );
}
