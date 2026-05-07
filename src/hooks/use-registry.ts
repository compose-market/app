/**
 * Connectors registry hooks.
 *
 * React Query hooks that talk to the connectors broker
 * (https://connectors.compose.market) for tools and onchain connectors.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback, useEffect, useState } from "react";
import { normalizeConnectorBinding, type CanonicalConnectorOrigin } from "@/lib/connectors";

/**
 * Build the connectors broker base URL.
 */
function getBrokerBaseUrl(): string {
    const url = import.meta.env.VITE_CONNECTORS_URL;
    if (url) {
        return url.replace(/\/$/, "");
    }
    return "https://connectors.compose.market";
}

const BROKER_BASE = getBrokerBaseUrl();

/** Server origin types (user-facing). */
export type ServerOrigin = CanonicalConnectorOrigin | "eliza";

/** Record type: agent (autonomous AI agents) or plugin (tools/connectors). */
export type RecordType = "agent" | "plugin";

/** Unified server record. */
export interface RegistryServer {
    registryId: string;
    origin: ServerOrigin;
    type: RecordType;
    sources?: ServerOrigin[];
    canonicalKey?: string;
    name: string;
    namespace: string;
    slug: string;
    description: string;
    attributes: string[];
    repoUrl?: string;
    uiUrl?: string;
    category?: string;
    tags: string[];
    toolCount: number;
    tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
    }>;
    available: boolean;
    executable?: boolean;
    missingEnv?: string[];
    alternateIds?: string[];
    transport?: "stdio" | "http" | "docker";
    image?: string;
    remoteUrl?: string;
    status?: ServedCatalogStatus;
    credentialGated?: boolean;
}

export interface RegistryListResponse {
    total: number;
    offset: number;
    limit: number;
    servers: RegistryServer[];
}

export interface RegistrySearchResponse {
    query: string;
    total: number;
    servers: RegistryServer[];
}

export interface RegistryMeta {
    totalServers: number;
    toolsServers: number;
    onchainServers: number;
    loadedAt: string | null;
}

export interface ListServersOptions {
    type?: RecordType;
    origin?: ServerOrigin | string;
    category?: string;
    available?: boolean;
    limit?: number;
    offset?: number;
    enabled?: boolean;
}

export interface SearchServersOptions {
    origin?: ServerOrigin | string;
    category?: string;
    enabled?: boolean;
}

type ServedCatalogStatus = "live" | "credential_gated";

interface BrokerServerSummary {
    slug: string;
    origin: CanonicalConnectorOrigin;
    name: string;
    namespace: string;
    description: string;
    tags: string[];
    category: string | null;
    status: ServedCatalogStatus;
    statefulness: "stateless" | "stateful" | "unknown";
    cardVersion: string;
    inspectedAt: string | null;
}

interface BrokerServerCard extends BrokerServerSummary {
    repoUrl: string | null;
    image: string | null;
    compiledAt: string | null;
    tools: Array<{ name: string; description?: string | null; inputSchema: Record<string, unknown> }>;
    credentials: Array<{ varName: string; description?: string | null; obtainUrl?: string | null }>;
}

interface BrokerOnchainPlugin {
    id: string;
    name: string;
    description: string;
    toolCount: number;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown>; pluginId: string }>;
    requiresApiKey?: boolean;
    apiKeyConfigured?: boolean;
}

interface BrokerOnchainResponse {
    plugins: BrokerOnchainPlugin[];
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

interface BrokerToolsListResponse {
    total: number;
    offset: number;
    limit: number;
    servers: BrokerServerSummary[];
}

const DEFAULT_REGISTRY_PAGE_SIZE = 50;
const MAX_TOOLS_PAGE_SIZE = 200;
const MAX_SEARCH_RESULTS = 50;

function summaryToRegistryServer(s: BrokerServerSummary): RegistryServer {
    const binding = normalizeConnectorBinding({ registryId: s.slug, origin: s.origin });
    return {
        registryId: binding.registryId,
        origin: binding.origin,
        type: "plugin",
        sources: [binding.origin],
        canonicalKey: s.slug,
        name: s.name,
        namespace: s.namespace,
        slug: s.slug,
        description: s.description,
        attributes: [],
        category: s.category ?? undefined,
        tags: s.tags,
        toolCount: 0,
        available: true,
        executable: true,
        status: s.status,
        credentialGated: s.status === "credential_gated",
    };
}

function cardToRegistryServer(s: BrokerServerCard): RegistryServer {
    const binding = normalizeConnectorBinding({ registryId: s.slug, origin: s.origin });
    return {
        registryId: binding.registryId,
        origin: binding.origin,
        type: "plugin",
        sources: [binding.origin],
        canonicalKey: s.slug,
        name: s.name,
        namespace: s.namespace,
        slug: s.slug,
        description: s.description,
        attributes: [],
        repoUrl: s.repoUrl ?? undefined,
        category: s.category ?? undefined,
        tags: s.tags,
        toolCount: s.tools.length,
        tools: s.tools.map((t) => ({
            name: t.name,
            description: t.description ?? undefined,
            inputSchema: t.inputSchema,
        })),
        available: true,
        executable: true,
        image: s.image ?? undefined,
        missingEnv: s.credentials.map((c) => c.varName),
        status: s.status,
        credentialGated: s.status === "credential_gated",
    };
}

function pluginToRegistryServer(p: BrokerOnchainPlugin): RegistryServer {
    const binding = normalizeConnectorBinding({ registryId: p.id, origin: "onchain" });
    return {
        registryId: binding.registryId,
        origin: binding.origin,
        type: "plugin",
        sources: [binding.origin],
        canonicalKey: p.id,
        name: p.name,
        namespace: "onchain",
        slug: p.id,
        description: p.description,
        attributes: [],
        category: "defi",
        tags: ["onchain", "defi"],
        toolCount: p.toolCount,
        tools: p.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
        })),
        available: true,
        executable: true,
    };
}

async function fetchServers(options: ListServersOptions = {}): Promise<RegistryListResponse> {
    const { enabled: _enabled, ...listOptions } = options;
    const origins = (options.origin ? String(options.origin).split(",") : ["tools", "onchain"])
        .map((origin) => normalizeConnectorBinding({ registryId: "placeholder", origin }).origin);
    const requestedLimit = listOptions.limit;
    const offset = listOptions.offset ?? 0;
    const toolsLimit = Math.min(Math.max(1, requestedLimit ?? DEFAULT_REGISTRY_PAGE_SIZE), MAX_TOOLS_PAGE_SIZE);

    const tasks: Array<Promise<{ total: number; servers: RegistryServer[] }>> = [];

    if (origins.includes("tools")) {
        tasks.push(
            (async () => {
                const params = new URLSearchParams({ limit: String(toolsLimit), offset: String(offset) });
                if (listOptions.category) params.set("category", listOptions.category);
                const res = await fetch(`${BROKER_BASE}/tools?${params}`);
                if (!res.ok) throw new Error(`Failed to fetch tools catalog: ${res.status}`);
                const data = await res.json() as BrokerToolsListResponse;
                return {
                    total: data.total,
                    servers: data.servers.map(summaryToRegistryServer),
                };
            })(),
        );
    }

    if (origins.includes("onchain")) {
        tasks.push(
            fetch(`${BROKER_BASE}/onchain`).then(async (res) => {
                if (!res.ok) return { total: 0, servers: [] };
                const data = await res.json() as BrokerOnchainResponse;
                return {
                    total: data.plugins.length,
                    servers: data.plugins.map(pluginToRegistryServer),
                };
            }),
        );
    }

    const results = await Promise.all(tasks);

    let merged: RegistryServer[] = [];
    let total = 0;
    for (const r of results) {
        merged = merged.concat(r.servers);
        total += r.total;
    }

    if (listOptions.category) {
        merged = merged.filter((s) => s.category === listOptions.category);
    }
    if (listOptions.available !== undefined) {
        merged = merged.filter((s) => s.available === listOptions.available);
    }

    return { total: merged.length, offset, limit: merged.length, servers: merged };
}

/**
 * Search the catalog across tools and onchain connectors.
 */
async function searchServers(query: string, limit = DEFAULT_REGISTRY_PAGE_SIZE, options: SearchServersOptions = {}): Promise<RegistrySearchResponse> {
    const normalizedQuery = query.toLowerCase().trim();
    if (normalizedQuery.length < 2) {
        return { query: normalizedQuery, total: 0, servers: [] };
    }
    const { enabled: _enabled, ...searchOptions } = options;
    const origins = (searchOptions.origin ? String(searchOptions.origin).split(",") : ["tools", "onchain"])
        .map((origin) => normalizeConnectorBinding({ registryId: "placeholder", origin }).origin);
    const boundedLimit = Math.min(Math.max(1, limit), MAX_SEARCH_RESULTS);
    const params = new URLSearchParams({ q: query });
    params.set("limit", String(boundedLimit));
    const [toolsData, onchainData] = await Promise.all([
        origins.includes("tools")
            ? fetch(`${BROKER_BASE}/tools/search?${params}`).then(async (res) => {
                if (!res.ok) throw new Error(`Failed to search servers: ${res.status}`);
                return await res.json() as { query: string; total: number; servers: BrokerServerSummary[] };
            })
            : Promise.resolve<{ query: string; total: number; servers: BrokerServerSummary[] }>({ query: normalizedQuery, total: 0, servers: [] }),
        origins.includes("onchain")
            ? fetch(`${BROKER_BASE}/onchain`).then(async (res) => {
                if (!res.ok) return null;
                return await res.json() as BrokerOnchainResponse;
            })
            : Promise.resolve<BrokerOnchainResponse | null>(null),
    ]);
    const needle = normalizedQuery;
    let onchainServers: RegistryServer[] = [];
    if (onchainData) {
        onchainServers = onchainData.plugins
            .map(pluginToRegistryServer)
            .filter((server) => (
                server.name.toLowerCase().includes(needle)
                || server.slug.toLowerCase().includes(needle)
                || server.description.toLowerCase().includes(needle)
                || server.tags.some((tag) => tag.toLowerCase().includes(needle))
            ));
    }
    let servers = [
        ...toolsData.servers.map(summaryToRegistryServer),
        ...onchainServers,
    ];
    if (searchOptions.category) {
        servers = servers.filter((server) => server.category === searchOptions.category);
    }
    servers = servers.slice(0, boundedLimit);
    return {
        query: toolsData.query || normalizedQuery,
        total: toolsData.total + onchainServers.length,
        servers,
    };
}

async function fetchServer(registryId: string): Promise<RegistryServer> {
    const binding = normalizeConnectorBinding(registryId, { defaultOrigin: "tools" });
    if (binding.origin === "onchain") {
        const id = binding.slug;
        const res = await fetch(`${BROKER_BASE}/onchain/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`Failed to fetch onchain connector: ${res.status}`);
        const plugin = await res.json() as BrokerOnchainPlugin;
        return pluginToRegistryServer(plugin);
    }
    const slug = binding.slug;
    const res = await fetch(`${BROKER_BASE}/tools/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(`Failed to fetch server: ${res.status}`);
    const card = await res.json() as BrokerServerCard;
    return cardToRegistryServer(card);
}

async function fetchRegistryMeta(): Promise<RegistryMeta> {
    const [toolsMeta, onchain] = await Promise.all([
        fetch(`${BROKER_BASE}/tools/meta`).then((r) => r.json() as Promise<{ origins: Record<string, number>; total: number }>),
        fetch(`${BROKER_BASE}/onchain`).then((r) => r.ok ? r.json() as Promise<BrokerOnchainResponse> : Promise.resolve(null)),
    ]);
    return {
        totalServers: toolsMeta.total + (onchain?.plugins.length ?? 0),
        toolsServers: toolsMeta.origins["tools"] ?? 0,
        onchainServers: onchain?.plugins.length ?? 0,
        loadedAt: new Date().toISOString(),
    };
}

async function fetchCategories(): Promise<string[]> {
    const res = await fetch(`${BROKER_BASE}/tools/categories`);
    if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
    const data = await res.json() as { categories: string[] };
    return data.categories;
}

async function fetchTags(): Promise<string[]> {
    const res = await fetch(`${BROKER_BASE}/tools/tags`);
    if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`);
    const data = await res.json() as { tags: string[] };
    return data.tags;
}

// =============================================================================
// Constants
// =============================================================================

const REGISTRY_STALE_TIME = 6 * 60 * 60 * 1000;
const REGISTRY_GC_TIME = 12 * 60 * 60 * 1000;
const REGISTRY_SEARCH_GC_TIME = 10 * 60 * 1000;
const METADATA_STALE_TIME = 5 * 60 * 1000;
const REGISTRY_CACHE_KEY = ["registry", "servers"] as const;
const SEARCH_DEBOUNCE_MS = 250;

// =============================================================================
// Hooks
// =============================================================================

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timeout);
    }, [delayMs, value]);

    return debounced;
}

export function useRegistryServers(options: ListServersOptions = {}) {
    const queryClient = useQueryClient();
    const { enabled = true, ...listOptions } = options;

    const serializedOptions = JSON.stringify(listOptions);
    const queryKey = useMemo(
        () => [...REGISTRY_CACHE_KEY, serializedOptions],
        [serializedOptions],
    );

    const query = useQuery({
        queryKey,
        queryFn: () => fetchServers(listOptions),
        enabled,
        staleTime: REGISTRY_STALE_TIME,
        gcTime: REGISTRY_GC_TIME,
    });

    const forceRefresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: REGISTRY_CACHE_KEY });
    }, [queryClient]);

    return {
        ...query,
        forceRefresh,
    };
}

export function useRegistrySearch(query: string, limit = DEFAULT_REGISTRY_PAGE_SIZE, options: SearchServersOptions = {}) {
    const trimmedQuery = query.trim();
    const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
    const { enabled = true, ...searchOptions } = options;
    const serializedOptions = JSON.stringify(searchOptions);

    return useQuery({
        queryKey: ["registry", "search", debouncedQuery, limit, serializedOptions],
        queryFn: () => searchServers(debouncedQuery, limit, searchOptions),
        enabled: enabled && debouncedQuery.length >= 2,
        staleTime: METADATA_STALE_TIME,
        gcTime: REGISTRY_SEARCH_GC_TIME,
    });
}

export function useRegistryServer(registryId: string | null) {
    return useQuery({
        queryKey: ["registry", "server", registryId],
        queryFn: () => fetchServer(registryId!),
        enabled: !!registryId,
        staleTime: REGISTRY_STALE_TIME,
        gcTime: REGISTRY_GC_TIME,
    });
}

export function useRegistryMeta() {
    return useQuery({
        queryKey: ["registry", "meta"],
        queryFn: fetchRegistryMeta,
        staleTime: METADATA_STALE_TIME,
        gcTime: REGISTRY_GC_TIME,
    });
}

export function useRegistryCategories() {
    return useQuery({
        queryKey: ["registry", "categories"],
        queryFn: fetchCategories,
        staleTime: REGISTRY_STALE_TIME,
        gcTime: REGISTRY_GC_TIME,
    });
}

export function useRegistryTags() {
    return useQuery({
        queryKey: ["registry", "tags"],
        queryFn: fetchTags,
        staleTime: REGISTRY_STALE_TIME,
        gcTime: REGISTRY_GC_TIME,
    });
}

// =============================================================================
// Utility Functions
// =============================================================================

function registryServerTextMatches(server: RegistryServer, query: string): boolean {
    return server.name.toLowerCase().includes(query)
        || server.slug.toLowerCase().includes(query)
        || server.registryId.toLowerCase().includes(query)
        || server.description.toLowerCase().includes(query)
        || server.tags.some((tag) => tag.toLowerCase().includes(query));
}

export function mergeRegistrySearchResults(
    query: string,
    semanticServers: RegistryServer[] | undefined,
    allServers: RegistryServer[],
): RegistryServer[] {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return allServers;
    const byId = new Map<string, RegistryServer>();
    for (const server of semanticServers ?? []) byId.set(server.registryId, server);
    for (const server of allServers) {
        if (registryServerTextMatches(server, normalized)) byId.set(server.registryId, server);
    }
    return [...byId.values()];
}

export const ORIGIN_COLORS: Record<ServerOrigin, string> = {
    tools: "purple",
    onchain: "green",
    eliza: "orange",
};

export function getOriginBadgeVariant(origin: ServerOrigin): "default" | "secondary" | "outline" {
    switch (origin) {
        case "onchain":
            return "secondary";
        default:
            return "outline";
    }
}

export function getOriginLabel(origin: ServerOrigin): string {
    switch (origin) {
        case "tools":
            return "Tools";
        case "onchain":
            return "Onchain";
        case "eliza":
            return "Eliza";
        default:
            return origin;
    }
}

export function getOriginIcon(origin: ServerOrigin): "server" | "coins" {
    switch (origin) {
        case "onchain":
            return "coins";
        case "eliza":
            return "server";
        default:
            return "server";
    }
}

export function isRemoteCapable(server: RegistryServer): boolean {
    return server.attributes.includes("hosting:remote-capable");
}

export function formatToolCount(count: number): string {
    if (count === 0) return "No tools";
    if (count === 1) return "1 tool";
    return `${count} tools`;
}
