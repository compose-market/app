// Available AI models for the Manowar platform
// Users can select any of these for their agents/workflows
// Models are fetched dynamically from the /api/registry endpoints
// to ensure consistency, deduplication, and valid inference providers.

/**
 * Model Provider Types:
 * - openai: Uses OPENAI_API_KEY
 * - anthropic: Uses ANTHROPIC_API_KEY
 * - google: Uses GOOGLE_GENERATIVE_AI_API_KEY
 * - asi-one: Uses ASI_ONE_API_KEY
 * - asi-cloud: Uses ASI_INFERENCE_API_KEY
 * - huggingface: Uses HUGGING_FACE_INFERENCE_TOKEN via Router
 * - openrouter: Uses OPENROUTER_API_KEY
 * - aiml: Uses AIML_API_KEY
 */
export type ModelProvider = "openai" | "anthropic" | "google" | "asi-one" | "asi-cloud" | "huggingface" | "openrouter" | "aiml";

export interface ProviderPricing {
  provider: string;
  status: "live" | "staging" | "offline";
  contextLength?: number;
  pricing?: {
    input: number;  // USD per million tokens
    output: number; // USD per million tokens
  };
}

export interface AIModel {
  id: string;
  name: string;
  ownedBy: string;
  source: ModelProvider;
  task?: string;
  description?: string; // Optional, often constructed on frontend if missing
  available: boolean;
  contextLength?: number;
  pricing?: {
    provider: string;
    input: number;
    output: number;
  };
  providers?: ProviderPricing[];
}

export interface ModelRegistry {
  models: AIModel[];
  lastUpdated: number;
  sources: string[];
}

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Fetch available models from the backend registry
 * This endpoint returns deduplicated models with valid inference providers
 */
export async function fetchAvailableModels(): Promise<AIModel[]> {
  try {
    const res = await fetch(`${API_BASE}/api/registry/models/available`);
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const data = await res.json();
    return data.models || [];
  } catch (error) {
    console.error("[models] Failed to fetch available models:", error);
    return [];
  }
}

/**
 * Fetch all models including unavailable ones (registry full view)
 */
export async function fetchModelRegistry(): Promise<ModelRegistry | null> {
  try {
    const res = await fetch(`${API_BASE}/api/registry/models`);
    if (!res.ok) throw new Error(`Failed to fetch registry: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[models] Failed to fetch registry:", error);
    return null;
  }
}

/**
 * Get the API key environment variable name for a provider
 * Useful for UI hints on what keys are needed
 */
export function getApiKeyEnvName(provider: string): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    case "asi-one":
      return "ASI_ONE_API_KEY";
    case "asi-cloud":
    case "oss":
      return "ASI_INFERENCE_API_KEY";
    case "huggingface":
      return "HUGGING_FACE_INFERENCE_TOKEN";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "aiml":
      return "AIML_API_KEY";
    default:
      return "ASI_INFERENCE_API_KEY";
  }
}

// Check if a model uses ASI infrastructure
export function isAsiModel(model: AIModel): boolean {
  return model.source === "asi-one" || model.source === "asi-cloud";
}

// Default model ID to use if selection is missing
export const DEFAULT_MODEL_ID = "asi1-mini";

// Export legacy list for backward compatibility with `compose.tsx` and `create-agent.tsx`
// This will be populated dynamically, but keeping the export avoids breaking imports
// Since those files depend on it being an array, we export a static list of "core" models
export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: "asi1-mini",
    name: "ASI-1 Mini",
    ownedBy: "asi-cloud",
    source: "asi-cloud",
    available: true,
    pricing: { provider: "asi-cloud", input: 0.1, output: 0.1 }
  }
];
