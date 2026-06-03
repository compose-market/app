import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ChevronDown, X, Loader2, RefreshCw } from "lucide-react";
import { ShellCommandItem, ShellModelBadge } from "@compose-market/theme/shell";
import { useModels } from "@/hooks/use-model";
import { formatModelTypeLabel, getPrimaryModelType } from "@/lib/models";

interface ModelSelectorProps {
    value: string;
    onChange: (modelId: string) => void;
    placeholder?: string;
    disabled?: boolean;
    showTypeFilter?: boolean;
    showRefresh?: boolean;
    className?: string;
    type?: string;
    provider?: string;
}

export function ModelSelector({
    value,
    onChange,
    placeholder = "Select a model...",
    disabled = false,
    showTypeFilter = true,
    showRefresh = false,
    className,
    type,
    provider,
}: ModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedType, setSelectedType] = useState("all");

    const {
        models,
        isLoading,
        isRefetching,
        error,
        forceRefresh,
        typeCategories,
    } = useModels({
        type,
        provider,
    });

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const filteredModels = useMemo(() => {
        return models.filter((model) => {
            const modelType = getPrimaryModelType(model);
            if (selectedType !== "all" && modelType !== selectedType) {
                return false;
            }

            if (!debouncedSearch) {
                return true;
            }

            const query = debouncedSearch.toLowerCase();
            return model.modelId.toLowerCase().includes(query)
                || (model.name || "").toLowerCase().includes(query)
                || model.provider.toLowerCase().includes(query)
                || modelType.toLowerCase().includes(query);
        });
    }, [debouncedSearch, models, selectedType]);

    const selectedModel = useMemo(
        () => models.find((model) => model.modelId === value) || null,
        [models, value],
    );

    const handleSelect = useCallback((modelId: string) => {
        onChange(modelId);
        setOpen(false);
        setSearchQuery("");
    }, [onChange]);

    const handleRefresh = useCallback(async (event: React.MouseEvent) => {
        event.stopPropagation();
        await forceRefresh();
    }, [forceRefresh]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <ShellModelBadge
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled || isLoading}
                    className={`w-full max-w-full justify-between ${className ?? ""}`}
                    placeholder={!selectedModel}
                    label={
                        isLoading
                            ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading models...
                                </span>
                            )
                            : selectedModel
                                ? selectedModel.name || selectedModel.modelId
                                : placeholder
                    }
                    price={selectedModel ? formatModelTypeLabel(getPrimaryModelType(selectedModel)) : undefined}
                    shortcut={<ChevronDown className="h-4 w-4" />}
                />
            </PopoverTrigger>
            <PopoverContent className="cm-command-panel w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
                <div className="cm-command-header space-y-2">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search models..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="cm-command-input h-8 pl-8 text-sm"
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
                        {showRefresh && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRefresh}
                                disabled={isRefetching}
                                className="h-8 w-8 shrink-0"
                                title="Refresh models"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
                            </Button>
                        )}
                    </div>

                    {showTypeFilter && typeCategories.length > 1 && (
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger className="cm-form-select h-8 text-xs">
                                <SelectValue placeholder="Filter by type" />
                            </SelectTrigger>
                            <SelectContent>
                                {typeCategories.map((category) => (
                                    <SelectItem key={category.id} value={category.id} className="text-xs">
                                        {category.label} ({category.count})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                <ScrollArea className="cm-command-list h-[300px]">
                    {error ? (
                        <div className="p-4 text-center text-sm text-destructive">{error.message}</div>
                    ) : filteredModels.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            {models.length === 0 ? "No models available" : "No models match your search"}
                        </div>
                    ) : (
                        <div className="p-1">
                            {filteredModels.slice(0, 100).map((model) => {
                                const modelType = getPrimaryModelType(model);

                                return (
                                    <ShellCommandItem
                                        key={model.modelId}
                                        onClick={() => handleSelect(model.modelId)}
                                        selected={value === model.modelId}
                                        className="w-full text-left"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="cm-command-item__name">{model.name || model.modelId}</span>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Badge variant="secondary" className="cm-command-item__provider text-[8px] px-1">
                                                    {model.provider}
                                                </Badge>
                                                <Badge variant="outline" className="cm-command-item__type text-[9px]">
                                                    {formatModelTypeLabel(modelType)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                            {model.modelId}
                                        </p>
                                    </ShellCommandItem>
                                );
                            })}
                            {filteredModels.length > 100 && (
                                <p className="text-center text-xs text-muted-foreground py-2">
                                    +{filteredModels.length - 100} more models...
                                </p>
                            )}
                        </div>
                    )}
                </ScrollArea>

                <div className="cm-command-footer justify-center text-center">
                    <p className="text-[10px] text-muted-foreground">
                        {filteredModels.length} of {models.length} models
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
}
