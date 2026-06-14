import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { usePostHog } from "@posthog/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Search,
  Bot,
  Layers,
  Sparkles,
  Filter,
  Globe,
} from "lucide-react";
import { useAgents } from "@/hooks/use-agents";
import { DiscoveryAgentCard, type DiscoveryAgent } from "@/components/agent-card";
import {
  type Agent,
  type AgentRegistryId,
  AGENT_REGISTRIES,
  getEnabledRegistries,
  COMMON_TAGS
} from "@/lib/agents";

export default function AgentsPage() {
  const [, setLocation] = useLocation();
  const posthog = usePostHog();
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [selectedRegistries, setSelectedRegistries] = useState<AgentRegistryId[]>(getEnabledRegistries());
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch external registry agents
  const { data, isLoading: isLoadingExternal, error } = useAgents({
    search: debouncedSearch || undefined,
    tags: selectedTag !== "all" ? [selectedTag] : undefined,
    registries: selectedRegistries.filter(r => r !== "manowar"),
    status: "active",
    limit: 60,
    sort: "interactions",
    direction: "desc",
  });

  const { data: native, isLoading: isLoadingNative } = useAgents({
    search: debouncedSearch || undefined,
    tags: selectedTag !== "all" ? [selectedTag] : undefined,
    registries: ["manowar"],
    status: "active",
    limit: 60,
    sort: "interactions",
    direction: "desc",
  });

  const manowarAgents = useMemo((): DiscoveryAgent[] => {
    if (!selectedRegistries.includes("manowar")) return [];
    return (native?.agents || []) as DiscoveryAgent[];
  }, [native?.agents, selectedRegistries]);

  // Merge agents from all sources
  const allAgents = useMemo(() => {
    const external = data?.agents || [];
    return [...manowarAgents, ...external];
  }, [data?.agents, manowarAgents]);

  const isLoading = isLoadingExternal || isLoadingNative;

  const handleSelectAgent = (agent: Agent) => {
    posthog?.capture("agent_selected", {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_registry: agent.registry,
      agent_category: agent.category,
    });
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
    <div className="cm-web-page">
      <div className="cm-web-page__canvas cm-workspace-canvas--fade">
        <div className="cm-web-page__body cm-web-page__body--wide cm-page-stack">
      {/* Header */}
      <div className="cm-page-stack__header space-y-3 sm:space-y-4 border-b border-sidebar-border pb-3 sm:pb-4">
        <Link href="/compose">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2 mb-2 text-xs sm:text-sm">
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            Back to Compose
          </Button>
        </Link>

        <div className="flex items-center gap-4">
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white">
            <span className="text-fuchsia-500 mr-2">//</span>
            AGENT DISCOVERY
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-fuchsia-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-xs sm:text-sm">
          Browse autonomous agents from multiple registries and ecosystems.
        </p>
      </div>

      {/* Filters */}
      <div className="cm-page-stack__controls">
      <div className="cm-control-rail cm-control-rail--compact flex flex-col gap-3 sm:gap-4">
        {/* Registry Filters */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4">
          <Label className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase shrink-0">Registries:</Label>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {(Object.keys(AGENT_REGISTRIES) as AgentRegistryId[]).map((registryId) => {
              const registry = AGENT_REGISTRIES[registryId];
              const isEnabled = registry.enabled;
              const isSelected = selectedRegistries.includes(registryId);

              return (
                <div key={registryId} className="flex items-center gap-1.5 sm:gap-2">
                  <Checkbox
                    id={`registry-${registryId}`}
                    checked={isSelected}
                    onCheckedChange={() => isEnabled && toggleRegistry(registryId)}
                    disabled={!isEnabled}
                    className="border-sidebar-border data-[state=checked]:bg-fuchsia-500 data-[state=checked]:border-fuchsia-500 w-4 h-4"
                  />
                  <Label
                    htmlFor={`registry-${registryId}`}
                    className={`text-xs sm:text-sm font-mono cursor-pointer ${!isEnabled
                      ? "text-muted-foreground/50 cursor-not-allowed"
                      : isSelected
                        ? "text-fuchsia-400"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {registry.name}
                    {!isEnabled && <span className="ml-1 text-[8px] sm:text-[10px]">(soon)</span>}
                  </Label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Search and Tag Filter */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-background/50 border-sidebar-border focus:border-fuchsia-500 font-mono text-sm h-9"
            />
          </div>

          <div className="flex gap-2 sm:gap-4">
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-full sm:w-[180px] lg:w-[220px] bg-background/50 border-sidebar-border h-9 text-sm">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-muted-foreground" />
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
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fuchsia-400" />
            <span>{allAgents.length} agents</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
            <span>{selectedRegistries.length} {selectedRegistries.length === 1 ? "registry" : "registries"}</span>
          </div>
          {manowarAgents.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              <span>{manowarAgents.length} on-chain</span>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 sm:p-6 rounded-sm border border-red-500/30 bg-red-500/10 text-red-400">
          <p className="font-mono text-xs sm:text-sm">Failed to load agents. Please try again.</p>
          <p className="font-mono text-[10px] sm:text-xs mt-2 opacity-70">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}
      </div>

      <div className="cm-page-list cm-workspace-canvas--fade">

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="bg-background border-sidebar-border">
              <CardContent className="p-4 sm:p-5 space-y-3 sm:space-y-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <Skeleton className="h-4 sm:h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-10 sm:h-12 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 sm:h-5 w-14 sm:w-16" />
                  <Skeleton className="h-4 sm:h-5 w-16 sm:w-20" />
                </div>
                <Skeleton className="h-8 sm:h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Agents Grid */}
      {!isLoading && allAgents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {allAgents.map((agent) => (
            <DiscoveryAgentCard key={agent.id} agent={agent} onSelect={handleSelectAgent} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {allAgents.length === 0 && !isLoading && (
        <div className="text-center py-8 sm:py-10 space-y-3">
          <Bot className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground font-mono text-sm">No agents found matching your criteria.</p>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setSelectedTag("all");
              setSelectedRegistries(getEnabledRegistries());
            }}
            className="border-sidebar-border text-sm"
          >
            Reset Filters
          </Button>
        </div>
      )}
      </div>
        </div>
      </div>
    </div>
  );
}
