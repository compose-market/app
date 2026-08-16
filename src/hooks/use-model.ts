/**
 * useModels - Central React Query hook for model fetching
 *
 * Single source of truth for selector/search model data. Fetches the compact
 * `/v1/models/index`; selected full cards and params use independent queries.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import {
    buildTypeCategories,
    getModelTypeValues,
    normalizeModelSearchText,
    rankCatalogModels,
    type CatalogModel,
    type ModelCategory,
    type SemanticModelHit,
} from "@/lib/models";
import { sdk } from "@/lib/sdk";
import { durableQueryMeta, DURABLE_CACHE_MAX_AGE } from "@/lib/queryClient";

// =============================================================================
// Types
// =============================================================================

export interface UseModelsOptions {
    type?: string;
    family?: string;
    search?: string;
    enabled?: boolean;
}

export interface UseModelsReturn {
    models: CatalogModel[];
    frontiers: FrontierModelRef[];
    filteredModels: CatalogModel[];
    isLoading: boolean;
    isRefetching: boolean;
    error: Error | null;
    forceRefresh: () => Promise<void>;
    lastUpdated: Date | null;
    typeCategories: ModelCategory[];
}

export interface FrontierModelRef {
    modelId: string;
    provider: string;
    family?: string;
    isFrontier: boolean;
    isLatest: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const STALE_TIME = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_KEY = ["models-catalog-index"];
const MODELS_URL = (import.meta.env.VITE_MODELS_URL ?? "https://models.compose.market").replace(/\/+$/u, "");
const MODELS_ORIGIN = new URL(MODELS_URL).origin;
const FRONTIERS_CACHE_KEY = ["models-latest-compact", MODELS_ORIGIN, 1];

// =============================================================================
// Hook
// =============================================================================

async function fetchCatalog(): Promise<CatalogModel[]> {
    const response = await sdk.fetch("/v1/models/index", {
        method: "GET",
        cache: "no-cache",
        key: null,
        paymentMode: "key",
    });
    if (!response.ok) {
        throw new Error(`Failed to load model index: ${response.status}`);
    }
    const result = await response.json() as { data?: unknown };
    if (!Array.isArray(result.data) || result.data.length === 0) {
        throw new Error("No models returned from /v1/models/index");
    }

    return result.data as CatalogModel[];
}

async function fetchFrontiers(): Promise<FrontierModelRef[]> {
    const response = await fetch(`${MODELS_ORIGIN}/models?latest=1&compact=1&limit=200`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-cache",
    });
    if (!response.ok) throw new Error(`Failed to load frontier models: ${response.status}`);
    const body = await response.json() as { data?: unknown };
    if (!Array.isArray(body.data)) throw new Error("Invalid frontier model response");
    const frontiers = body.data.flatMap((item): FrontierModelRef[] => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (row.isLatest !== true || typeof row.modelId !== "string" || typeof row.provider !== "string") return [];
        return [{
            modelId: row.modelId,
            provider: row.provider,
            ...(typeof row.family === "string" ? { family: row.family } : {}),
            isFrontier: row.isFrontier === true,
            isLatest: true,
        }];
    });
    if (frontiers.length === 0) throw new Error("No frontier models returned");
    return frontiers;
}

export function useModels(options: UseModelsOptions = {}): UseModelsReturn {
    const { type, family, search, enabled = true } = options;
    const queryClient = useQueryClient();

    const {
        data: models = [],
        isLoading,
        isFetching,
        error,
        dataUpdatedAt,
    } = useQuery<CatalogModel[], Error>({
        queryKey: CACHE_KEY,
        queryFn: fetchCatalog,
        staleTime: STALE_TIME,
        gcTime: DURABLE_CACHE_MAX_AGE,
        enabled,
        meta: durableQueryMeta,
    });
    const frontierQuery = useQuery<FrontierModelRef[], Error>({
        queryKey: FRONTIERS_CACHE_KEY,
        queryFn: fetchFrontiers,
        staleTime: 5 * 60 * 1000,
        gcTime: DURABLE_CACHE_MAX_AGE,
        enabled,
        retry: 0,
        meta: durableQueryMeta,
    });
    const frontiers = frontierQuery.data ?? [];

    // Filter models based on options
    const filteredModels = useMemo(() => {
        let result = models;

        if (type && type !== "all") {
            result = result.filter((model) => getModelTypeValues(model).includes(type));
        }

        if (family && family !== "all") {
            result = result.filter((model) => (model.family || model.provider) === family);
        }

        if (search?.trim()) {
            result = rankCatalogModels(result, search, result.length).map((entry) => entry.model);
        }

        return result;
    }, [models, type, family, search]);

    const typeCategories = useMemo(() => buildTypeCategories(models), [models]);

    // Manual refresh - named distinctly to avoid collision with query.refetch
    const forceRefresh = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: CACHE_KEY }),
            queryClient.invalidateQueries({ queryKey: FRONTIERS_CACHE_KEY }),
        ]);
    }, [queryClient]);

    const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

    return {
        models,
        frontiers,
        filteredModels,
        isLoading,
        isRefetching: (isFetching && !isLoading) || frontierQuery.isFetching,
        error: error || null,
        forceRefresh,
        lastUpdated,
        typeCategories,
    };
}

export interface UseModelResourceReturn<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
}

async function fetchModelResource<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await sdk.fetch(path, {
        method: "GET",
        signal,
        key: null,
        paymentMode: "key",
    });
    if (!response.ok) throw new Error(`Model resource request failed: ${response.status}`);
    return await response.json() as T;
}

export function useModelDetails(modelId: string | null): UseModelResourceReturn<CatalogModel> {
    const result = useQuery<CatalogModel, Error>({
        queryKey: ["model-card", modelId],
        queryFn: ({ signal }) => fetchModelResource<CatalogModel>(
            `/v1/models/${encodeURIComponent(modelId!)}`,
            signal,
        ),
        enabled: Boolean(modelId),
        staleTime: STALE_TIME,
        gcTime: DURABLE_CACHE_MAX_AGE,
        meta: durableQueryMeta,
    });
    return { data: result.data ?? null, isLoading: result.isLoading, error: result.error ?? null };
}

export function useModelParams<T>(modelId: string | null): UseModelResourceReturn<T> {
    const result = useQuery<T, Error>({
        queryKey: ["model-params", modelId],
        queryFn: ({ signal }) => fetchModelResource<T>(
            `/v1/models/${encodeURIComponent(modelId!)}/params`,
            signal,
        ),
        enabled: Boolean(modelId),
        staleTime: STALE_TIME,
        gcTime: DURABLE_CACHE_MAX_AGE,
        meta: durableQueryMeta,
    });
    return { data: result.data ?? null, isLoading: result.isLoading, error: result.error ?? null };
}

export interface UseSemanticModelSearchOptions {
    enabled?: boolean;
    limit?: number;
}

export interface UseSemanticModelSearchReturn {
    hits: SemanticModelHit[];
    isLoading: boolean;
    error: Error | null;
}

/**
 * Semantic ranking hints from models.compose.market. These are never selected
 * directly; CommandBar resolves every hit back to the canonical loaded catalog.
 */
export function useSemanticModelSearch(
    query: string,
    options: UseSemanticModelSearchOptions = {},
): UseSemanticModelSearchReturn {
    const normalized = normalizeModelSearchText(query);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const enabled = (options.enabled ?? true) && normalized.replace(/\s+/gu, "").length >= 3;

    const result = useQuery<SemanticModelHit[], Error>({
        queryKey: ["models-semantic-search", normalized, limit],
        queryFn: async ({ signal }) => {
            const target = new URL(`${MODELS_URL}/search`);
            target.searchParams.set("q", query.trim());
            target.searchParams.set("limit", String(limit));
            target.searchParams.set("compact", "1");
            const response = await fetch(target, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal,
            });
            if (!response.ok) {
                throw new Error(`Semantic model search failed: ${response.status}`);
            }
            const body = await response.json() as { data?: unknown };
            if (!Array.isArray(body.data)) return [];
            return body.data.flatMap((item): SemanticModelHit[] => {
                if (!item || typeof item !== "object") return [];
                const row = item as Record<string, unknown>;
                if (typeof row.modelId !== "string" || typeof row.provider !== "string") return [];
                return [{
                    ...(typeof row.key === "string" ? { key: row.key } : {}),
                    modelId: row.modelId,
                    provider: row.provider,
                    ...(typeof row.family === "string" ? { family: row.family } : {}),
                    ...(typeof row.name === "string" || row.name === null ? { name: row.name as string | null } : {}),
                    score: typeof row.score === "number" ? row.score : 0,
                }];
            });
        },
        enabled,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
    });

    return {
        hits: result.data ?? [],
        isLoading: result.isFetching,
        error: result.error ?? null,
    };
}

// =============================================================================
// Convenience Hooks
// =============================================================================

export function useModel(modelId: string | null): CatalogModel | null {
    const { models } = useModels({ enabled: !!modelId });
    return useMemo(() => {
        if (!modelId) return null;
        return models.find((model) => model.modelId === modelId) || null;
    }, [models, modelId]);
}

export function useModelsByType(type: string): CatalogModel[] {
    const { filteredModels } = useModels({ type });
    return filteredModels;
}

export function useModelsByFamily(family: string): CatalogModel[] {
    const { filteredModels } = useModels({ family });
    return filteredModels;
}
