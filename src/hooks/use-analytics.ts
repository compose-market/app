import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InferenceAnalytics } from "@compose-market/sdk";

import { useReconciliation } from "@/hooks/use-reconciliation";
import { useWalletPair } from "@/hooks/use-pair";
import {
  buildAnalyticsQueryKey,
  buildRollingAnalyticsFilters,
  mapFeedItem,
  mapRequestRow,
  summarize,
  type FeedItem,
  type RequestRow,
  type Summary,
} from "@/lib/analytics";
import { durableQueryMeta, DURABLE_CACHE_MAX_AGE } from "@/lib/queryClient";
import { sdk } from "@/lib/sdk";

const STALE_TIME = 30_000;

type StableFilters = Omit<
  InferenceAnalytics.InferenceAnalyticsFilters,
  "from" | "to" | "networks"
>;

export type ActivityKind = "requests" | "settlements";

export interface UseAnalyticsInput {
  rangeId: string;
  rangeMs: number;
  networks: readonly string[];
  filters: StableFilters;
}

export interface UseAnalyticsReturn {
  summary: Summary | null;
  /** Base request page merged with any cursor-paged extras. */
  requests: RequestRow[];
  /** Base settlement page merged with any cursor-paged extras. */
  activity: FeedItem[];
  hasMoreRequests: boolean;
  hasMoreSettlements: boolean;
  isLoadingMore: boolean;
  loadMore: (kind: ActivityKind) => Promise<void>;
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

  // ── Cursor paging for the Activity block (requests + settlements) ──
  const [extraRequests, setExtraRequests] = useState<RequestRow[]>([]);
  const [extraSettlements, setExtraSettlements] = useState<FeedItem[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const cursorsRef = useRef<{ request?: string | null; settlement?: string | null }>({});

  const resetKey = `${input.rangeId}:${JSON.stringify(input.filters)}:${input.networks.join(",")}`;
  useEffect(() => {
    setExtraRequests([]);
    setExtraSettlements([]);
    cursorsRef.current = {};
  }, [resetKey]);

  const summary = query.data ?? null;

  const loadMore = useCallback(async (kind: ActivityKind) => {
    if (!owner || !summary || isLoadingMore) return;
    const baseCursor = kind === "requests"
      ? summary.response.requests.nextCursor
      : summary.response.settlements.nextCursor;
    const cursor = kind === "requests"
      ? cursorsRef.current.request ?? baseCursor
      : cursorsRef.current.settlement ?? baseCursor;
    if (!cursor) return;

    setIsLoadingMore(true);
    try {
      const filters = buildRollingAnalyticsFilters({
        rangeMs: input.rangeMs,
        filters: input.filters,
        networks: input.networks,
      });
      const response = await sdk.analytics.get(
        { ...filters, [kind === "requests" ? "requestCursor" : "settlementCursor"]: cursor },
        { userAddress: owner },
      );
      if (kind === "requests") {
        cursorsRef.current.request = response.requests.nextCursor;
        setExtraRequests((current) => [...current, ...response.requests.data.map(mapRequestRow)]);
      } else {
        cursorsRef.current.settlement = response.settlements.nextCursor;
        setExtraSettlements((current) => [...current, ...response.settlements.data.map(mapFeedItem)]);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [owner, summary, isLoadingMore, input.rangeMs, input.filters, input.networks]);

  const requestCursor = cursorsRef.current.request !== undefined
    ? cursorsRef.current.request
    : summary?.response.requests.nextCursor ?? null;
  const settlementCursor = cursorsRef.current.settlement !== undefined
    ? cursorsRef.current.settlement
    : summary?.response.settlements.nextCursor ?? null;

  const forceRefresh = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    summary,
    requests: summary ? [...summary.requests, ...extraRequests] : [],
    activity: summary ? [...summary.activity, ...extraSettlements] : [],
    hasMoreRequests: Boolean(requestCursor),
    hasMoreSettlements: Boolean(settlementCursor),
    isLoadingMore,
    loadMore,
    isLoading: Boolean(owner) && (pairLoading || query.isLoading),
    isRefetching: query.isFetching && !query.isLoading,
    error: pairError ?? query.error ?? null,
    forceRefresh,
  };
}
