/**
 * Agent Discovery System
 * Generic types and functions for discovering agents across multiple registries
 */

import { apiUrl } from "./api";

// =============================================================================
// Registry System
// =============================================================================

/**
 * Agent registries/ecosystems that can be queried
 * Similar to model providers in backend/lambda/lib/models.ts
 */
export const AGENT_REGISTRIES = {
  agentverse: {
    id: "agentverse",
    name: "Agentverse",
    description: "Fetch.ai autonomous agent marketplace",
    url: "https://agentverse.ai",
    enabled: true,
  },
  manowar: {
    id: "manowar",
    name: "ManoWar",
    description: "Compose.Market native agents",
    url: null,
    enabled: false, // Coming soon
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

// =============================================================================
// Adapter Functions
// =============================================================================

/**
 * Convert Agentverse agent to unified Agent type
 */
function agentverseToAgent(av: AgentverseAgent): Agent {
  return {
    id: av.address,
    address: av.address,
    name: av.name,
    description: av.description || getReadmeExcerpt(av.readme),
    registry: "agentverse",
    readme: av.readme,
    protocols: av.protocols?.map(p => ({
      name: p.name,
      version: p.version,
      digest: p.digest,
    })) || [],
    avatarUrl: av.avatar_href,
    totalInteractions: av.total_interactions,
    recentInteractions: av.recent_interactions,
    rating: av.rating,
    status: av.status,
    type: av.type,
    featured: av.featured,
    verified: av.system_wide_tags?.includes("verified") || false,
    category: av.category,
    tags: av.system_wide_tags || [],
    owner: av.owner,
    createdAt: av.created_at,
    updatedAt: av.last_updated,
    externalUrl: `https://agentverse.ai/agents/details/${av.address}/profile`,
  };
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
  const params = new URLSearchParams();
  
  if (options.search) params.set("search", options.search);
  if (options.category) params.set("category", options.category);
  if (options.tags?.length) params.set("tags", options.tags.join(","));
  if (options.status) params.set("status", options.status);
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  if (options.sort) params.set("sort", options.sort);
  if (options.direction) params.set("direction", options.direction);
  
  const response = await fetch(apiUrl(`/api/agentverse/agents?${params}`));
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `Failed to fetch agents: ${response.status}`);
  }
  
  const data: AgentverseSearchResponse = await response.json();
  
  return {
    agents: data.agents.map(agentverseToAgent),
    total: data.total,
    tags: data.tags,
    categories: data.categories,
  };
}

/**
 * Search ManoWar registry (placeholder for future)
 */
async function searchManowar(
  _options: SearchAgentsOptions
): Promise<{ agents: Agent[]; total: number; tags: string[]; categories: string[] }> {
  // TODO: Implement when ManoWar registry is ready
  return { agents: [], total: 0, tags: [], categories: [] };
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
 * Get a single agent by address
 */
export async function getAgent(address: string): Promise<Agent> {
  // For now, only Agentverse is implemented
  const response = await fetch(apiUrl(`/api/agentverse/agents/${encodeURIComponent(address)}`));
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `Failed to fetch agent: ${response.status}`);
  }
  
  const data: AgentverseAgent = await response.json();
  return agentverseToAgent(data);
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
 * Common tags for filtering
 */
export const COMMON_TAGS = [
  "verified",
  "fetch-ai",
  "finance",
  "ai",
  "automation",
  "data",
  "web3",
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

