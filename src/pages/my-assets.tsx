import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Users,
  Clock,
  Shield,
  ArrowRightLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccount } from "thirdweb/react";
import { useAgentsByCreator, useManowarsByCreator, type OnchainAgent, type OnchainManowar } from "@/hooks/use-onchain";
import { getIpfsUrl } from "@/lib/pinata";
import { CHAIN_CONFIG, CHAIN_IDS } from "@/lib/thirdweb";
import { getContractAddress } from "@/lib/contracts";

export default function MyAssetsPage() {
  const { toast } = useToast();
  const account = useActiveAccount();
  const [activeTab, setActiveTab] = useState("agents");

  const { data: agents, isLoading: isLoadingAgents } = useAgentsByCreator(account?.address);
  const { data: manowars, isLoading: isLoadingManowars } = useManowarsByCreator(account?.address);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast({ title: "Address copied!" });
  };

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <div className="mb-8 space-y-4 border-b border-sidebar-border pb-6">
          <h1 className="text-2xl font-display font-bold text-white">
            <span className="text-cyan-500 mr-2">//</span>
            MY ASSETS
          </h1>
          <p className="text-muted-foreground font-mono text-sm">
            View and manage your on-chain agents and workflows.
          </p>
        </div>

        <Card className="bg-background border-sidebar-border">
          <CardContent className="p-12 text-center space-y-4">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground/50" />
            <h2 className="text-xl font-display text-foreground">Sign In Required</h2>
            <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto">
              Connect with email, social, or wallet to view your on-chain assets.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = isLoadingAgents || isLoadingManowars;
  const agentCount = agents?.length || 0;
  const manowarCount = manowars?.length || 0;

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 space-y-4 border-b border-sidebar-border pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              <span className="text-cyan-500 mr-2">//</span>
              MY ASSETS
            </h1>
            <p className="text-muted-foreground font-mono text-sm mt-1">
              Manage your on-chain agents and Manowar workflows.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/create-agent">
              <Button className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold font-mono">
                <Plus className="w-4 h-4 mr-2" />
                CREATE AGENT
              </Button>
            </Link>
          </div>
        </div>

        {/* Account Info */}
        <div className="flex items-center gap-4 p-4 rounded-sm bg-sidebar-accent border border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="font-mono text-sm text-foreground">
                {account.address.slice(0, 6)}...{account.address.slice(-4)}
              </p>
              <p className="text-xs text-muted-foreground">Avalanche Fuji</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyAddress(account.address)}
            className="text-muted-foreground hover:text-cyan-400"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <div className="ml-auto flex items-center gap-6 text-sm font-mono">
            <div className="text-center">
              <p className="text-cyan-400 font-bold">{agentCount}</p>
              <p className="text-muted-foreground text-xs">Agents</p>
            </div>
            <div className="text-center">
              <p className="text-fuchsia-400 font-bold">{manowarCount}</p>
              <p className="text-muted-foreground text-xs">Workflows</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-sidebar-accent border border-sidebar-border p-1">
          <TabsTrigger 
            value="agents" 
            className="font-mono data-[state=active]:bg-cyan-500 data-[state=active]:text-black"
          >
            <Bot className="w-4 h-4 mr-2" />
            AGENTS ({agentCount})
          </TabsTrigger>
          <TabsTrigger 
            value="workflows" 
            className="font-mono data-[state=active]:bg-fuchsia-500 data-[state=active]:text-black"
          >
            <Layers className="w-4 h-4 mr-2" />
            WORKFLOWS ({manowarCount})
          </TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {isLoadingAgents && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="bg-background border-sidebar-border">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoadingAgents && agents && agents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents.map((agent) => (
                <AgentAssetCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}

          {!isLoadingAgents && (!agents || agents.length === 0) && (
            <Card className="bg-background border-sidebar-border">
              <CardContent className="p-12 text-center space-y-4">
                <Bot className="w-16 h-16 mx-auto text-muted-foreground/50" />
                <h3 className="text-lg font-display text-foreground">No Agents Yet</h3>
                <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto">
                  Create your first ERC8004 agent to start earning from AI workflows.
                </p>
                <Link href="/create-agent">
                  <Button className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold font-mono">
                    <Plus className="w-4 h-4 mr-2" />
                    CREATE AGENT
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          {isLoadingManowars && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="bg-background border-sidebar-border">
                  <CardContent className="p-5 space-y-4">
                    <Skeleton className="h-32 w-full rounded-sm" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoadingManowars && manowars && manowars.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {manowars.map((manowar) => (
                <ManowarAssetCard key={manowar.id} manowar={manowar} />
              ))}
            </div>
          )}

          {!isLoadingManowars && (!manowars || manowars.length === 0) && (
            <Card className="bg-background border-sidebar-border">
              <CardContent className="p-12 text-center space-y-4">
                <Layers className="w-16 h-16 mx-auto text-muted-foreground/50" />
                <h3 className="text-lg font-display text-foreground">No Workflows Yet</h3>
                <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto">
                  Compose your first Manowar workflow by combining multiple agents.
                </p>
                <Link href="/compose">
                  <Button className="bg-fuchsia-500 text-white hover:bg-fuchsia-400 font-bold font-mono">
                    <Layers className="w-4 h-4 mr-2" />
                    START COMPOSING
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgentAssetCard({ agent }: { agent: OnchainAgent }) {
  const metadata = agent.metadata;
  const name = metadata?.name || `Agent #${agent.id}`;
  const description = metadata?.description || "No description available";
  
  let avatarUrl: string | null = null;
  if (metadata?.avatar && metadata.avatar !== "none") {
    // Handle both gateway URLs (https://) and IPFS URIs (ipfs://)
    if (metadata.avatar.startsWith("ipfs://")) {
      avatarUrl = getIpfsUrl(metadata.avatar.replace("ipfs://", ""));
    } else if (metadata.avatar.startsWith("https://")) {
      avatarUrl = metadata.avatar;
    }
  }

  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const explorerUrl = `${CHAIN_CONFIG[CHAIN_IDS.avalancheFuji].explorer}/token/${getContractAddress("AgentFactory")}?a=${agent.id}`;
  
  // Agent page URL using wallet address (primary) or ID (fallback)
  const agentPageUrl = agent.walletAddress 
    ? `/agent/${agent.walletAddress}`
    : `/agent/${agent.id}`;

  return (
    <Card 
      className="bg-background border-sidebar-border hover:border-cyan-500/50 transition-colors cursor-pointer group"
      onClick={() => window.location.href = agentPageUrl}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Avatar className="w-12 h-12 border-2 border-cyan-500/30 group-hover:border-cyan-500/60 transition-colors">
            <AvatarImage src={avatarUrl || undefined} alt={name} />
            <AvatarFallback className="bg-cyan-500/10 text-cyan-400 font-mono text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-bold text-foreground truncate group-hover:text-cyan-400 transition-colors">
                {name}
              </h3>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-muted-foreground hover:text-cyan-400 transition-colors shrink-0"
                title="View on explorer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-xs font-mono text-muted-foreground">
              Agent #{agent.id} • ERC8004
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {description}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/30 text-cyan-400 bg-cyan-500/10 px-1.5 py-0">
            <Sparkles className="w-2.5 h-2.5 mr-1" />
            on-chain
          </Badge>
          {agent.isWarped && (
            <Badge variant="outline" className="text-[10px] font-mono border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10 px-1.5 py-0">
              <ArrowRightLeft className="w-2.5 h-2.5 mr-1" />
              warped
            </Badge>
          )}
          {agent.cloneable && (
            <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-400 bg-purple-500/10 px-1.5 py-0">
              cloneable
            </Badge>
          )}
          {agent.isClone && (
            <Badge variant="outline" className="text-[10px] font-mono border-orange-500/30 text-orange-400 bg-orange-500/10 px-1.5 py-0">
              clone #{agent.parentAgentId}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs font-mono">
          <div className="text-center p-2 rounded-sm bg-sidebar-accent">
            <DollarSign className="w-3.5 h-3.5 mx-auto mb-1 text-green-400" />
            <p className="text-foreground font-bold">{agent.priceFormatted}</p>
            <p className="text-muted-foreground text-[10px]">per use</p>
          </div>
          <div className="text-center p-2 rounded-sm bg-sidebar-accent">
            <Users className="w-3.5 h-3.5 mx-auto mb-1 text-cyan-400" />
            <p className="text-foreground font-bold">{agent.unitsMinted}</p>
            <p className="text-muted-foreground text-[10px]">minted</p>
          </div>
          <div className="text-center p-2 rounded-sm bg-sidebar-accent">
            <Zap className="w-3.5 h-3.5 mx-auto mb-1 text-fuchsia-400" />
            <p className="text-foreground font-bold">
              {agent.units === 0 ? "∞" : agent.unitsAvailable}
            </p>
            <p className="text-muted-foreground text-[10px]">available</p>
          </div>
        </div>

        {/* Global API Endpoint */}
        {agent.walletAddress && (
          <div className="pt-2 border-t border-sidebar-border">
            <p className="text-[10px] text-muted-foreground mb-1">API Endpoint</p>
            <code className="text-[10px] font-mono text-cyan-400 break-all block bg-sidebar-accent/50 p-1.5 rounded">
              api.compose.market/agent/{agent.walletAddress.slice(0, 8)}...
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManowarAssetCard({ manowar }: { manowar: OnchainManowar }) {
  let bannerUrl: string | null = null;
  if (manowar.banner && manowar.banner.startsWith("ipfs://")) {
    bannerUrl = getIpfsUrl(manowar.banner.replace("ipfs://", ""));
  }

  const explorerUrl = `${CHAIN_CONFIG[CHAIN_IDS.avalancheFuji].explorer}/token/${getContractAddress("Manowar")}?a=${manowar.id}`;

  return (
    <Card className="bg-background border-sidebar-border hover:border-fuchsia-500/50 transition-colors overflow-hidden">
      {/* Banner */}
      {bannerUrl ? (
        <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${bannerUrl})` }} />
      ) : (
        <div className="h-32 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center">
          <Layers className="w-12 h-12 text-fuchsia-400/50" />
        </div>
      )}

      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-foreground">
              {manowar.title || `Workflow #${manowar.id}`}
            </h3>
            <p className="text-xs font-mono text-muted-foreground">
              Manowar #{manowar.id} • ERC7401
            </p>
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-muted-foreground hover:text-fuchsia-400 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {manowar.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {manowar.description}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] font-mono border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10 px-1.5 py-0">
            <Sparkles className="w-2.5 h-2.5 mr-1" />
            nestable NFT
          </Badge>
          {manowar.leaseEnabled && (
            <Badge variant="outline" className="text-[10px] font-mono border-green-500/30 text-green-400 bg-green-500/10 px-1.5 py-0">
              <Clock className="w-2.5 h-2.5 mr-1" />
              leasable ({manowar.leasePercent}%)
            </Badge>
          )}
          {manowar.hasActiveRfa && (
            <Badge variant="outline" className="text-[10px] font-mono border-yellow-500/30 text-yellow-400 bg-yellow-500/10 px-1.5 py-0">
              active RFA
            </Badge>
          )}
          {manowar.coordinatorModel && (
            <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-400 bg-purple-500/10 px-1.5 py-0">
              + coordinator
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs font-mono">
          <div className="text-center p-2 rounded-sm bg-sidebar-accent">
            <DollarSign className="w-3.5 h-3.5 mx-auto mb-1 text-green-400" />
            <p className="text-foreground font-bold">${manowar.x402Price}</p>
            <p className="text-muted-foreground text-[10px]">per use</p>
          </div>
          <div className="text-center p-2 rounded-sm bg-sidebar-accent">
            <DollarSign className="w-3.5 h-3.5 mx-auto mb-1 text-cyan-400" />
            <p className="text-foreground font-bold">${manowar.totalPrice}</p>
            <p className="text-muted-foreground text-[10px]">total value</p>
          </div>
          <div className="text-center p-2 rounded-sm bg-sidebar-accent">
            <Zap className="w-3.5 h-3.5 mx-auto mb-1 text-fuchsia-400" />
            <p className="text-foreground font-bold">
              {manowar.units === 0 ? "∞" : manowar.units - manowar.unitsMinted}
            </p>
            <p className="text-muted-foreground text-[10px]">available</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}



