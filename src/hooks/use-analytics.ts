import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useActiveAccount } from "thirdweb/react";
import type { InferenceAnalytics } from "@compose-market/sdk";

import type { NetworkId } from "@compose-market/sdk/chains";

import { useChain } from "@/contexts/Network";
import { sdk } from "@/lib/sdk";
import { summarize, type Summary } from "@/lib/analytics";

const STALE_TIME = 30_000;
const CACHE_KEY = "inference-analytics-dashboard";

export interface AnalyticsRange {
  from: string;
  to: string;
  interval: InferenceAnalytics.InferenceAnalyticsInterval;
}

export interface UseAnalyticsReturn {
  summary: Summary | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  forceRefresh: () => Promise<void>;
}

export function useAnalytics(filters: InferenceAnalytics.InferenceAnalyticsFilters): UseAnalyticsReturn {
  const account = useActiveAccount();
  const { paymentNetwork } = useChain();
  const queryClient = useQueryClient();
  const canonical = useMemo(() => ({ ...filters, network: filters.network ?? paymentNetwork }), [filters, paymentNetwork]);

  useEffect(() => {
    if (account?.address && canonical.network) sdk.wallets.attach({ address: account.address, network: canonical.network as NetworkId });
  }, [account?.address, canonical.network]);

  const query = useQuery<Summary, Error>({
    queryKey: [CACHE_KEY, account?.address, canonical],
    queryFn: async () => summarize(await sdk.analytics.get(canonical)),
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 4,
    enabled: Boolean(account?.address && canonical.network),
    retry: 1,
  });

  const forceRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [CACHE_KEY] });
  }, [queryClient]);

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isRefetching: query.isFetching && !query.isLoading,
    error: query.error ?? null,
    forceRefresh,
  };
}
