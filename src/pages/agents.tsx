import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  Search, 
  Bot, 
  Layers, 
  Sparkles,
  Check,
  ExternalLink,
  Zap,
  Filter,
  Star,
  Activity,
  Shield,
  Globe
} from "lucide-react";
import { useAgents } from "@/hooks/use-agents";
import { 
  type Agent,
  type AgentRegistryId,
  AGENT_REGISTRIES,
  getEnabledRegistries,
  formatInteractions, 
  getReadmeExcerpt,
  COMMON_TAGS 
} from "@/lib/agents";

export default function AgentsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [selectedRegistries, setSelectedRegistries] = useState<AgentRegistryId[]>(getEnabledRegistries());
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useMemo(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error } = useAgents({
    search: debouncedSearch || undefined,
    tags: selectedTag !== "all" ? [selectedTag] : undefined,
    registries: selectedRegistries.length > 0 ? selectedRegistries : undefined,
    status: "active",
    limit: 60,
    sort: "interactions",
    direction: "desc",
  });

  const handleSelectAgent = (agent: Agent) => {
    // Store selected agent in sessionStorage and navigate back to compose
    sessionStorage.setItem("selectedAgent", JSON.stringify({
      id: agent.id,
      address: agent.address,
      name: agent.name,
      description: agent.description,
      protocols: agent.protocols,
      avatarUrl: agent.avatarUrl,
      category: agent.category,
      tags: agent.tags,
      registry: agent.registry,
    }));
    setLocation("/compose");
  };

  const toggleRegistry = (registryId: AgentRegistryId) => {
    setSelectedRegistries(prev => 
      prev.includes(registryId)
        ? prev.filter(r => r !== registryId)
        : [...prev, registryId]
    );
  };

  // Combine API tags with common tags for filter dropdown
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>(COMMON_TAGS);
    if (data?.tags) {
      data.tags.forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  }, [data?.tags]);

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 space-y-4 border-b border-sidebar-border pb-6">
        <Link href="/compose">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2 mb-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Compose
          </Button>
        </Link>
        
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-display font-bold text-white">
            <span className="text-fuchsia-500 mr-2">//</span>
            AGENT DISCOVERY
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-fuchsia-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-sm">
          Browse autonomous agents from multiple registries and ecosystems.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-8">
        {/* Registry Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <Label className="text-xs font-mono text-muted-foreground uppercase">Registries:</Label>
          {(Object.keys(AGENT_REGISTRIES) as AgentRegistryId[]).map((registryId) => {
            const registry = AGENT_REGISTRIES[registryId];
            const isEnabled = registry.enabled;
            const isSelected = selectedRegistries.includes(registryId);
            
            return (
              <div key={registryId} className="flex items-center gap-2">
                <Checkbox
                  id={`registry-${registryId}`}
                  checked={isSelected}
                  onCheckedChange={() => isEnabled && toggleRegistry(registryId)}
                  disabled={!isEnabled}
                  className="border-sidebar-border data-[state=checked]:bg-fuchsia-500 data-[state=checked]:border-fuchsia-500"
                />
                <Label 
                  htmlFor={`registry-${registryId}`}
                  className={`text-sm font-mono cursor-pointer ${
                    !isEnabled 
                      ? "text-muted-foreground/50 cursor-not-allowed" 
                      : isSelected 
                        ? "text-fuchsia-400" 
                        : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {registry.name}
                  {!isEnabled && <span className="ml-1 text-[10px]">(soon)</span>}
                </Label>
              </div>
            );
          })}
        </div>

        {/* Search and Tag Filter */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-background/50 border-sidebar-border focus:border-fuchsia-500 font-mono"
            />
          </div>
          
          <div className="flex gap-4">
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-[220px] bg-background/50 border-sidebar-border">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {availableTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {data && !isLoading && (
        <div className="flex items-center gap-6 mb-6 text-sm font-mono text-muted-foreground">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-fuchsia-400" />
            <span>{data.agents.length} agents found</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>{data.registries.length} {data.registries.length === 1 ? "registry" : "registries"}</span>
          </div>
          {data.total > data.agents.length && (
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              <span>{data.total.toLocaleString()} total available</span>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-6 rounded-sm border border-red-500/30 bg-red-500/10 text-red-400">
          <p className="font-mono text-sm">Failed to load agents. Please try again.</p>
          <p className="font-mono text-xs mt-2 opacity-70">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="bg-background border-sidebar-border">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-12 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Agents Grid */}
      {data && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onSelect={handleSelectAgent} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {data && data.agents.length === 0 && !isLoading && (
        <div className="text-center py-16 space-y-4">
          <Bot className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground font-mono">No agents found matching your criteria.</p>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setSelectedTag("all");
              setSelectedRegistries(getEnabledRegistries());
            }}
            className="border-sidebar-border"
          >
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, onSelect }: { agent: Agent; onSelect: (a: Agent) => void }) {
  const excerpt = agent.description || (agent.readme ? getReadmeExcerpt(agent.readme, 100) : "");
  const initials = agent.name
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  
  const registryInfo = AGENT_REGISTRIES[agent.registry];
  
  return (
    <Card className="group bg-background border-sidebar-border hover:border-fuchsia-500/50 transition-all duration-300 corner-decoration overflow-hidden">
      <CardContent className="p-5 space-y-4">
        {/* Header with Avatar */}
        <div className="flex items-start gap-3">
          <Avatar className="w-12 h-12 border-2 border-sidebar-border group-hover:border-fuchsia-500/50 transition-colors">
            <AvatarImage src={agent.avatarUrl || undefined} alt={agent.name} />
            <AvatarFallback className="bg-fuchsia-500/10 text-fuchsia-400 font-mono text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-bold text-foreground truncate group-hover:text-fuchsia-400 transition-colors">
                {agent.name}
              </h3>
              {agent.externalUrl && (
                <a
                  href={agent.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-muted-foreground hover:text-fuchsia-400 transition-colors shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground truncate">
              {registryInfo?.name || agent.registry}
            </p>
          </div>
        </div>

        {/* Description */}
        {excerpt && (
          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {excerpt}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {agent.verified && (
            <Badge variant="outline" className="text-[10px] font-mono border-green-500/30 text-green-400 bg-green-500/10 px-1.5 py-0">
              <Shield className="w-2.5 h-2.5 mr-1" />
              verified
            </Badge>
          )}
          {agent.featured && (
            <Badge variant="outline" className="text-[10px] font-mono border-yellow-500/30 text-yellow-400 bg-yellow-500/10 px-1.5 py-0">
              <Star className="w-2.5 h-2.5 mr-1" />
              featured
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] font-mono border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10 px-1.5 py-0">
            {agent.category}
          </Badge>
          {agent.type === "hosted" && (
            <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/30 text-cyan-400 bg-cyan-500/10 px-1.5 py-0">
              hosted
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-green-400" />
            <span>{formatInteractions(agent.totalInteractions)} uses</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Star className="w-3.5 h-3.5 text-yellow-400" />
            <span>{agent.rating.toFixed(1)} rating</span>
          </div>
        </div>

        {/* Select Button */}
        <Button
          onClick={() => onSelect(agent)}
          className="w-full bg-sidebar-accent border border-sidebar-border text-foreground hover:border-fuchsia-500 hover:text-fuchsia-400 font-mono text-sm transition-colors group-hover:bg-fuchsia-500/10"
        >
          <Check className="w-4 h-4 mr-2" />
          SELECT AGENT
        </Button>
      </CardContent>
    </Card>
  );
}

