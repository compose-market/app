/**
 * MCP Registry Hooks
 * 
 * React Query hooks for the MCP registry API.
 * Registry runs on the connector server (port 4001), not the lambda API server.
 */
import { useQuery } from "@tanstack/react-query";

/**
 * Build the registry base URL
 * 
 * In production: Uses VITE_CONNECTOR_URL from env (https://services.compose.market/connector)
 * In development: Falls back to localhost:4001
 * 
 * The registry is on the connector server under /registry path.
 */
function getRegistryBaseUrl(): string {
  // Check for explicit connector URL first
  const connectorUrl = import.meta.env.VITE_CONNECTOR_URL;
  if (connectorUrl) {
    return `${connectorUrl.replace(/\/$/, "")}/registry`;
  }

  // Production fallback: services.compose.market/connector
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return "https://services.compose.market/connector/registry";
  }

  // Development fallback
  return "http://localhost:4001/registry";
}

const REGISTRY_BASE = getRegistryBaseUrl();

/** Server origin types */
export type ServerOrigin = "mcp" | "internal" | "goat" | "eliza";

/** Record type: agent (autonomous AI agents) or plugin (tools/connectors) */
export type RecordType = "agent" | "plugin";

/** Unified server record from the registry */
export interface RegistryServer {
  /** Unique registry ID: "mcp:{slug}", "goat:{slug}", etc */
  registryId: string;
  /** Primary origin: mcp, internal, goat, or eliza */
  origin: ServerOrigin;
  /** Type classification: agent or plugin (for internal filtering) */
  type: RecordType;
  /** All sources that provide this plugin (for deduped entries) */
  sources?: ServerOrigin[];
  /** Canonical key used for deduplication */
  canonicalKey?: string;
  /** Human-readable name */
  name: string;
  /** Namespace (author/org) */
  namespace: string;
  /** URL-safe slug */
  slug: string;
  /** Description */
  description: string;
  /** Capability attributes */
  attributes: string[];
  /** Repository URL */
  repoUrl?: string;
  /** UI/directory URL */
  uiUrl?: string;
  /** Category for filtering */
  category?: string;
  /** Tags for search */
  tags: string[];
  /** Tool count */
  toolCount: number;
  /** Tools metadata */
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  /** Whether this server is available (all env vars present) */
  available: boolean;
  /** Whether this plugin has live execution capability */
  executable?: boolean;
  /** Connector ID for internal servers */
  connectorId?: string;
  /** Missing environment variables */
  missingEnv?: string[];
  /** Alternative registry IDs from other sources */
  alternateIds?: string[];
  /** Transport type: stdio, http, or docker */
  transport?: "stdio" | "http" | "docker";
  /** Docker image name (if containerized) */
  image?: string;
  /** Remote URL (if HTTP/SSE server) */
  remoteUrl?: string;
}

/** Registry list response */
export interface RegistryListResponse {
  total: number;
  offset: number;
  limit: number;
  servers: RegistryServer[];
}

/** Registry search response */
export interface RegistrySearchResponse {
  query: string;
  total: number;
  servers: RegistryServer[];
}

/** Registry metadata */
export interface RegistryMeta {
  totalServers: number;
  mcpServers: number;
  internalServers: number;
  goatServers: number;
  elizaServers: number;
  loadedAt: string | null;
}

/** Options for listing servers */
export interface ListServersOptions {
  /** Filter by type (agent or plugin) */
  type?: RecordType;
  /** Filter by origin (supports comma-separated list, e.g. "goat,eliza") */
  origin?: ServerOrigin | string;
  category?: string;
  available?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Fetch servers from the registry
 */
async function fetchServers(options: ListServersOptions = {}): Promise<RegistryListResponse> {
  const params = new URLSearchParams();
  if (options.type) params.set("type", options.type);
  if (options.origin) params.set("origin", options.origin);
  if (options.category) params.set("category", options.category);
  if (options.available !== undefined) params.set("available", String(options.available));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const url = `${REGISTRY_BASE}/servers?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch servers: ${res.status}`);
  }

  return res.json();
}

/**
 * Search servers in the registry
 */
async function searchServers(query: string, limit?: number): Promise<RegistrySearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set("limit", String(limit));
  const url = `${REGISTRY_BASE}/servers/search?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to search servers: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch a single server by ID
 */
async function fetchServer(registryId: string): Promise<RegistryServer> {
  const url = `${REGISTRY_BASE}/servers/${encodeURIComponent(registryId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch server: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch registry metadata
 */
async function fetchRegistryMeta(): Promise<RegistryMeta> {
  const url = `${REGISTRY_BASE}/meta`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch registry metadata: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch all categories
 */
async function fetchCategories(): Promise<string[]> {
  const url = `${REGISTRY_BASE}/categories`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch categories: ${res.status}`);
  }

  const data = await res.json();
  return data.categories;
}

/**
 * Fetch all tags
 */
async function fetchTags(): Promise<string[]> {
  const url = `${REGISTRY_BASE}/tags`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch tags: ${res.status}`);
  }

  const data = await res.json();
  return data.tags;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook for fetching servers from the registry
 */
export function useRegistryServers(options: ListServersOptions = {}) {
  return useQuery({
    queryKey: ["registry", "servers", options],
    queryFn: () => fetchServers(options),
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook for searching servers
 */
export function useRegistrySearch(query: string, limit?: number) {
  return useQuery({
    queryKey: ["registry", "search", query, limit],
    queryFn: () => searchServers(query, limit),
    enabled: query.length > 0,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook for fetching a single server
 */
export function useRegistryServer(registryId: string | null) {
  return useQuery({
    queryKey: ["registry", "server", registryId],
    queryFn: () => fetchServer(registryId!),
    enabled: !!registryId,
    staleTime: 60_000,
  });
}

/**
 * Hook for registry metadata
 */
export function useRegistryMeta() {
  return useQuery({
    queryKey: ["registry", "meta"],
    queryFn: fetchRegistryMeta,
    staleTime: 300_000, // 5 minutes
  });
}

/**
 * Hook for categories
 */
export function useRegistryCategories() {
  return useQuery({
    queryKey: ["registry", "categories"],
    queryFn: fetchCategories,
    staleTime: 300_000,
  });
}

/**
 * Hook for tags
 */
export function useRegistryTags() {
  return useQuery({
    queryKey: ["registry", "tags"],
    queryFn: fetchTags,
    staleTime: 300_000,
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Origin color mapping */
export const ORIGIN_COLORS: Record<ServerOrigin, string> = {
  internal: "cyan",
  mcp: "purple",
  goat: "green",
  eliza: "fuchsia",
};

/**
 * Get badge variant for origin
 */
export function getOriginBadgeVariant(origin: ServerOrigin): "default" | "secondary" | "outline" {
  switch (origin) {
    case "internal":
      return "default";
    case "goat":
    case "eliza":
      return "secondary";
    default:
      return "outline";
  }
}

/**
 * Get display label for origin
 */
export function getOriginLabel(origin: ServerOrigin): string {
  switch (origin) {
    case "internal":
      return "Compose";
    case "mcp":
      return "MCP";
    case "goat":
      return "GOAT";
    case "eliza":
      return "ElizaOS";
    default:
      return origin;
  }
}

/**
 * Get icon name for origin
 */
export function getOriginIcon(origin: ServerOrigin): "plug" | "server" | "coins" | "bot" {
  switch (origin) {
    case "internal":
      return "plug";
    case "goat":
      return "coins";
    case "eliza":
      return "bot";
    default:
      return "server";
  }
}

/**
 * Check if server has remote capability
 */
export function isRemoteCapable(server: RegistryServer): boolean {
  return server.attributes.includes("hosting:remote-capable");
}

/**
 * Format tool count
 */
export function formatToolCount(count: number): string {
  if (count === 0) return "No tools";
  if (count === 1) return "1 tool";
  return `${count} tools`;
}

