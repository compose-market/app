import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAvailableModels, type AIModel } from "@/lib/models";
import {
  ArrowLeft,
  Search,
  Cpu,
  Layers,
  Sparkles,
  Check,
  Zap,
  Filter,
  Globe
} from "lucide-react";

export default function ModelsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useMemo(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch all available models from our unified registry
  const { data: models = [], isLoading, error } = useQuery({
    queryKey: ["registry-models"],
    queryFn: fetchAvailableModels,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Extract unique tasks from models for filter
  const tasks = useMemo(() => {
    const taskSet = new Set<string>();
    models.forEach(m => {
      if (m.task) taskSet.add(m.task);
    });
    return Array.from(taskSet).sort();
  }, [models]);

  // Filter models locally
  const filteredModels = useMemo(() => {
    return models.filter(model => {
      // Task filter
      if (selectedTask !== "all" && model.task !== selectedTask) return false;

      // Search filter
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        return (
          model.id.toLowerCase().includes(q) ||
          model.name.toLowerCase().includes(q) ||
          model.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [models, selectedTask, debouncedSearch]);

  const handleSelectModel = (model: AIModel) => {
    sessionStorage.setItem("selectedHFModel", JSON.stringify({
      id: model.id,
      name: model.name,
      provider: model.source,
      priceMultiplier: 1.0, // Should be calculated from pricing if needed
      contextLength: model.contextLength || 0,
    }));
    setLocation("/create-agent");
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 space-y-4 border-b border-sidebar-border pb-6">
        <Link href="/create-agent">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-cyan-400 -ml-2 mb-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agent Creation
          </Button>
        </Link>

        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-display font-bold text-white">
            <span className="text-cyan-500 mr-2">//</span>
            MODEL DISCOVERY
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-cyan-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-sm">
          Browse deduplicated, inference-ready models from valid providers (ASI, Google, HF, etc).
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background/50 border-sidebar-border focus:border-cyan-500 font-mono"
          />
        </div>

        <div className="flex gap-4">
          <Select value={selectedTask} onValueChange={setSelectedTask}>
            <SelectTrigger className="w-[220px] bg-background/50 border-sidebar-border">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task} value={task}>
                  {task}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Bar */}
      {models.length > 0 && (
        <div className="flex items-center gap-6 mb-6 text-sm font-mono text-muted-foreground">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>{models.length} total models</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
            <span>{filteredModels.length} shown</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-6 rounded-sm border border-red-500/30 bg-red-500/10 text-red-400">
          <p className="font-mono text-sm">Failed to load models. Please try again.</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="bg-background border-sidebar-border">
              <CardContent className="p-5 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
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

      {/* Models Grid */}
      {!isLoading && filteredModels.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map((model) => (
            <ModelCard key={model.id} model={model} onSelect={handleSelectModel} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredModels.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <Cpu className="w-16 h-16 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground font-mono">No models found matching your criteria.</p>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setSelectedTask("all");
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

function ModelCard({ model, onSelect }: { model: AIModel; onSelect: (m: AIModel) => void }) {
  const [org, name] = model.id.includes("/") ? model.id.split("/") : ["", model.id];

  return (
    <Card className="group bg-background border-sidebar-border hover:border-cyan-500/50 transition-all duration-300 corner-decoration overflow-hidden">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-bold text-foreground truncate group-hover:text-cyan-400 transition-colors">
              {model.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <Globe className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs font-mono text-muted-foreground truncate">
                {model.source} / {org || model.ownedBy}
              </p>
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {model.task && (
            <Badge variant="outline" className="text-xs font-mono border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
              {model.task}
            </Badge>
          )}
        </div>

        {/* Specs */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-green-400" />
            <span>
              {model.pricing ? `$${model.pricing.input}/M` : "Free/Included"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>{model.contextLength ? `${Math.round(model.contextLength / 1000)}k ctx` : "Unknown ctx"}</span>
          </div>
        </div>

        {/* Select Button */}
        <Button
          onClick={() => onSelect(model)}
          className="w-full bg-sidebar-accent border border-sidebar-border text-foreground hover:border-cyan-500 hover:text-cyan-400 font-mono text-sm transition-colors group-hover:bg-cyan-500/10"
        >
          <Check className="w-4 h-4 mr-2" />
          SELECT MODEL
        </Button>
      </CardContent>
    </Card>
  );
}

