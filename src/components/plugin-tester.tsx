/**
 * Plugin Tester Component
 *
 * Unified testing interface for onchain and tools connectors.
 * Catalog reads go to the connectors broker
 * (https://connectors.compose.market). Execution routes through api/ for
 * x402 payment handling.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useActiveWallet } from "thirdweb/react";
import { sdk } from "@/lib/sdk";
import { useChain } from "@/contexts/ChainContext";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useRegistryMeta, useRegistrySearch, useRegistryServers } from "@/hooks/use-registry";
import { normalizeConnectorBinding } from "@/lib/connectors";
import {
    Loader2,
    RefreshCw,
    Trash2,
    Plug,
    Play,
    Terminal,
    AlertCircle,
    ExternalLink,
    ChevronsUpDown,
    Check,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface GoatTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    pluginId: string;
}

interface PluginInfo {
    id: string;
    name: string;
    description: string;
    toolCount: number;
    requiresApiKey?: boolean;
    apiKeyConfigured?: boolean;
    tools: GoatTool[];
}

interface PluginResult {
    success: boolean;
    pluginId: string;
    tool: string;
    result?: unknown;
    error?: string;
    txHash?: string;
    explorer?: string;
    executedBy?: string;
    source?: "onchain" | "tools";
    executionTime?: number;
}

interface GoatStatus {
    initialized: boolean;
    walletAddress: string | null;
    chain: string | null;
    chainId: number | null;
    rpcUrl: string | null;
    error: string | null;
    totalTools: number;
    plugins: PluginInfo[];
}

interface OnchainResponse {
    plugins: PluginInfo[];
    status: {
        initialized: boolean;
        walletAddress: string | null;
        chain: string;
        chainId: number;
        rpcUrl: string | null;
        error: string | null;
        totalTools: number;
    };
}

interface McpTool {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

interface McpServerCard {
    slug: string;
    name: string;
    description: string;
    status: "live" | "credential_gated";
    tools: McpTool[];
    credentials: Array<{ varName: string; description?: string | null; obtainUrl?: string | null }>;
}

type PluginSource = "onchain" | "tools";

const CONNECTORS_URL = (import.meta.env.VITE_CONNECTORS_URL || "https://connectors.compose.market").replace(/\/+$/, "");

// =============================================================================
// Helpers
// =============================================================================

function generateDefaultArgs(schema: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const props = (schema as { properties?: Record<string, { type?: string; default?: unknown; description?: string }> }).properties;
    if (!props) return result;

    for (const [key, prop] of Object.entries(props)) {
        if (prop.default !== undefined) {
            result[key] = prop.default;
        } else if (prop.type === "string") {
            if (key.toLowerCase().includes("address")) {
                result[key] = "0x...";
            } else if (key.toLowerCase().includes("amount")) {
                result[key] = "0";
            } else {
                result[key] = "";
            }
        } else if (prop.type === "number" || prop.type === "integer") {
            result[key] = 0;
        } else if (prop.type === "boolean") {
            result[key] = false;
        } else if (prop.type === "array") {
            result[key] = [];
        } else if (prop.type === "object") {
            result[key] = {};
        }
    }
    return result;
}

function normalizePluginSlug(value: string, source: PluginSource): string {
    if (!value) return "";
    return normalizeConnectorBinding(value, { defaultOrigin: source }).slug;
}

function formatSchemaHint(schema: Record<string, unknown>): string {
    const props = (schema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
    const required = (schema as { required?: string[] }).required || [];
    if (!props) return "No parameters required";

    const lines: string[] = [];
    for (const [key, prop] of Object.entries(props)) {
        const isRequired = required.includes(key);
        const desc = prop.description || "";
        lines.push(`• ${key}${isRequired ? " *" : ""} (${prop.type || "any"}): ${desc}`);
    }
    return lines.join("\n");
}

// =============================================================================
// Props
// =============================================================================

export interface PluginTesterProps {
    sessionActive: boolean;
    budgetRemaining: number;
    formatBudget: (n: number) => string;
    /** Initial source from URL params */
    initialSource?: PluginSource;
    /** Initial plugin/server from URL params */
    initialPlugin?: string;
}

// =============================================================================
// Component
// =============================================================================

export function PluginTester({
    sessionActive,
    budgetRemaining,
    formatBudget,
    initialSource = "tools",
    initialPlugin = "",
}: PluginTesterProps) {
    const wallet = useActiveWallet();
    const { paymentChainId } = useChain();
    const { composeKeyToken, ensureComposeKeyToken } = useSession();
    const resultsEndRef = useRef<HTMLDivElement>(null);

    // Common state
    const [pluginSource, setPluginSource] = useState<PluginSource>(initialSource);
    const [pluginsLoading, setPluginsLoading] = useState(false);
    const [selectedTool, setSelectedTool] = useState<string>("");
    const [toolArgs, setToolArgs] = useState<string>("{}");
    const [toolSchema, setToolSchema] = useState<Record<string, unknown> | null>(null);
    const [pluginResults, setPluginResults] = useState<PluginResult[]>([]);
    const [executingPlugin, setExecutingPlugin] = useState(false);
    const [pluginError, setPluginError] = useState<string | null>(null);

    // Onchain state
    const [goatStatus, setGoatStatus] = useState<GoatStatus | null>(null);
    const [pluginTools, setPluginTools] = useState<GoatTool[]>([]);
    const [selectedPlugin, setSelectedPlugin] = useState<string>(
        initialSource === "onchain" ? normalizePluginSlug(initialPlugin, "onchain") : ""
    );

    // Tools state
    const [mcpServerPickerOpen, setMcpServerPickerOpen] = useState(false);
    const mcpRegistryOptions = useMemo(() => ({
        origin: "tools" as const,
        limit: 50,
        offset: 0,
        enabled: pluginSource === "tools" && mcpServerPickerOpen,
    }), [mcpServerPickerOpen, pluginSource]);
    const { data: mcpRegistryData, isLoading: mcpLoading, forceRefresh: forceRefreshMcpRegistry } = useRegistryServers(mcpRegistryOptions);
    const mcpServers = mcpRegistryData?.servers ?? [];
    const { data: registryMeta } = useRegistryMeta();
    const mcpCatalogTotal = registryMeta?.toolsServers ?? mcpRegistryData?.total ?? mcpServers.length;
    const [mcpServerSearch, setMcpServerSearch] = useState("");
    const trimmedMcpServerSearch = mcpServerSearch.trim();
    const mcpSearchReady = trimmedMcpServerSearch.length >= 2;
    const { data: mcpSearchData, isLoading: mcpSearchLoading } = useRegistrySearch(trimmedMcpServerSearch, 50, {
        origin: "tools",
        enabled: pluginSource === "tools" && mcpServerPickerOpen,
    });
    const [selectedMcpCard, setSelectedMcpCard] = useState<McpServerCard | null>(null);
    const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
    const [selectedMcpServer, setSelectedMcpServer] = useState<string>(
        initialSource === "tools" && initialPlugin ? normalizePluginSlug(initialPlugin, "tools") : ""
    );

    // Filtered tool servers
    const filteredMcpServers = useMemo(() => {
        if (!mcpSearchReady) {
            return mcpServers.slice(0, 50);
        }
        return (mcpSearchData?.servers ?? [])
            .filter((server) => server.origin === "tools")
            .slice(0, 50);
    }, [mcpSearchData?.servers, mcpSearchReady, mcpServers]);

    // ==========================================================================
    // Onchain Handlers
    // ==========================================================================

    const fetchPluginStatus = async () => {
        setPluginsLoading(true);
        try {
            const response = await fetch(`${CONNECTORS_URL}/onchain`);
            if (!response.ok) throw new Error(`Failed to fetch status: ${response.status}`);
            const data = await response.json() as OnchainResponse;
            const status: GoatStatus = {
                initialized: data.status.initialized,
                walletAddress: data.status.walletAddress,
                chain: data.status.chain,
                chainId: data.status.chainId,
                rpcUrl: data.status.rpcUrl,
                error: data.status.error,
                totalTools: data.status.totalTools,
                plugins: data.plugins,
            };
            setGoatStatus(status);
            if (!selectedPlugin && data.plugins?.length > 0) {
                setSelectedPlugin(data.plugins[0].id);
            }
        } catch (err) {
            console.error("Failed to fetch plugin status:", err);
            setPluginError(err instanceof Error ? err.message : "Failed to connect to plugin server");
        } finally {
            setPluginsLoading(false);
        }
    };

    const fetchPluginTools = async (pluginId: string) => {
        try {
            const slug = normalizePluginSlug(pluginId, "onchain");
            const response = await fetch(`${CONNECTORS_URL}/onchain/${encodeURIComponent(slug)}`);
            if (!response.ok) throw new Error(`Failed to fetch tools: ${response.status}`);
            const data = await response.json() as PluginInfo;
            const tools = data.tools || [];
            setPluginTools(tools);
            if (tools.length > 0) {
                setSelectedTool(tools[0].name);
                setToolSchema(tools[0].parameters);
                const defaultArgs = generateDefaultArgs(tools[0].parameters);
                setToolArgs(JSON.stringify(defaultArgs, null, 2));
            }
        } catch (err) {
            console.error("Failed to fetch plugin tools:", err);
            setPluginTools([]);
        }
    };

    const currentTool = pluginTools.find(t => t.name === selectedTool);

    const handleToolSelect = useCallback((toolName: string) => {
        setSelectedTool(toolName);
        const tool = pluginTools.find(t => t.name === toolName);
        if (tool) {
            setToolSchema(tool.parameters);
            const defaultArgs = generateDefaultArgs(tool.parameters);
            setToolArgs(JSON.stringify(defaultArgs, null, 2));
        }
    }, [pluginTools]);

    const handlePluginChange = useCallback((pluginId: string) => {
        setSelectedPlugin(normalizePluginSlug(pluginId, "onchain"));
        setSelectedTool("");
        setToolSchema(null);
        setToolArgs("{}");
    }, []);

    const handleExecutePlugin = useCallback(async () => {
        if (!selectedPlugin || !selectedTool || executingPlugin) return;
        if (!wallet) {
            setPluginError("Connect wallet to execute plugins");
            return;
        }

        let args: Record<string, unknown> = {};
        try {
            args = JSON.parse(toolArgs);
        } catch (e) {
            setPluginError(`Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}`);
            return;
        }

        setExecutingPlugin(true);
        setPluginError(null);

        try {
            let activeComposeKeyToken = composeKeyToken;
            if (!activeComposeKeyToken) {
                activeComposeKeyToken = await ensureComposeKeyToken();
            }
            if (!activeComposeKeyToken) {
                throw new Error("Compose key session is required");
            }

            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const response = await sdk.fetch(
                `/api/onchain/${encodeURIComponent(normalizePluginSlug(selectedPlugin, "onchain"))}/execute/${encodeURIComponent(selectedTool)}`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ args }),
                },
            );

            const data = await response.json();
            const result: PluginResult = {
                success: data.ok ?? data.success ?? response.ok,
                pluginId: selectedPlugin,
                tool: selectedTool,
                result: data.result,
                error: data.ok === false ? (data.message || data.kind) : (data.error || data.hint),
                txHash: data.result?.txHash || data.txHash,
                executedBy: goatStatus?.walletAddress || undefined,
                source: "onchain",
            };

            setPluginResults(prev => [...prev, result]);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            setPluginError(errorMsg);
            setPluginResults(prev => [
                ...prev,
                { success: false, pluginId: selectedPlugin, tool: selectedTool, error: errorMsg, source: "onchain" },
            ]);
        } finally {
            setExecutingPlugin(false);
        }
    }, [selectedPlugin, selectedTool, toolArgs, executingPlugin, wallet, sessionActive, budgetRemaining, composeKeyToken, ensureComposeKeyToken, goatStatus, paymentChainId]);

    // ==========================================================================
    // Tools Handlers
    // ==========================================================================

    const fetchMcpTools = async (slug: string) => {
        setPluginsLoading(true);
        try {
            const response = await fetch(`${CONNECTORS_URL}/tools/${encodeURIComponent(slug)}`);
            if (!response.ok) throw new Error(`Failed to fetch tools: ${response.status}`);
            const data = await response.json() as McpServerCard;
            setSelectedMcpCard(data);
            setPluginError(null);
            setMcpTools(data.tools || []);
            if (data.tools?.length > 0) {
                setSelectedTool(data.tools[0].name);
                setToolSchema(data.tools[0].inputSchema);
                const defaultArgs = generateDefaultArgs(data.tools[0].inputSchema);
                setToolArgs(JSON.stringify(defaultArgs, null, 2));
            } else {
                setSelectedTool("");
                setToolSchema(null);
                setToolArgs("{}");
            }
        } catch (err) {
            console.error("Failed to fetch tools:", err);
            setSelectedMcpCard(null);
            setMcpTools([]);
            setPluginError(err instanceof Error ? err.message : "Failed to fetch tools");
        } finally {
            setPluginsLoading(false);
        }
    };

    const handleMcpServerChange = useCallback((registryId: string) => {
        setSelectedMcpServer(normalizePluginSlug(registryId, "tools"));
        setSelectedTool("");
        setToolSchema(null);
        setToolArgs("{}");
        setSelectedMcpCard(null);
        setMcpTools([]);
    }, []);

    const handleMcpToolSelect = useCallback((toolName: string) => {
        setSelectedTool(toolName);
        const tool = mcpTools.find(t => t.name === toolName);
        if (tool) {
            setToolSchema(tool.inputSchema);
            const defaultArgs = generateDefaultArgs(tool.inputSchema);
            setToolArgs(JSON.stringify(defaultArgs, null, 2));
        }
    }, [mcpTools]);

    const currentMcpTool = mcpTools.find(t => t.name === selectedTool);
    const selectedMcpCredentials = selectedMcpCard?.credentials ?? [];
    const mcpCredentialsRequired = pluginSource === "tools" && selectedMcpCard?.status === "credential_gated";

    const handleExecuteMcpTool = useCallback(async () => {
        if (!selectedMcpServer || !selectedTool || executingPlugin) return;
        if (!wallet) {
            setPluginError("Connect wallet to execute tools");
            return;
        }

        let args: Record<string, unknown> = {};
        try {
            args = JSON.parse(toolArgs);
        } catch (e) {
            setPluginError(`Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}`);
            return;
        }

        setExecutingPlugin(true);
        setPluginError(null);

        try {
            let activeComposeKeyToken = composeKeyToken;
            if (!activeComposeKeyToken) {
                activeComposeKeyToken = await ensureComposeKeyToken();
            }
            if (!activeComposeKeyToken) {
                throw new Error("Compose key session is required");
            }

            const slug = normalizePluginSlug(selectedMcpServer, "tools");
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const response = await sdk.fetch(
                `/api/tools/${encodeURIComponent(slug)}/execute/${encodeURIComponent(selectedTool)}`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ args }),
                },
            );

            const data = await response.json();
            const result: PluginResult = {
                success: data.ok ?? response.ok,
                pluginId: selectedMcpServer,
                tool: selectedTool,
                result: data.result,
                error: data.ok === false ? (data.message || data.kind) : (data.error || data.hint),
                source: "tools",
            };

            setPluginResults(prev => [...prev, result]);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            setPluginError(errorMsg);
            setPluginResults(prev => [
                ...prev,
                { success: false, pluginId: selectedMcpServer, tool: selectedTool, error: errorMsg, source: "tools" },
            ]);
        } finally {
            setExecutingPlugin(false);
        }
    }, [selectedMcpServer, selectedTool, toolArgs, executingPlugin, wallet, sessionActive, budgetRemaining, composeKeyToken, ensureComposeKeyToken, paymentChainId]);

    // ==========================================================================
    // Source Change Handler
    // ==========================================================================

    const handleSourceChange = useCallback((source: PluginSource) => {
        setPluginSource(source);
        setSelectedTool("");
        setToolSchema(null);
        setToolArgs("{}");
        setPluginError(null);
        if (source !== "onchain") setSelectedPlugin("");
        if (source !== "tools") {
            setSelectedMcpServer("");
            setSelectedMcpCard(null);
            setMcpTools([]);
        }
    }, []);

    const handleClearResults = useCallback(() => {
        setPluginResults([]);
        setPluginError(null);
    }, []);

    // ==========================================================================
    // Effects
    // ==========================================================================

    useEffect(() => {
        if (pluginSource === "onchain" && !goatStatus) {
            fetchPluginStatus();
        }
    }, [pluginSource, goatStatus]);

    useEffect(() => {
        if (selectedMcpServer && pluginSource === "tools") {
            const slug = normalizePluginSlug(selectedMcpServer, "tools");
            if (slug) fetchMcpTools(slug);
        }
    }, [selectedMcpServer, pluginSource]);

    useEffect(() => {
        if (selectedPlugin && pluginSource === "onchain") {
            fetchPluginTools(selectedPlugin);
        }
    }, [selectedPlugin, pluginSource]);

    useEffect(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [pluginResults]);

    // ==========================================================================
    // Render
    // ==========================================================================

    return (
        <div className="cm-chat cm-plugin-tester h-full">
            {/* Header: Source and Plugin/Server selectors */}
            <div className="cm-chat__header">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
                    {/* Source selector */}
                    <Select value={pluginSource} onValueChange={(v) => handleSourceChange(v as PluginSource)}>
                        <SelectTrigger className="cm-form-select h-9 w-full sm:w-28 lg:w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="cm-shell-panel">
                            <SelectItem value="onchain">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-[10px] px-1.5">Onchain</Badge>
                                    <span className="text-[10px] text-muted-foreground">DeFi</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="tools">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40 text-[10px] px-1.5">Tools</Badge>
                                    <span className="text-[10px] text-muted-foreground">Servers</span>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Onchain Plugin selector */}
                    {pluginSource === "onchain" && (
                        <>
                            <Select value={selectedPlugin} onValueChange={handlePluginChange} disabled={!goatStatus?.plugins?.length}>
                                <SelectTrigger className="cm-form-select h-9 w-full sm:w-40 lg:w-52">
                                    <SelectValue placeholder={pluginsLoading ? "Loading..." : "Select plugin"} />
                                </SelectTrigger>
                                <SelectContent className="cm-shell-panel max-h-80">
                                    {!goatStatus?.plugins?.length ? (
                                        <div className="p-2 text-muted-foreground text-sm">No plugins available</div>
                                    ) : (
                                        goatStatus.plugins.map((plugin) => (
                                            <SelectItem key={plugin.id} value={plugin.id}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs">{plugin.name}</span>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0">{plugin.toolCount}</Badge>
                                                </div>
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>

                            <Select value={selectedTool} onValueChange={handleToolSelect} disabled={pluginTools.length === 0}>
                                <SelectTrigger className="cm-form-select h-9 w-full sm:flex-1 lg:w-56 xl:w-72">
                                    <SelectValue placeholder={pluginTools.length === 0 ? "Select plugin first" : "Select tool"} />
                                </SelectTrigger>
                                <SelectContent className="cm-shell-panel max-h-96">
                                    {pluginTools.length === 0 ? (
                                        <div className="p-2 text-muted-foreground text-sm">No tools available</div>
                                    ) : (
                                        pluginTools.map((tool) => (
                                            <SelectItem key={tool.name} value={tool.name}>
                                                <div className="flex flex-col py-0.5">
                                                    <span className="font-mono text-xs">{tool.name}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-64">{tool.description}</span>
                                                </div>
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>

                            {goatStatus && (
                                <div className="flex items-center gap-2 text-xs">
                                    <div className={cn("w-2 h-2 rounded-full", goatStatus.initialized ? "bg-emerald-500" : "bg-red-500")} />
                                    <span className="text-muted-foreground">
                                        {goatStatus.initialized ? `${goatStatus.totalTools} tools • ${goatStatus.chain}` : "Offline"}
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    {/* Tools Server selector */}
                    {pluginSource === "tools" && (
                        <>
                            <Popover open={mcpServerPickerOpen} onOpenChange={setMcpServerPickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="cm-form-select h-9 w-full justify-between text-left font-normal sm:w-40 lg:w-52"
                                    >
                                        <span className="truncate font-mono text-xs">
                                            {mcpLoading
                                                ? "Loading..."
                                                : selectedMcpServer
                                                    ? selectedMcpCard?.name || mcpServers.find(s => s.slug === normalizePluginSlug(selectedMcpServer, "tools"))?.name || normalizePluginSlug(selectedMcpServer, "tools")
                                                    : "Select server..."}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="cm-shell-panel w-[min(300px,calc(100vw-2rem))] p-0" align="start">
                                    <Command className="bg-transparent" shouldFilter={false}>
                                        <CommandInput
                                            placeholder="Search servers..."
                                            className="h-9"
                                            value={mcpServerSearch}
                                            onValueChange={setMcpServerSearch}
                                        />
                                        <CommandList className="max-h-[300px]">
                                            {trimmedMcpServerSearch && !mcpSearchReady ? (
                                                <div className="p-4 text-center text-muted-foreground text-sm">
                                                    Type at least 2 characters to search
                                                </div>
                                            ) : mcpLoading || (mcpSearchReady && mcpSearchLoading && filteredMcpServers.length === 0) ? (
                                                <div className="p-4 text-center text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                                                    Loading servers...
                                                </div>
                                            ) : filteredMcpServers.length === 0 ? (
                                                <CommandEmpty>No servers match "{mcpServerSearch}"</CommandEmpty>
                                            ) : (
                                                <CommandGroup heading={trimmedMcpServerSearch ? `${filteredMcpServers.length.toLocaleString()} matches` : `${filteredMcpServers.length.toLocaleString()} servers`}>
                                                    {filteredMcpServers.map((server) => (
                                                        <CommandItem
                                                            key={server.registryId}
                                                            value={server.registryId}
                                                            onSelect={() => {
                                                                handleMcpServerChange(server.registryId);
                                                                setMcpServerSearch("");
                                                                setMcpServerPickerOpen(false);
                                                            }}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2 w-full">
                                                                <Check
                                                                    className={cn(
                                                                        "h-4 w-4 shrink-0",
                                                                        normalizePluginSlug(selectedMcpServer, "tools") === server.slug ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                <div className="flex flex-col min-w-0 flex-1">
                                                                    <span className="font-mono text-xs truncate">{server.name || server.slug}</span>
                                                                    <span className="text-[10px] text-muted-foreground truncate">{server.description || "No description"}</span>
                                                                </div>
                                                                {server.transport === 'http' && (
                                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-cyan-500/50 text-cyan-400 shrink-0">remote</Badge>
                                                                )}
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            )}
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>

                            <Select value={selectedTool} onValueChange={handleMcpToolSelect} disabled={mcpTools.length === 0}>
                                <SelectTrigger className="cm-form-select h-9 w-full sm:flex-1 lg:w-56 xl:w-72">
                                    <SelectValue placeholder={mcpTools.length === 0 ? "Select server first" : "Select tool"} />
                                </SelectTrigger>
                                <SelectContent className="cm-shell-panel max-h-96">
                                    {mcpTools.length === 0 ? (
                                        <div className="p-2 text-muted-foreground text-sm">No tools available</div>
                                    ) : (
                                        mcpTools.map((tool) => (
                                            <SelectItem key={tool.name} value={tool.name}>
                                                <div className="flex flex-col py-0.5">
                                                    <span className="font-mono text-xs">{tool.name}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-48 sm:max-w-64">{tool.description || "No description"}</span>
                                                </div>
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>

                            <div className="flex items-center gap-2 text-[10px] sm:text-xs shrink-0">
                                <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full", mcpServers.length > 0 || selectedMcpServer ? "bg-fuchsia-400" : "bg-muted-foreground")} />
                                <span className="text-muted-foreground">
                                    {mcpCatalogTotal > 0
                                        ? `${mcpCatalogTotal.toLocaleString()} servers`
                                        : selectedMcpServer
                                            ? "Server selected"
                                            : mcpServerPickerOpen
                                                ? "Loading..."
                                                : "Open to browse"}
                                </span>
                            </div>
                        </>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={pluginSource === "onchain" ? fetchPluginStatus : () => forceRefreshMcpRegistry()}
                        disabled={pluginsLoading || mcpLoading}
                        className="cm-chat__icon-action shrink-0 h-8 w-8 sm:h-9 sm:w-9"
                        title="Refresh"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", (pluginsLoading || mcpLoading) && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Results Area */}
            <ScrollArea className="cm-chat__body">
                <div className="space-y-4 max-w-4xl mx-auto">
                    {pluginResults.length === 0 ? (
                        <div className="cm-chat__empty py-8">
                            <Plug className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">
                                Test {pluginSource === "onchain" ? "Onchain" : "Tools"} Actions
                            </p>
                            <p className="text-sm mt-2">
                                {sessionActive
                                    ? `Budget: ${formatBudget(budgetRemaining)} • Select a ${pluginSource === "onchain" ? "plugin" : "server"} and tool to execute`
                                    : "Start a session to begin"}
                            </p>

                            {pluginSource === "onchain" && goatStatus?.plugins && goatStatus.plugins.length > 0 && (
                                <div className="mt-6 text-left max-w-2xl mx-auto">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                                        {goatStatus.plugins.length} Plugins • {goatStatus.totalTools} Tools
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        {goatStatus.plugins.map((plugin) => (
                                            <button
                                                key={plugin.id}
                                                onClick={() => handlePluginChange(plugin.id)}
                                                className={cn(
                                                    "cm-shell-panel p-3 text-left transition-colors",
                                                    selectedPlugin === plugin.id
                                                        ? "border-green-500/50 bg-green-950/20"
                                                        : "hover:border-cyan-500/30"
                                                )}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-green-400 font-mono text-xs">{plugin.name}</span>
                                                    <Badge variant="outline" className="text-[9px]">{plugin.toolCount}</Badge>
                                                </div>
                                                <p className="text-muted-foreground text-[10px] line-clamp-2">{plugin.description}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {pluginSource === "tools" && mcpCatalogTotal > 0 && (
                                <div className="mt-6 text-left max-w-md mx-auto">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 text-center">
                                        {mcpCatalogTotal.toLocaleString()} Tool Servers Available
                                    </p>
                                    <p className="text-muted-foreground text-sm text-center">
                                        Use the <span className="text-fuchsia-300 font-mono">Select server</span> dropdown above to search the catalog.
                                    </p>
                                </div>
                            )}

                            {pluginsLoading && (
                                <div className="mt-6">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-cyan-400" />
                                    <p className="mt-2 text-sm">
                                        Loading {pluginSource === "onchain" ? "plugins" : "servers"}...
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        pluginResults.map((result, index) => (
                            <div
                                key={index}
                                className={cn(
                                    "cm-shell-panel p-4",
                                    result.success
                                        ? "bg-emerald-950/30 border-emerald-800"
                                        : "bg-red-950/30 border-red-800"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <Terminal className="h-4 w-4 text-muted-foreground" />
                                    <Badge
                                        className={cn(
                                            "text-[10px] px-1.5",
                                            result.source === "tools"
                                                ? "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40"
                                                : "bg-green-500/20 text-green-400 border-green-500/40"
                                        )}
                                    >
                                        {result.source === "tools" ? "Tools" : "Onchain"}
                                    </Badge>
                                    <span className="font-mono text-sm text-foreground">
                                        {result.pluginId}/{result.tool}
                                    </span>
                                    <Badge variant={result.success ? "default" : "destructive"} className="text-xs">
                                        {result.success ? "Success" : "Failed"}
                                    </Badge>
                                    {result.explorer && (
                                        <a
                                            href={result.explorer}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                                        >
                                            View TX <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                    {result.executedBy && (
                                        <span className="text-[10px] text-muted-foreground">
                                            by {result.executedBy.slice(0, 6)}...{result.executedBy.slice(-4)}
                                        </span>
                                    )}
                                </div>
                                <pre className="text-xs text-muted-foreground overflow-auto max-h-48 font-mono rounded-lg border border-primary/10 bg-background/40 p-2">
                                    {result.error || JSON.stringify(result.result, null, 2)}
                                </pre>
                            </div>
                        ))
                    )}
                    <div ref={resultsEndRef} />
                </div>
            </ScrollArea>

            {/* Input with schema hints */}
            <div className="cm-chat__composer">
                <div className="max-w-4xl mx-auto space-y-3">
                    {mcpCredentialsRequired && (
                        <div className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-3">
                            <p className="text-amber-300 text-sm flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                Credentials needed
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                This server requires credentials before its tools can run.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {selectedMcpCredentials.length > 0 ? (
                                    selectedMcpCredentials.map((credential) => (
                                        <Badge key={credential.varName} variant="outline" className="border-amber-500/50 text-amber-300">
                                            {credential.varName}
                                        </Badge>
                                    ))
                                ) : (
                                    <span className="text-xs text-muted-foreground">No specific env vars are recorded in the catalog.</span>
                                )}
                            </div>
                        </div>
                    )}

                    {(pluginSource === "onchain" ? currentTool : currentMcpTool) && (
                        <div className="cm-shell-panel p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Terminal className={cn(
                                    "h-4 w-4",
                                    pluginSource === "onchain" ? "text-green-400" : "text-fuchsia-300"
                                )} />
                                <Badge
                                    className={cn(
                                    "text-[10px] px-1.5",
                                    pluginSource === "onchain"
                                        ? "bg-green-500/20 text-green-400 border-green-500/40"
                                            : "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40"
                                    )}
                                >
                                    {pluginSource === "onchain" ? "Onchain" : "Tools"}
                                </Badge>
                                <span className={cn(
                                    "font-mono text-sm",
                                    pluginSource === "onchain" ? "text-green-400" : "text-fuchsia-300"
                                )}>
                                    {pluginSource === "onchain" ? currentTool?.name : currentMcpTool?.name}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                                {pluginSource === "onchain"
                                    ? currentTool?.description
                                    : (currentMcpTool?.description || "No description available")}
                            </p>
                            {toolSchema && (
                                <div className="mt-2 pt-2 border-t border-primary/10">
                                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Parameters (* = required)</p>
                                    <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">
                                        {formatSchemaHint(toolSchema)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleClearResults}
                            className="cm-chat__icon-action shrink-0"
                            title="Clear results"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="flex-1 relative">
                            <Textarea
                                value={toolArgs}
                                onChange={(e) => setToolArgs(e.target.value)}
                                placeholder='{"key": "value"}'
                                className="cm-form-textarea min-h-20 pr-20 font-mono text-sm"
                            />
                            <div className="absolute right-2 top-2 flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (pluginSource === "onchain" && currentTool) {
                                            const defaultArgs = generateDefaultArgs(currentTool.parameters);
                                            setToolArgs(JSON.stringify(defaultArgs, null, 2));
                                        } else if (pluginSource === "tools" && currentMcpTool) {
                                            const defaultArgs = generateDefaultArgs(currentMcpTool.inputSchema);
                                            setToolArgs(JSON.stringify(defaultArgs, null, 2));
                                        }
                                    }}
                                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                    title="Reset to defaults"
                                >
                                    Reset
                                </Button>
                            </div>
                        </div>
                        <Button
                            onClick={pluginSource === "onchain" ? handleExecutePlugin : handleExecuteMcpTool}
                            disabled={
                                !sessionActive ||
                                executingPlugin ||
                                !selectedTool ||
                                (pluginSource === "onchain" ? !selectedPlugin : !selectedMcpServer)
                            }
                            className={cn(
                                "h-auto px-6",
                                pluginSource === "onchain"
                                    ? "bg-green-600 hover:bg-green-700"
                                    : "bg-fuchsia-600 hover:bg-fuchsia-700"
                            )}
                        >
                            {executingPlugin ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Execute
                                </>
                            )}
                        </Button>
                    </div>
                    {pluginError && (
                        <div className="p-3 rounded-lg bg-red-950/30 border border-red-800">
                            <p className="text-red-400 text-sm flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                {pluginError}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
