/**
 * Agent Discovery System
 * Generic types and functions for discovering agents across multiple registries
 *
 * Registries:
 * - Agentverse: Fetch.ai autonomous agent marketplace
 * - GOAT: DeFi tool connectors
 */

import { sdk } from "./sdk";

const AGENTS_URL = (import.meta.env.VITE_AGENTS_URL || "https://agents.compose.market").replace(/\/+$/, "");

// =============================================================================
// Registry System
// =============================================================================

/**
 * Agent registries/ecosystems that can be queried
 *
 * Note: Only registries with type="agent" are shown in the Agents tab.
 */
export const AGENT_REGISTRIES = {
  agentverse: {
    id: "agentverse",
    name: "Agentverse",
    description: "Fetch.ai autonomous agent marketplace",
    url: "https://agentverse.ai",
    color: "purple",
    type: "agent" as const, // True AI agents
    enabled: true,
  },
  goat: {
    id: "goat",
    name: "GOAT SDK",
    description: "DeFi & Web3 tool connectors",
    url: "https://ohmygoat.dev",
    color: "green",
    type: "connector" as const,
    enabled: false, // Disabled for agent search - use registry API instead
  },
  manowar: {
    id: "manowar",
    name: "ManoWar",
    description: "Compose.Market native agents",
    url: null,
    color: "cyan",
    type: "agent" as const, // True AI agents
    enabled: true, // On-chain ERC8004 agents
  },
} as const;

export type AgentRegistryId = keyof typeof AGENT_REGISTRIES;

// =============================================================================
// Generic Agent Types
// =============================================================================

export interface AgentProtocol {
  name: string;
  version: string;
  digest?: string;
}

/**
 * Warp status for agents
 * - native: Manowar agent (no warp needed, can be used directly)
 * - warped: External agent that has been warped into Manowar
 * - must-warp: External agent that needs to be warped before use
 */
export type WarpStatus = "native" | "warped" | "must-warp";

/**
 * Unified agent type across all registries
 */
export interface Agent {
  // Core identity
  id: string;
  address: string;
  name: string;
  description: string;

  // Registry source
  registry: AgentRegistryId;

  // Optional details
  readme?: string;
  protocols: AgentProtocol[];
  avatarUrl: string | null;

  // Metrics
  totalInteractions: number;
  recentInteractions: number;
  rating: number;

  // Status
  status: "active" | "inactive";
  type: "hosted" | "local";
  featured: boolean;
  verified: boolean;

  // Categorization
  category: string;
  tags: string[];

  // Metadata
  owner: string;
  createdAt: string;
  updatedAt: string;
  externalUrl?: string;

  // Warp status (for compose flow validation)
  warpStatus?: WarpStatus;
  warpedAgentId?: number; // Manowar agent ID if this external agent has been warped
  isWarped?: boolean; // True if this is a warped manowar agent

  // Manowar-specific properties
  onchainAgentId?: number; // Numeric agent ID for on-chain agents
  pricePerRequest?: string; // Price per request in USDC (e.g., "0.01")
}

export interface AgentSearchResponse {
  agents: Agent[];
  total: number;
  offset: number;
  limit: number;
  tags: string[];
  categories: string[];
  registries: AgentRegistryId[];
}

export interface SearchAgentsOptions {
  search?: string;
  category?: string;
  tags?: string[];
  registries?: AgentRegistryId[];
  status?: "active" | "inactive";
  limit?: number;
  offset?: number;
  sort?: "relevancy" | "created-at" | "last-modified" | "interactions";
  direction?: "asc" | "desc";
}

// =============================================================================
// Agentverse-Specific Types (internal)
// =============================================================================

interface AgentverseProtocol {
  name: string;
  version: string;
  digest: string;
}

interface AgentverseAgent {
  address: string;
  prefix: string;
  name: string;
  description: string;
  readme: string;
  protocols: AgentverseProtocol[];
  avatar_href: string | null;
  total_interactions: number;
  recent_interactions: number;
  rating: number;
  status: "active" | "inactive";
  type: "hosted" | "local";
  featured: boolean;
  category: string;
  system_wide_tags: string[];
  geo_location: { name: string } | null;
  handle: string | null;
  domain: string | null;
  metadata: Record<string, unknown> | null;
  last_updated: string;
  created_at: string;
  owner: string;
}

interface AgentverseSearchResponse {
  agents: AgentverseAgent[];
  total: number;
  offset: number;
  limit: number;
  tags: string[];
  categories: string[];
}

type ManowarAgentCard = {
  schemaVersion?: string;
  name?: string;
  description?: string;
  skills?: string[];
  image?: string;
  avatar?: string;
  dnaHash?: string;
  walletAddress?: string;
  chain?: number;
  model?: string;
  framework?: string;
  licensePrice?: string;
  licenses?: number;
  cloneable?: boolean;
  endpoint?: string;
  protocols?: Array<{ name: string; version: string }>;
  connectors?: Array<{ name?: string; registryId?: string; origin?: string }>;
  createdAt?: string;
  creator?: string;
};

type ManowarAgentPage = {
  agents?: ManowarAgentCard[];
  total?: number;
};

// =============================================================================
// Adapter Functions
// =============================================================================

/**
 * Tags to filter out (not useful for users)
 */
const FILTERED_TAGS = new Set([
  "fetch-ai",
  "fetchai",
  "hosted",
  "local",
  "system",
  "internal",
]);

/**
 * Normalize tags for better display
 */
function normalizeTags(tags: string[]): string[] {
  return tags
    .filter(t => !FILTERED_TAGS.has(t.toLowerCase()))
    .map(t => t.toLowerCase().replace(/[_-]/g, " "))
    .filter((t, i, arr) => arr.indexOf(t) === i) // dedupe
    .slice(0, 5); // limit to 5 tags
}

/**
 * Extract capability tags from description and protocols
 */
function extractCapabilityTags(description: string, protocols: AgentProtocol[]): string[] {
  const tags = new Set<string>();
  const descLower = description.toLowerCase();

  // Capability keywords
  const capabilities: Record<string, string[]> = {
    "defi": ["swap", "trade", "liquidity", "yield", "lending", "borrow", "stake"],
    "trading": ["trade", "exchange", "buy", "sell", "order", "market"],
    "nft": ["nft", "mint", "collection", "artwork", "token"],
    "social": ["twitter", "discord", "telegram", "post", "message", "chat"],
    "ai": ["gpt", "llm", "model", "inference", "generate", "analyze"],
    "data": ["data", "api", "fetch", "query", "analytics", "price"],
    "automation": ["automate", "schedule", "trigger", "workflow", "bot"],
    "payments": ["pay", "transfer", "send", "receive", "wallet"],
  };

  for (const [tag, keywords] of Object.entries(capabilities)) {
    if (keywords.some(kw => descLower.includes(kw))) {
      tags.add(tag);
    }
  }

  // Check protocols
  protocols.forEach(p => {
    const pName = p.name.toLowerCase();
    if (pName.includes("swap") || pName.includes("trade")) tags.add("trading");
    if (pName.includes("nft")) tags.add("nft");
    if (pName.includes("chat") || pName.includes("message")) tags.add("social");
  });

  return Array.from(tags);
}

/**
 * Convert Agentverse agent to unified Agent type
 */
function agentverseToAgent(av: AgentverseAgent): Agent {
  const protocols = av.protocols?.map(p => ({
    name: p.name,
    version: p.version,
    digest: p.digest,
  })) || [];

  // Get normalized tags + capability tags
  const baseTags = normalizeTags(av.system_wide_tags || []);
  const capabilityTags = extractCapabilityTags(av.description || av.readme || "", protocols);
  const allTags = Array.from(new Set([...baseTags, ...capabilityTags]));

  return {
    id: av.address,
    address: av.address,
    name: av.name,
    description: av.description || getReadmeExcerpt(av.readme),
    registry: "agentverse",
    readme: av.readme,
    protocols,
    avatarUrl: av.avatar_href,
    totalInteractions: av.total_interactions,
    recentInteractions: av.recent_interactions,
    rating: av.rating,
    status: av.status,
    type: av.type,
    featured: av.featured,
    verified: av.system_wide_tags?.includes("verified") || false,
    category: av.category || deriveCategory(allTags),
    tags: allTags,
    owner: av.owner,
    createdAt: av.created_at,
    updatedAt: av.last_updated,
    externalUrl: `https://agentverse.ai/agents/details/${av.address}/profile`,
  };
}

/**
 * Registry server record (from connector registry)
 */
interface RegistryServer {
  registryId: string;
  origin: string;
  name: string;
  namespace: string;
  slug: string;
  description: string;
  category?: string;
  tags: string[];
  toolCount: number;
  tools?: Array<{ name: string; description?: string }>;
}

/**
 * Convert registry server to Agent type
 */
function registryServerToAgent(server: RegistryServer, registry: AgentRegistryId): Agent {
  const protocols = server.tools?.map(t => ({
    name: t.name,
    version: "1.0.0",
  })) || [];

  const capabilityTags = extractCapabilityTags(server.description, protocols);
  const allTags = Array.from(new Set([...server.tags, ...capabilityTags])).slice(0, 8);

  return {
    id: server.registryId,
    address: server.registryId,
    name: server.name,
    description: server.description,
    registry,
    readme: "",
    protocols,
    avatarUrl: null,
    totalInteractions: 0,
    recentInteractions: 0,
    rating: 4.5, // Default rating for connectors
    status: "active",
    type: "hosted",
    featured: false,
    verified: true, // GOAT connectors are verified
    category: server.category || deriveCategory(allTags),
    tags: allTags,
    owner: server.namespace,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function manowarToAgent(card: ManowarAgentCard): Agent {
  const protocolList = Array.isArray(card.protocols) ? card.protocols : [];
  const protocols = protocolList.length > 0
    ? protocolList
    : [{ name: "x402", version: "1.0" }];
  const tags = Array.from(new Set([
    ...(card.skills || []),
    ...(card.connectors || []).map((connector) => connector.origin || "").filter(Boolean),
    "onchain",
    "manowar",
  ].map((tag) => tag.toLowerCase())));

  const priceWei = Number(card.licensePrice || "0");
  const pricePerRequest = Number.isFinite(priceWei) ? (priceWei / 1_000_000).toFixed(6) : "0.000000";
  const address = card.walletAddress || "";

  return {
    id: address,
    address,
    name: card.name || "Unnamed Agent",
    description: card.description || "",
    registry: "manowar",
    readme: card.description || "",
    protocols,
    avatarUrl: card.image || card.avatar || null,
    totalInteractions: 0,
    recentInteractions: 0,
    rating: 5,
    status: "active",
    type: card.endpoint ? "hosted" : "local",
    featured: false,
    verified: true,
    category: deriveCategory(tags),
    tags,
    owner: card.creator || address,
    createdAt: card.createdAt || new Date().toISOString(),
    updatedAt: card.createdAt || new Date().toISOString(),
    onchainAgentId: undefined,
    pricePerRequest,
  };
}

/**
 * Derive category from tags
 */
function deriveCategory(tags: string[]): string {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));

  if (tagSet.has("defi") || tagSet.has("trading") || tagSet.has("swap")) return "DeFi";
  if (tagSet.has("nft")) return "NFT";
  if (tagSet.has("social") || tagSet.has("discord") || tagSet.has("twitter")) return "Social";
  if (tagSet.has("ai") || tagSet.has("llm")) return "AI";
  if (tagSet.has("data") || tagSet.has("analytics")) return "Data";
  if (tagSet.has("automation")) return "Automation";

  return "Utility";
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Search Agentverse registry
 */
async function searchAgentverse(
  options: SearchAgentsOptions
): Promise<{ agents: Agent[]; total: number; tags: string[]; categories: string[] }> {
  const data = await sdk.directory.agents.agentverse({
    search: options.search,
    category: options.category,
    tags: options.tags,
    limit: options.limit,
    offset: options.offset,
    sort: options.sort,
    direction: options.direction,
  }) as unknown as AgentverseSearchResponse;

  return {
    agents: data.agents.map(agentverseToAgent),
    total: data.total,
    tags: data.tags,
    categories: data.categories,
  };
}

/**
 * Get connectors broker base URL
 */
function getConnectorBaseUrl(): string {
  const url = import.meta.env.VITE_CONNECTORS_URL;
  if (url) {
    return url.replace(/\/$/, "");
  }

  return "https://connectors.compose.market";
}

/**
 * Search GOAT connectors from the connectors broker /onchain endpoint
 */
async function searchGoat(
  options: SearchAgentsOptions
): Promise<{ agents: Agent[]; total: number; tags: string[]; categories: string[] }> {
  try {
    const response = await fetch(`${getConnectorBaseUrl()}/onchain`);

    if (!response.ok) {
      console.warn("Failed to fetch GOAT connectors:", response.status);
      return { agents: [], total: 0, tags: [], categories: [] };
    }

    const data = await response.json() as {
      connectors?: Array<{
        id: string;
        name: string;
        description: string;
        toolCount: number;
        requiresApiKey?: boolean;
        apiKeyConfigured?: boolean;
      }>;
    };

    const connectors = data.connectors || [];

    const servers: RegistryServer[] = connectors.map((p) => ({
      registryId: `onchain:${p.id}`,
      origin: "onchain",
      type: "connector",
      namespace: "goat",
      name: p.name,
      slug: p.id,
      description: p.description,
      tags: ["goat", "defi"],
      category: "defi",
      attributes: [],
      toolCount: p.toolCount,
      tools: [],
      available: true,
      executable: true,
      url: undefined,
    }));

    let filtered = servers;
    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = servers.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    if (options.tags?.length) {
      filtered = filtered.filter(s =>
        options.tags!.some(t => s.tags.includes(t.toLowerCase()))
      );
    }

    const agents = filtered.map(s => registryServerToAgent(s, "goat"));
    const allTags = new Set<string>();
    const allCategories = new Set<string>();

    agents.forEach(a => {
      a.tags.forEach(t => allTags.add(t));
      if (a.category) allCategories.add(a.category);
    });

    return {
      agents,
      total: agents.length,
      tags: Array.from(allTags).sort(),
      categories: Array.from(allCategories).sort(),
    };
  } catch (err) {
    console.warn("Error fetching GOAT connectors:", err);
    return { agents: [], total: 0, tags: [], categories: [] };
  }
}

/**
 * Search ManoWar native agent registry
 */
async function searchManowar(
  options: SearchAgentsOptions
): Promise<{ agents: Agent[]; total: number; tags: string[]; categories: string[] }> {
  try {
    const offset = Math.max(0, options.offset || 0);
    const limit = Math.max(1, options.limit || 30);
    const params = new URLSearchParams({
      limit: String(Math.max(1, Math.min(72, offset + limit))),
    });
    if (options.search) params.set("q", options.search);
    const response = await fetch(`${AGENTS_URL}/agents?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Agent lookup failed with status ${response.status}`);
    }
    const data = await response.json() as ManowarAgentPage;
    const cards = Array.isArray(data.agents) ? data.agents : [];

    let filtered = cards.filter((card) => typeof card.walletAddress === "string" && card.walletAddress.startsWith("0x"));

    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter((card) => {
        const name = (card.name || "").toLowerCase();
        const description = (card.description || "").toLowerCase();
        const skills = (card.skills || []).join(" ").toLowerCase();
        const model = (card.model || "").toLowerCase();
        return name.includes(q) || description.includes(q) || skills.includes(q) || model.includes(q);
      });
    }

    if (options.tags?.length) {
      const required = options.tags.map((tag) => tag.toLowerCase());
      filtered = filtered.filter((card) => {
        const skillTags = (card.skills || []).map((tag) => tag.toLowerCase());
        return required.some((tag) => skillTags.includes(tag));
      });
    }

    if (options.category) {
      const categoryQuery = options.category.toLowerCase();
      filtered = filtered.filter((card) => {
        const category = deriveCategory(card.skills || []).toLowerCase();
        return category === categoryQuery || category.includes(categoryQuery);
      });
    }

    const paged = filtered.slice(offset, offset + limit);

    const agents: Agent[] = paged.map(manowarToAgent);

    const allTags = Array.from(new Set(filtered.flatMap((card) => card.skills || []).map((tag) => tag.toLowerCase()))).sort();
    const allCategories = Array.from(new Set(filtered.map((card) => deriveCategory(card.skills || [])))).sort();

    return {
      agents,
      total: filtered.length,
      tags: allTags,
      categories: allCategories,
    };
  } catch (err) {
    console.warn("Error fetching manowar agents:", err);
    return { agents: [], total: 0, tags: [], categories: [] };
  }
}

/**
 * Unified search across all enabled registries
 */
export async function searchAgents(
  options: SearchAgentsOptions = {}
): Promise<AgentSearchResponse> {
  const registries = options.registries?.length
    ? options.registries.filter(r => AGENT_REGISTRIES[r]?.enabled)
    : (Object.keys(AGENT_REGISTRIES) as AgentRegistryId[]).filter(r => AGENT_REGISTRIES[r].enabled);

  // Fetch from all selected registries in parallel
  const results = await Promise.allSettled(
    registries.map(async (registry) => {
      switch (registry) {
        case "agentverse":
          return searchAgentverse(options);
        case "goat":
          return searchGoat(options);
        case "manowar":
          return searchManowar(options);
        default:
          return { agents: [], total: 0, tags: [], categories: [] };
      }
    })
  );

  // Merge results
  const allAgents: Agent[] = [];
  const allTags = new Set<string>();
  const allCategories = new Set<string>();
  let totalCount = 0;

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      allAgents.push(...result.value.agents);
      result.value.tags.forEach(t => allTags.add(t));
      result.value.categories.forEach(c => allCategories.add(c));
      totalCount += result.value.total;
    } else {
      console.warn(`Failed to fetch from ${registries[i]}:`, result.reason);
    }
  });

  // Sort merged results
  if (options.sort === "interactions") {
    allAgents.sort((a, b) =>
      options.direction === "asc"
        ? a.totalInteractions - b.totalInteractions
        : b.totalInteractions - a.totalInteractions
    );
  } else if (options.sort === "created-at") {
    allAgents.sort((a, b) =>
      options.direction === "asc"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } else if (options.sort === "relevancy" && options.search) {
    // Score-based relevancy sort
    const q = options.search.toLowerCase();
    allAgents.sort((a, b) => {
      const scoreA = getRelevancyScore(a, q);
      const scoreB = getRelevancyScore(b, q);
      return options.direction === "asc" ? scoreA - scoreB : scoreB - scoreA;
    });
  }

  return {
    agents: allAgents,
    total: totalCount,
    offset: options.offset || 0,
    limit: options.limit || 30,
    tags: Array.from(allTags).sort(),
    categories: Array.from(allCategories).sort(),
    registries,
  };
}

/**
 * Calculate relevancy score for search ranking
 */
function getRelevancyScore(agent: Agent, query: string): number {
  let score = 0;
  const nameLower = agent.name.toLowerCase();
  const descLower = agent.description.toLowerCase();

  // Exact name match
  if (nameLower === query) score += 100;
  // Name contains query
  else if (nameLower.includes(query)) score += 50;

  // Description contains query
  if (descLower.includes(query)) score += 20;

  // Tag match
  if (agent.tags.some(t => t.toLowerCase().includes(query))) score += 15;

  // Category match
  if (agent.category?.toLowerCase().includes(query)) score += 10;

  // Verified boost
  if (agent.verified) score += 5;

  // Interaction boost
  score += Math.min(agent.totalInteractions / 1000, 10);

  return score;
}

/**
 * Get a single agent by address
 */
export async function getAgent(address: string): Promise<Agent> {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    try {
      const response = await fetch(`${AGENTS_URL}/agent/${encodeURIComponent(address.toLowerCase())}`, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        return manowarToAgent(await response.json() as ManowarAgentCard);
      }
      if (response.status !== 404) {
        throw new Error(`Agent lookup failed with status ${response.status}`);
      }
    } catch {
      // Fall through to Agentverse search below; not every address is a native agent.
    }
  }

  const data = await sdk.directory.agents.agentverse({ search: address, limit: 25 }) as unknown as AgentverseSearchResponse;
  const match = data.agents.find((agent) => {
    const full = `${agent.prefix}${agent.address}`;
    return agent.address === address || full === address;
  });

  if (match) {
    return agentverseToAgent(match);
  }

  throw new Error(`Failed to fetch agent: ${address}`);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format interaction count for display
 */
export function formatInteractions(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

/**
 * Get a short excerpt from README
 */
export function getReadmeExcerpt(readme: string, maxLength = 150): string {
  if (!readme) return "";

  // Remove markdown badges and images
  let clean = readme
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[.*?\]\(.*?\)/g, "") // Remove links
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/#{1,6}\s+/g, "") // Remove headers
    .replace(/\*{1,2}(.*?)\*{1,2}/g, "$1") // Remove bold/italic
    .replace(/\n{2,}/g, " ") // Collapse newlines
    .trim();

  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).trim() + "...";
}

/**
 * Get display color for rating
 */
export function getRatingColor(rating: number): string {
  if (rating >= 4) return "text-green-400";
  if (rating >= 3) return "text-yellow-400";
  if (rating >= 2) return "text-orange-400";
  return "text-red-400";
}

/**
 * Common tags for filtering (capability-based)
 */
export const COMMON_TAGS = [
  "defi",
  "trading",
  "nft",
  "social",
  "ai",
  "data",
  "automation",
  "payments",
  "discord",
  "twitter",
  "telegram",
  "ethereum",
  "solana",
] as const;

/**
 * Check if agent has a specific capability based on protocols
 */
export function hasProtocol(agent: Agent, protocolName: string): boolean {
  return agent.protocols?.some(p =>
    p.name.toLowerCase().includes(protocolName.toLowerCase())
  ) ?? false;
}

/**
 * Get registry display info
 */
export function getRegistryInfo(registryId: AgentRegistryId) {
  return AGENT_REGISTRIES[registryId];
}

/**
 * Get all enabled registries
 */
export function getEnabledRegistries(): AgentRegistryId[] {
  return (Object.keys(AGENT_REGISTRIES) as AgentRegistryId[])
    .filter(id => AGENT_REGISTRIES[id].enabled);
}
