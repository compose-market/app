/**
 * ModelSelector Component
 * 
 * Reusable model selector with task filtering and search.
 * Used in create-agent and warp-form pages.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ChevronDown, Sparkles, X, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "https://api.compose.market";

// =============================================================================
// Types
// =============================================================================

interface Model {
    id: string;
    name: string;
    task?: string;
    source?: string;
    ownedBy?: string;
}

interface TaskCategory {
    id: string;
    label: string;
    count: number;
}

interface ModelSelectorProps {
    value: string;
    onChange: (modelId: string) => void;
    placeholder?: string;
    disabled?: boolean;
    showTaskFilter?: boolean;
    className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTaskLabel(task: string): string {
    return task
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// =============================================================================
// Component
// =============================================================================

export function ModelSelector({
    value,
    onChange,
    placeholder = "Select a model...",
    disabled = false,
    showTaskFilter = true,
    className,
}: ModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [models, setModels] = useState<Model[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedTask, setSelectedTask] = useState("all");
    const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);

    // Fetch models on mount
    useEffect(() => {
        const fetchModels = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_URL}/api/registry/models/available`);
                if (!response.ok) throw new Error("Failed to fetch models");

                const data = await response.json() as { models: Model[] };
                const modelList = data.models || [];
                setModels(modelList);

                // Build task categories
                const taskCounts = new Map<string, number>();
                for (const model of modelList) {
                    const task = model.task || "other";
                    taskCounts.set(task, (taskCounts.get(task) || 0) + 1);
                }

                const categories: TaskCategory[] = Array.from(taskCounts.entries())
                    .map(([task, count]) => ({ id: task, label: formatTaskLabel(task), count }))
                    .sort((a, b) => b.count - a.count);

                setTaskCategories([
                    { id: "all", label: "All Tasks", count: modelList.length },
                    ...categories,
                ]);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load models");
            } finally {
                setLoading(false);
            }
        };

        fetchModels();
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Filter models
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
                    (model.source && model.source.toLowerCase().includes(q)) ||
                    (model.ownedBy && model.ownedBy.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [models, selectedTask, debouncedSearch]);

    // Get selected model info
    const selectedModel = useMemo(() => models.find(m => m.id === value), [models, value]);

    const handleSelect = useCallback((modelId: string) => {
        onChange(modelId);
        setOpen(false);
        setSearchQuery("");
    }, [onChange]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled || loading}
                    className={`w-full justify-between bg-background/50 border-sidebar-border hover:border-cyan-500/50 ${className}`}
                >
                    {loading ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading models...
                        </span>
                    ) : selectedModel ? (
                        <span className="flex items-center gap-2 truncate">
                            <span className="font-mono text-sm truncate">{selectedModel.name}</span>
                            {selectedModel.task && (
                                <Badge variant="outline" className="text-[9px] shrink-0">
                                    {formatTaskLabel(selectedModel.task)}
                                </Badge>
                            )}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
                <div className="p-2 border-b border-sidebar-border space-y-2">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search models..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 text-sm bg-background/50 border-sidebar-border"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Task Filter */}
                    {showTaskFilter && taskCategories.length > 1 && (
                        <Select value={selectedTask} onValueChange={setSelectedTask}>
                            <SelectTrigger className="h-8 text-xs bg-background/50 border-sidebar-border">
                                <SelectValue placeholder="Filter by task" />
                            </SelectTrigger>
                            <SelectContent>
                                {taskCategories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                        {cat.label} ({cat.count})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {/* Model List */}
                <ScrollArea className="h-[300px]">
                    {error ? (
                        <div className="p-4 text-center text-sm text-destructive">{error}</div>
                    ) : filteredModels.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            {models.length === 0 ? "No models available" : "No models match your search"}
                        </div>
                    ) : (
                        <div className="p-1">
                            {filteredModels.slice(0, 100).map(model => (
                                <button
                                    key={model.id}
                                    onClick={() => handleSelect(model.id)}
                                    className={`w-full text-left px-3 py-2 rounded-sm hover:bg-sidebar-accent transition-colors ${value === model.id ? "bg-cyan-500/10 border-l-2 border-cyan-500" : ""
                                        }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-sm truncate">{model.name}</span>
                                        {model.task && (
                                            <Badge variant="outline" className="text-[9px] shrink-0 border-sidebar-border">
                                                {formatTaskLabel(model.task)}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                        {model.id}
                                    </p>
                                </button>
                            ))}
                            {filteredModels.length > 100 && (
                                <p className="text-center text-xs text-muted-foreground py-2">
                                    +{filteredModels.length - 100} more models...
                                </p>
                            )}
                        </div>
                    )}
                </ScrollArea>

                {/* Footer */}
                <div className="p-2 border-t border-sidebar-border text-center">
                    <p className="text-[10px] text-muted-foreground">
                        {filteredModels.length} of {models.length} models
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
}
