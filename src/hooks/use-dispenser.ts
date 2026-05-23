/**
 * Dispenser Hook
 *
 * React Query hooks for dispenser operations:
 * - Check dispenser status across chains
 * - Check if address has claimed
 * - Claim USDC from dispenser
 *
 * @module hooks/use-dispenser
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CHAIN_CONFIG } from "@/lib/chains";
import { sdk } from "@/lib/sdk";

// =============================================================================
// Types
// =============================================================================

export interface DispenserStatus {
    chainId: number;
    chainName: string;
    totalClaims: number;
    maxClaims: number;
    remainingClaims: number;
    dispenserBalance: string;
    dispenserBalanceFormatted: string;
    isPaused: boolean;
    dispenserAddress: string;
    usdcAddress: string;
    isConfigured: boolean;
}

export interface DispenserStatusResponse {
    dispensers: DispenserStatus[];
    claimAmount: number;
    claimAmountFormatted: string;
    maxClaims: number;
}

export interface ClaimResult {
    success: boolean;
    txHash?: string;
    error?: string;
    alreadyClaimed?: boolean;
    globalClaimStatus?: {
        claimedOnChain?: number;
        claimedOnChainName?: string;
        claimedAt?: number;
    };
}

export interface ClaimCheckResult {
    address: string;
    hasClaimed: boolean;
    claimedOnChain?: number;
    claimedOnChainName?: string;
    claimedAt?: number;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchDispenserStatus(): Promise<DispenserStatusResponse> {
    return sdk.dispenser.status();
}

async function fetchDispenserCheck(address: string): Promise<ClaimCheckResult> {
    return sdk.dispenser.check({ address });
}

async function claimDispenserUSDC(address: string, chainId: number): Promise<ClaimResult> {
    return sdk.dispenser.claim({ address, chainId });
}

// =============================================================================
// Query Keys
// =============================================================================

const dispenserKeys = {
    all: ["dispenser"] as const,
    status: () => [...dispenserKeys.all, "status"] as const,
    check: (address: string) => [...dispenserKeys.all, "check", address.toLowerCase()] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get dispenser status for all supported chains
 */
export function useDispenserStatus() {
    return useQuery({
        queryKey: dispenserKeys.status(),
        queryFn: fetchDispenserStatus,
        staleTime: 60 * 1000,
        refetchInterval: 120 * 1000,
    });
}

/**
 * Check if an address has claimed from any dispenser
 */
export function useDispenserCheck(address: string | undefined) {
    return useQuery({
        queryKey: dispenserKeys.check(address || ""),
        queryFn: () => fetchDispenserCheck(address!),
        enabled: !!address && address.startsWith("0x") && address.length === 42,
        staleTime: 30 * 1000,
    });
}

/**
 * Claim USDC from dispenser
 */
export function useDispenserClaim() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ address, chainId }: { address: string; chainId: number }) =>
            claimDispenserUSDC(address, chainId),
        onSuccess: (data, variables) => {
            if (data.success) {
                queryClient.invalidateQueries({
                    queryKey: dispenserKeys.check(variables.address),
                });
                queryClient.invalidateQueries({
                    queryKey: dispenserKeys.status(),
                });
            }
        },
    });
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: string, chainId: number): string {
    const baseUrl = CHAIN_CONFIG[chainId]?.explorer;
    return baseUrl ? `${baseUrl}/tx/${txHash}` : "#";
}

/**
 * Get chain color for UI
 */
export function getChainColor(chainId: number): string {
    const colors: Record<string, string> = {
        red: "text-red-400",
        cyan: "text-cyan-400",
        yellow: "text-yellow-400",
    };
    const colorKey = CHAIN_CONFIG[chainId]?.color;
    return colorKey ? colors[colorKey] || "text-cyan-400" : "text-cyan-400";
}
