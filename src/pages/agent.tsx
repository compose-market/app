/**
 * Agent Detail Page
 * 
 * Public endpoint for Manowar agents - A2A compatible.
 * Accessible at /agent/:id
 */
import { useParams } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useOnchainAgent } from "@/hooks/use-onchain";
import { getIpfsUrl } from "@/lib/pinata";
import { 
  ArrowLeft, 
  Copy, 
  ExternalLink,
  Sparkles,
  DollarSign,
  Package,
  Shield,
  Zap,
  Globe,
  Code,
  Link as LinkIcon,
  CheckCircle,
} from "lucide-react";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const agentId = params.id ? parseInt(params.id) : null;
  const { data: agent, isLoading, error } = useOnchainAgent(agentId);
  const { toast } = useToast();

  // Build the A2A-compatible endpoint URL
  const apiEndpoint = agentId 
    ? `https://api.compose.market/api/agent/${agentId}`
    : null;
  
  // Invoke endpoint for x402 calls
  const invokeEndpoint = agentId
    ? `https://api.compose.market/api/agent/${agentId}/invoke`
    : null;

  const copyEndpoint = () => {
    if (apiEndpoint) {
      navigator.clipboard.writeText(apiEndpoint);
      toast({
        title: "Copied!",
        description: "Agent endpoint copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <div className="mb-8">
          <Skeleton className="h-8 w-48" />
        </div>
        <Card className="glass-panel">
          <CardHeader>
            <Skeleton className="h-24 w-24 rounded-full mx-auto" />
            <Skeleton className="h-8 w-64 mx-auto mt-4" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>
        
        <div className="text-center py-20 border border-dashed border-red-500/30 rounded-lg">
          <Shield className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400 font-mono">Agent not found</p>
          <p className="text-muted-foreground text-sm mt-2">
            This agent may not exist or hasn't been minted yet.
          </p>
        </div>
      </div>
    );
  }

  const avatarUrl = agent.metadata?.avatar && agent.metadata.avatar !== "none" && agent.metadata.avatar.startsWith("ipfs://")
    ? getIpfsUrl(agent.metadata.avatar.replace("ipfs://", ""))
    : null;

  const initials = (agent.metadata?.name || `Agent ${agent.id}`)
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const unitsDisplay = agent.units === 0 ? "∞" : `${agent.unitsAvailable}/${agent.units}`;

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>
        
        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
          <Sparkles className="w-3 h-3 mr-1" />
          Manowar Agent #{agent.id}
        </Badge>
      </div>

      {/* Agent Card */}
      <Card className="glass-panel border-cyan-500/30 overflow-hidden">
        {/* Banner Area */}
        <div className="h-32 bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/10 to-transparent relative">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(6,182,212,0.1)_25%,rgba(6,182,212,0.1)_50%,transparent_50%,transparent_75%,rgba(6,182,212,0.1)_75%,rgba(6,182,212,0.1)_100%)] bg-[length:20px_20px]"></div>
        </div>

        {/* Avatar - overlapping */}
        <div className="-mt-16 flex justify-center relative z-10">
          <Avatar className="w-32 h-32 border-4 border-background shadow-xl">
            <AvatarImage src={avatarUrl || undefined} alt={agent.metadata?.name || `Agent ${agent.id}`} />
            <AvatarFallback className="bg-cyan-500/20 text-cyan-400 font-mono text-2xl">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        <CardHeader className="text-center pt-4">
          <CardTitle className="text-2xl font-display font-bold text-white">
            {agent.metadata?.name || `Agent #${agent.id}`}
          </CardTitle>
          <p className="text-muted-foreground font-mono text-sm mt-2">
            {agent.metadata?.description || "No description available"}
          </p>
          
          {/* Badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <CheckCircle className="w-3 h-3 mr-1" />
              On-Chain Verified
            </Badge>
            {agent.cloneable && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                Cloneable
              </Badge>
            )}
            {agent.isClone && (
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                Clone of #{agent.parentAgentId}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <DollarSign className="w-5 h-5 text-green-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Price</p>
              <p className="font-mono text-lg text-green-400">{agent.priceFormatted}</p>
            </div>
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <Package className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Supply</p>
              <p className="font-mono text-lg text-cyan-400">{unitsDisplay}</p>
            </div>
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <Zap className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Protocol</p>
              <p className="font-mono text-lg text-yellow-400">x402</p>
            </div>
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <Globe className="w-5 h-5 text-fuchsia-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Chain</p>
              <p className="font-mono text-lg text-fuchsia-400">Avalanche</p>
            </div>
          </div>

          {/* Skills/Tags */}
          {agent.metadata?.skills && agent.metadata.skills.length > 0 && (
            <div>
              <h3 className="text-sm font-mono text-muted-foreground uppercase mb-3">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {agent.metadata.skills.map((skill: string) => (
                  <Badge key={skill} variant="outline" className="border-sidebar-border">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* A2A Endpoints */}
          <div className="border-t border-sidebar-border pt-6 space-y-4">
            <h3 className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              A2A Endpoints (Global Access)
            </h3>
            
            {/* Agent Card Endpoint */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Agent Card (GET):</p>
              <div className="flex items-center gap-2 p-3 bg-background border border-sidebar-border rounded-lg font-mono text-sm">
                <Code className="w-4 h-4 text-muted-foreground shrink-0" />
                <code className="flex-1 truncate text-cyan-400">{apiEndpoint}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyEndpoint}
                  className="shrink-0 hover:text-cyan-400"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(apiEndpoint!, "_blank")}
                  className="shrink-0 hover:text-cyan-400"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Invoke Endpoint */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Invoke (POST with x402 payment):</p>
              <div className="flex items-center gap-2 p-3 bg-background border border-fuchsia-500/30 rounded-lg font-mono text-sm">
                <Zap className="w-4 h-4 text-fuchsia-400 shrink-0" />
                <code className="flex-1 truncate text-fuchsia-400">{invokeEndpoint}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (invokeEndpoint) {
                      navigator.clipboard.writeText(invokeEndpoint);
                      toast({
                        title: "Copied!",
                        description: "Invoke endpoint copied to clipboard",
                      });
                    }
                  }}
                  className="shrink-0 hover:text-fuchsia-400"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Use these endpoints to integrate this agent into any A2A-compatible system.
            </p>
          </div>

          {/* Creator Info */}
          <div className="border-t border-sidebar-border pt-6">
            <h3 className="text-sm font-mono text-muted-foreground uppercase mb-3">Creator</h3>
            <div className="flex items-center gap-2 font-mono text-sm">
              <LinkIcon className="w-4 h-4 text-muted-foreground" />
              <a 
                href={`https://testnet.snowtrace.io/address/${agent.creator}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fuchsia-400 hover:underline truncate"
              >
                {agent.creator}
              </a>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold font-mono">
              <DollarSign className="w-4 h-4 mr-2" />
              USE AGENT
            </Button>
            <Button
              variant="outline"
              className="border-sidebar-border"
              onClick={() => window.open(`https://testnet.snowtrace.io/token/${import.meta.env.VITE_AGENT_FACTORY_CONTRACT}?a=${agent.id}`, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View on Explorer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* JSON Preview */}
      <Card className="glass-panel mt-6">
        <CardHeader>
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Code className="w-4 h-4 text-cyan-400" />
            Agent Card (A2A Format)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="p-4 bg-background border border-sidebar-border rounded-lg overflow-x-auto text-xs font-mono text-muted-foreground">
            {JSON.stringify({
              schemaVersion: "1.0.0",
              agentId: agent.id,
              name: agent.metadata?.name || `Agent #${agent.id}`,
              description: agent.metadata?.description || "",
              skills: agent.metadata?.skills || [],
              avatar: agent.metadata?.avatar || "none",
              dnaHash: agent.dnaHash,
              chain: 43113,
              model: agent.metadata?.model || "unknown",
              price: agent.price,
              units: agent.units,
              cloneable: agent.cloneable,
              endpoint: apiEndpoint,
              invokeEndpoint: invokeEndpoint,
              protocols: [
                { name: "x402", version: "1.0" },
                { name: "a2a", version: "1.0" },
              ],
              registry: "manowar",
            }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

