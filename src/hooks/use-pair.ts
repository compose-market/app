import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount, useAdminWallet } from "thirdweb/react";
import type { WalletPairRecord } from "@compose-market/sdk";

import { sdk } from "@/lib/sdk";
import { durableQueryMeta, DURABLE_CACHE_MAX_AGE } from "@/lib/queryClient";
import { deriveSwigWalletAddress } from "@/lib/svm/account";

class AdminWalletUnavailableError extends Error {
    constructor() {
        super("The existing Thirdweb admin wallet is not available yet");
    }
}

function statusOf(error: unknown): number | undefined {
    return typeof error === "object"
        && error !== null
        && "status" in error
        && typeof error.status === "number"
        ? error.status
        : undefined;
}

export interface UseWalletPairReturn {
    owner: string | null;
    pair: WalletPairRecord | null;
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
}

export function useWalletPair(): UseWalletPairReturn {
    const account = useActiveAccount();
    const adminWallet = useAdminWallet();
    const evmAddress = account?.address?.toLowerCase() ?? null;
    const adminAddress = adminWallet?.getAccount?.()?.address ?? null;

    const query = useQuery<WalletPairRecord, Error>({
        queryKey: ["wallet-pair", evmAddress],
        queryFn: async () => {
            if (!evmAddress) throw new Error("An active EVM smart account is required");
            try {
                return await sdk.user.get(evmAddress);
            } catch (error) {
                const status = statusOf(error);
                if (status !== 404) throw error;
            }

            if (!adminAddress) throw new AdminWalletUnavailableError();
            const svmAddress = await deriveSwigWalletAddress(adminAddress);
            return sdk.user.set({
                evmAddress,
                svmAddress,
            });
        },
        enabled: Boolean(evmAddress),
        staleTime: DURABLE_CACHE_MAX_AGE,
        gcTime: DURABLE_CACHE_MAX_AGE,
        retry: (failureCount, error) => statusOf(error) !== 409 && failureCount < 2,
        meta: durableQueryMeta,
    });

    useEffect(() => {
        if (adminAddress && query.error instanceof AdminWalletUnavailableError) {
            void query.refetch();
        }
    }, [adminAddress, query.error, query.refetch]);

    return {
        owner: evmAddress,
        pair: query.data ?? null,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error ?? null,
    };
}
