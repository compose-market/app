/**
 * Live Market Feed
 * 
 * Discover agents from Agentverse and MCP servers from the registry.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgents, type Agent } from "@/hooks/use-agents";
import { 
  useRegistryServers, 
  useRegistryCategories,
  type RegistryServer,
  getOriginLabel,
  isRemoteCapable,
  formatToolCount,
} from "@/hooks/use-registry";
import {
  Activity,
  Box,
  Cpu,
  Layers,
  Star,
  Terminal,
  User,
  Zap,
  Search,
  Loader2,
  Server,
  Sparkles,
  Cloud,
  Wrench,
  Github,
  ExternalLink,
  Filter,
  RefreshCw,
} from "lucide-react";
import { formatInteractions, getRatingColor } from "@/lib/agents";

export default function Market() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [agentSort, setAgentSort] = useState<"interactions" | "created-at" | "relevancy">("interactions");

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-2 border-b border-sidebar-border pb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-display font-bold text-white">
            <span className="text-fuchsia-500 mr-2">//</span>
            LIVE FEED
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-fuchsia-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-sm">
          Discover, connect, and compose with AI Agents & MCP Servers.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search agents and servers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-background/50 border-sidebar-border font-mono"
        />
      </div>

      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="bg-sidebar-accent border border-sidebar-border p-1 mb-8">
          <TabsTrigger 
            value="agents" 
            className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold font-mono tracking-wide px-8"
          >
            AGENTS
          </TabsTrigger>
          <TabsTrigger 
            value="servers" 
            className="data-[state=active]:bg-fuchsia-500 data-[state=active]:text-white font-bold font-mono tracking-wide px-8"
          >
            MCP SERVERS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-0">
          <AgentsTab 
            searchQuery={searchQuery} 
            sort={agentSort}
            onSortChange={setAgentSort}
          />
        </TabsContent>

        <TabsContent value="servers" className="mt-0">
          <ServersTab 
            searchQuery={searchQuery}
            category={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Agents Tab
// =============================================================================

function AgentsTab({ 
  searchQuery, 
  sort,
  onSortChange,
}: { 
  searchQuery: string; 
  sort: "interactions" | "created-at" | "relevancy";
  onSortChange: (sort: "interactions" | "created-at" | "relevancy") => void;
}) {
  const { data, isLoading, error, refetch } = useAgents({
    search: searchQuery || undefined,
    sort,
    direction: "desc",
    limit: 50,
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => onSortChange(v as typeof sort)}>
            <SelectTrigger className="w-[160px] bg-background/50 border-sidebar-border">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interactions">Most Used</SelectItem>
              <SelectItem value="created-at">Newest</SelectItem>
              <SelectItem value="relevancy">Relevance</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className="font-mono text-xs">
              {data.total} agents
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-sidebar-border"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
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

      {/* Agents Grid */}
      {data && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {data.agents.map((agent) => (
            <AgentCard key={agent.address} agent={agent} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {data?.agents.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <User className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {searchQuery ? "No agents match your search" : "No agents found"}
          </p>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const TypeIcon = agent.category === "finance" ? Activity : 
                   agent.category === "utility" ? Terminal :
                   agent.category === "social" ? User : Box;

  return (
    <div className="group relative bg-sidebar-accent/50 border border-sidebar-border hover:border-cyan-500/50 transition-all duration-300 backdrop-blur-sm overflow-hidden">
      {/* Card Header */}
      <div className="h-32 bg-background relative overflow-hidden border-b border-sidebar-border group-hover:border-cyan-500/30 transition-colors">
        <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity">
          <div className="w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(6,182,212,0.1)_25%,rgba(6,182,212,0.1)_50%,transparent_50%,transparent_75%,rgba(6,182,212,0.1)_75%,rgba(6,182,212,0.1)_100%)] bg-[length:20px_20px]"></div>
        </div>
        
        <div className="absolute inset-0 flex items-center justify-center">
          {agent.avatarUrl ? (
            <img 
              src={agent.avatarUrl} 
              alt={agent.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-sidebar-border"
            />
          ) : (
            <TypeIcon className="w-12 h-12 text-sidebar-border group-hover:text-cyan-400 transition-colors" />
          )}
        </div>

        <div className="absolute top-2 right-2 flex gap-1">
          {agent.verified && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
              ✓ Verified
            </Badge>
          )}
          {agent.featured && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
              ★ Featured
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-lg font-bold font-display text-foreground group-hover:text-cyan-400 transition-colors truncate">
            {agent.name}
          </h3>
          <p className="text-xs text-muted-foreground font-mono mt-1 line-clamp-2">
            {agent.description}
          </p>
        </div>

        {/* Protocols */}
        {agent.protocols.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.protocols.slice(0, 2).map((p) => (
              <Badge 
                key={p.name} 
                variant="outline" 
                className="text-[10px] border-cyan-500/30 text-cyan-400"
              >
                {p.name}
              </Badge>
            ))}
            {agent.protocols.length > 2 && (
              <Badge variant="outline" className="text-[10px]">
                +{agent.protocols.length - 2}
              </Badge>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-background border border-sidebar-border/50">
            <p className="text-[10px] text-muted-foreground uppercase">Rating</p>
            <div className="flex items-center gap-1">
              <Star className={`w-3 h-3 ${getRatingColor(agent.rating)} fill-current`} />
              <span className={`font-mono text-sm ${getRatingColor(agent.rating)}`}>
                {agent.rating.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="p-2 bg-background border border-sidebar-border/50">
            <p className="text-[10px] text-muted-foreground uppercase">Usage</p>
            <span className="font-mono text-sm text-cyan-400">
              {formatInteractions(agent.totalInteractions)}
            </span>
          </div>
        </div>

        <Button 
          className="w-full py-2 bg-sidebar-border hover:bg-cyan-600 hover:text-black text-xs font-bold font-mono uppercase tracking-wider transition-all border border-transparent hover:border-cyan-400"
          onClick={() => window.open(agent.externalUrl, "_blank")}
        >
          VIEW AGENT
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Servers Tab (MCP)
// =============================================================================

function ServersTab({ 
  searchQuery,
  category,
  onCategoryChange,
}: { 
  searchQuery: string;
  category: string;
  onCategoryChange: (cat: string) => void;
}) {
  const { data: categories } = useRegistryCategories();
  const { data, isLoading, error, refetch } = useRegistryServers({
    category: category === "all" ? undefined : category,
    limit: 50,
  });

  // Filter by search query client-side
  const filteredServers = data?.servers.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.namespace.toLowerCase().includes(q) ||
      s.tags.some((t) => t.includes(q))
    );
  }) || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-[160px] bg-background/50 border-sidebar-border">
              <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className="font-mono text-xs">
              {filteredServers.length} / {data.total} servers
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-sidebar-border"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Link href="/registry">
            <Button variant="outline" size="sm" className="border-sidebar-border">
              <ExternalLink className="w-4 h-4 mr-2" />
              Full Registry
            </Button>
          </Link>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="glass-panel">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-3/4" />
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
          <Server className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
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

      {/* Servers Grid */}
      {data && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServers.map((server) => (
            <McpServerCard key={server.registryId} server={server} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredServers.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <Server className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {searchQuery ? "No servers match your search" : "No servers found"}
          </p>
        </div>
      )}
    </div>
  );
}

function McpServerCard({ server }: { server: RegistryServer }) {
  const isInternal = server.origin === "internal";
  const isRemote = isRemoteCapable(server);

  return (
    <Card className="glass-panel border-fuchsia-500/20 hover:border-fuchsia-500/60 transition-all duration-300 group overflow-hidden">
      <CardHeader className="p-5 pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-sm flex items-center justify-center border ${
              isInternal 
                ? "bg-fuchsia-500/10 border-fuchsia-500/30" 
                : "bg-cyan-500/10 border-cyan-500/30"
            }`}>
              {isInternal ? (
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
              ) : (
                <Server className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <Badge 
              variant={isInternal ? "default" : "secondary"}
              className={`text-[10px] ${
                isInternal 
                  ? "bg-fuchsia-500/20 text-fuchsia-400" 
                  : "bg-cyan-500/20 text-cyan-400"
              }`}
            >
              {getOriginLabel(server.origin)}
            </Badge>
          </div>
          {isRemote && (
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">
              <Cloud className="w-2.5 h-2.5 mr-1" />
              Remote
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg font-display font-bold text-white group-hover:text-fuchsia-400 transition-colors mt-3">
          {server.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2 space-y-4">
        <CardDescription className="line-clamp-2 h-10">
          {server.description}
        </CardDescription>
        
        {/* Tools count and category */}
        <div className="flex flex-wrap gap-2">
          {server.category && (
            <Badge variant="outline" className="text-[10px] border-sidebar-border">
              {server.category}
            </Badge>
          )}
          {server.toolCount > 0 && (
            <Badge variant="outline" className="text-[10px] border-sidebar-border">
              <Wrench className="w-2.5 h-2.5 mr-1" />
              {formatToolCount(server.toolCount)}
            </Badge>
          )}
        </div>

        {/* Tags */}
        <div className="flex gap-1 overflow-hidden">
          {server.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[10px] text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      </CardContent>
      <CardFooter className="p-5 pt-0 flex items-center justify-between border-t border-white/5 mt-2 pt-4">
        <div className="flex gap-2">
          {server.repoUrl && (
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 px-2"
              onClick={() => window.open(server.repoUrl, "_blank")}
            >
              <Github className="w-4 h-4" />
            </Button>
          )}
        </div>
        <Link href={`/registry?id=${encodeURIComponent(server.registryId)}`}>
          <Button 
            size="sm" 
            className="bg-fuchsia-500 text-white hover:bg-fuchsia-600 font-bold font-mono"
          >
            ADD TO FLOW
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
