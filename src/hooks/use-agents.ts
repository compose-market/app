/**
 * React hooks for agent discovery across multiple registries
 */
import { useQuery } from "@tanstack/react-query";
import {
  searchAgents,
  getAgent,
  type SearchAgentsOptions,
  type AgentSearchResponse,
  type Agent,
} from "@/lib/agents";

/**
 * Hook to search and fetch agents across registries
 */
export function useAgents(options: SearchAgentsOptions = {}) {
  return useQuery<AgentSearchResponse>({
    queryKey: [
      "agents",
      options.search,
      options.category,
      options.tags,
      options.registries,
      options.status,
      options.limit,
      options.offset,
      options.sort,
      options.direction,
    ],
    queryFn: () => searchAgents(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch a single agent by address
 */
export function useAgent(address: string | null) {
  return useQuery<Agent>({
    queryKey: ["agent", address],
    queryFn: () => getAgent(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to fetch agents with pagination
 */
export function useAgentsPaginated(
  options: Omit<SearchAgentsOptions, "offset"> & { page?: number }
) {
  const { page = 1, limit = 30, ...rest } = options;
  const offset = (page - 1) * limit;
  
  return useQuery<AgentSearchResponse>({
    queryKey: [
      "agents-paginated",
      rest.search,
      rest.category,
      rest.tags,
      rest.registries,
      rest.status,
      limit,
      page,
      rest.sort,
      rest.direction,
    ],
    queryFn: () => searchAgents({ ...rest, limit, offset }),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

