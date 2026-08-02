import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InferenceAnalytics } from "@compose-market/sdk";

import { useReconciliation } from "@/hooks/use-reconciliation";
import { useWalletPair } from "@/hooks/use-pair";
import {
  buildAnalyticsQueryKey,
  buildRollingAnalyticsFilters,
  summarize,
  type Summary,
} from "@/lib/analytics";
import { durableQueryMeta, DURABLE_CACHE_MAX_AGE } from "@/lib/queryClient";
import { sdk } from "@/lib/sdk";

const STALE_TIME = 30_000;

type StableFilters = Omit<
  InferenceAnalytics.InferenceAnalyticsFilters,
  "from" | "to" | "networks"
>;

export interface UseAnalyticsInput {
  rangeId: string;
  rangeMs: number;
  networks: readonly string[];
  filters: StableFilters;
}

export interface UseAnalyticsReturn {
  summary: Summary | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  forceRefresh: () => Promise<void>;
}

export function useAnalytics(input: UseAnalyticsInput): UseAnalyticsReturn {
  const { owner, pair, isLoading: pairLoading, error: pairError } = useWalletPair();
  const queryKey = buildAnalyticsQueryKey(owner ?? "", input.rangeId, input.networks, input.filters);

  const query = useQuery<
    InferenceAnalytics.InferenceAnalyticsResponse,
    Error,
    Summary
  >({
    queryKey,
    queryFn: async () => {
      if (!owner) throw new Error("An active EVM smart account is required");
      const filters = buildRollingAnalyticsFilters({
        rangeMs: input.rangeMs,
        filters: input.filters,
        networks: input.networks,
      });
      return sdk.analytics.get(filters, { userAddress: owner });
    },
    select: summarize,
    staleTime: STALE_TIME,
    gcTime: DURABLE_CACHE_MAX_AGE,
    enabled: Boolean(owner && pair),
    retry: 1,
    meta: durableQueryMeta,
  });

  useReconciliation({
    owner: pair ? owner : null,
    subscribe: (options) => sdk.analytics.subscribe(options),
    refetch: query.refetch,
  });

  const forceRefresh = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    summary: query.data ?? null,
    isLoading: Boolean(owner) && (pairLoading || query.isLoading),
    isRefetching: query.isFetching && !query.isLoading,
    error: pairError ?? query.error ?? null,
    forceRefresh,
  };
}
