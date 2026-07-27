/**
 * useKeys — React Query hook for listing, creating, and revoking Keys.
 *
 * Uses the unsigned x-session-user-address header for list/create (no session needed).
 * Revocation requires a compose key JWT — uses the SDK's current token.
 */

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { sdk } from "@/lib/sdk";
import { useActiveAccount } from "thirdweb/react";
import { useSession } from "@/hooks/use-session";
import { SESSION_BUDGET_PRESETS } from "@/lib/chains";
import type { KeyRecord } from "@compose-market/sdk";
export type { KeyRecord };
import type { NetworkId } from "@compose-market/sdk/chains";

const STALE_TIME = 15_000;
const CACHE_KEY = ["keys"];

export interface CreateKeyInput {
  name: string;
  budgetUsd: string;
  durationHours: number;
  network?: NetworkId;
  purpose?: "session" | "api";
}

export interface UseKeysReturn {
  keys: KeyRecord[];
  activeKeys: KeyRecord[];
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  forceRefresh: () => Promise<void>;
  createKey: (input: CreateKeyInput) => Promise<{ token: string; keyId: string }>;
  revokeKey: (keyId: string) => Promise<void>;
  isCreating: boolean;
  isRevoking: boolean;
  createdToken: string | null;
  createdKeyId: string | null;
  clearCreatedToken: () => void;
  createError: string | null;
  budgetPresets: typeof SESSION_BUDGET_PRESETS;
}

function isActiveKey(key: KeyRecord): boolean {
  return !key.revokedAt && key.expiresAt > Date.now();
}

export function useKeys(): UseKeysReturn {
  const account = useActiveAccount();
  const { ensureKeyToken } = useSession();
  const queryClient = useQueryClient();

  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdKeyId, setCreatedKeyId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading, isFetching, error } = useQuery<KeyRecord[], Error>({
    queryKey: [...CACHE_KEY, account?.address],
    queryFn: async () => {
      const keys = await sdk.keys.list();
      return keys.sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 4,
    enabled: Boolean(account?.address),
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateKeyInput) => {
      const previousToken = sdk.keys.currentToken();

      const created = await sdk.keys.create({
        purpose: input.purpose ?? "api",
        budgetUsd: input.budgetUsd,
        durationHours: input.durationHours,
        network: input.network,
        name: input.name,
      });

      if (previousToken && previousToken !== created.token) {
        sdk.keys.use(previousToken);
      }

      return { token: created.token, keyId: created.keyId };
    },
    onSuccess: (result) => {
      setCreatedToken(result.token);
      setCreatedKeyId(result.keyId);
      setCreateError(null);
      void queryClient.invalidateQueries({ queryKey: CACHE_KEY });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create key";
      setCreateError(message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await ensureKeyToken();
      await sdk.keys.revoke(keyId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CACHE_KEY });
    },
  });

  const forceRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CACHE_KEY });
  }, [queryClient]);

  const createKey = useCallback(
    async (input: CreateKeyInput) => {
      const result = await createMutation.mutateAsync(input);
      return result;
    },
    [createMutation],
  );

  const revokeKey = useCallback(
    async (keyId: string) => {
      await revokeMutation.mutateAsync(keyId);
    },
    [revokeMutation],
  );

  const clearCreatedToken = useCallback(() => {
    setCreatedToken(null);
    setCreatedKeyId(null);
    setCreateError(null);
  }, []);

  const keys = data ?? [];
  const activeKeys = useMemo(() => keys.filter(isActiveKey), [keys]);

  return {
    keys,
    activeKeys,
    isLoading,
    isRefetching: isFetching && !isLoading,
    error: error ?? null,
    forceRefresh,
    createKey,
    revokeKey,
    isCreating: createMutation.isPending,
    isRevoking: revokeMutation.isPending,
    createdToken,
    createdKeyId,
    clearCreatedToken,
    createError,
    budgetPresets: SESSION_BUDGET_PRESETS,
  };
}
