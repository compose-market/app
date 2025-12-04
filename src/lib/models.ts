// Available AI models for the Manowar platform
// Users can select any of these for their agents/workflows
// Pricing updated December 2025 with real provider costs

/**
 * Model Provider Types:
 * - openai: Uses OPENAI_API_KEY (mainstream GPT models)
 * - anthropic: Uses ANTHROPIC_API_KEY (mainstream Claude models)
 * - google: Uses GOOGLE_GENERATIVE_AI_API_KEY (mainstream Gemini models)
 * - asi-one: Uses ASI_ONE_API_KEY (ASI:1 models EXCEPT asi1-mini)
 * - oss: Uses ASI_INFERENCE_API_KEY via ASI Cloud (open-source models + asi1-mini)
 * - huggingface: Uses HUGGING_FACE_INFERENCE_TOKEN (HuggingFace inference)
 */
export type ModelProvider = "openai" | "anthropic" | "google" | "asi-one" | "oss" | "huggingface";

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  priceMultiplier: number; // Relative cost multiplier (1.0 = $1 per 1M tokens)
  maxTokens: number;
  capabilities: string[];
}

// =============================================================================
// MAINSTREAM MODELS (require respective API keys)
// =============================================================================

export const MAINSTREAM_MODELS: AIModel[] = [
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    provider: "openai",
    description: "Latest OpenAI flagship model with advanced reasoning",
    priceMultiplier: 6.63,
    maxTokens: 400000,
    capabilities: ["reasoning", "code", "analysis", "multimodal"],
  },
  {
    id: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Most capable Claude model, excels at coding (80.9% SWE-bench)",
    priceMultiplier: 16.0,
    maxTokens: 200000,
    capabilities: ["reasoning", "code", "analysis", "writing"],
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Balanced performance and cost for complex tasks",
    priceMultiplier: 10.0,
    maxTokens: 200000,
    capabilities: ["reasoning", "code", "analysis", "writing"],
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and efficient for routine tasks",
    priceMultiplier: 4.0,
    maxTokens: 200000,
    capabilities: ["reasoning", "code", "fast"],
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "google",
    description: "Google's flagship model with exceptional multimodal reasoning",
    priceMultiplier: 8.0,
    maxTokens: 1000000,
    capabilities: ["reasoning", "code", "analysis", "multimodal"],
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Fast multimodal model (experimental, free tier available)",
    priceMultiplier: 1.5,
    maxTokens: 1000000,
    capabilities: ["reasoning", "code", "multimodal", "fast"],
  },
];

// =============================================================================
// ASI:1 MODELS (native Fetch.ai models - use ASI_ONE_API_KEY)
// EXCEPT asi1-mini which uses ASI_INFERENCE_API_KEY (ASI Cloud)
// =============================================================================

export const ASI_ONE_MODELS: AIModel[] = [
  {
    id: "asi1-fast",
    name: "ASI-1 Fast",
    provider: "asi-one",
    description: "Ultra-low latency Web3 AI (87% MMLU)",
    priceMultiplier: 1.0,
    maxTokens: 64000,
    capabilities: ["reasoning", "fast", "web3"],
  },
  {
    id: "asi1-extended",
    name: "ASI-1 Extended",
    provider: "asi-one",
    description: "Advanced reasoning with agent orchestration (89% MMLU)",
    priceMultiplier: 1.0,
    maxTokens: 64000,
    capabilities: ["reasoning", "code", "agents", "web3"],
  },
  {
    id: "asi1-agentic",
    name: "ASI-1 Agentic",
    provider: "asi-one",
    description: "Agent discovery and orchestration with Agentverse integration",
    priceMultiplier: 1.0,
    maxTokens: 64000,
    capabilities: ["reasoning", "agents", "web3", "orchestration"],
  },
  {
    id: "asi1-graph",
    name: "ASI-1 Graph",
    provider: "asi-one",
    description: "Optimized for data analytics and graph visualization",
    priceMultiplier: 1.0,
    maxTokens: 64000,
    capabilities: ["reasoning", "analytics", "visualization"],
  },
];

// =============================================================================
// ASI CLOUD MODELS (use ASI_INFERENCE_API_KEY)
// Includes asi1-mini (default) + open-source models
// Source: https://docs.cudos.org/docs/asi-cloud/inference/pricing
// =============================================================================

export const ASI_CLOUD_MODELS: AIModel[] = [
  {
    id: "asi1-mini",
    name: "ASI-1 Mini",
    provider: "oss",
    description: "Web3-native AI, balanced performance (85% MMLU) - Default model",
    priceMultiplier: 1.0,
    maxTokens: 128000,
    capabilities: ["reasoning", "agents", "web3"],
  },
  {
    id: "google/gemma-3-27b-it",
    name: "Gemma 3 27B",
    provider: "oss",
    description: "Google's open model - $0.29/1M tokens",
    priceMultiplier: 1.29,
    maxTokens: 8192,
    capabilities: ["reasoning", "code"],
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "oss",
    description: "OpenAI's open-weight model - $0.16/1M tokens",
    priceMultiplier: 1.16,
    maxTokens: 8192,
    capabilities: ["reasoning", "code"],
  },
  {
    id: "nousresearch/hermes-4-70b",
    name: "Hermes 4 70B",
    provider: "oss",
    description: "NousResearch flagship - $0.73/1M tokens",
    priceMultiplier: 1.73,
    maxTokens: 8192,
    capabilities: ["reasoning", "code", "analysis"],
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "oss",
    description: "Meta's flagship - $0.73/1M tokens (86% MMLU, 88.4% HumanEval)",
    priceMultiplier: 1.73,
    maxTokens: 128000,
    capabilities: ["reasoning", "code", "analysis"],
  },
  {
    id: "mistralai/mistral-nemo",
    name: "Mistral Nemo",
    provider: "oss",
    description: "Mistral's efficient model - $0.05/1M tokens",
    priceMultiplier: 1.05,
    maxTokens: 128000,
    capabilities: ["reasoning", "code", "fast"],
  },
  {
    id: "qwen/qwen3-32b",
    name: "Qwen3 32B",
    provider: "oss",
    description: "Alibaba's multilingual model - $0.60/1M tokens",
    priceMultiplier: 1.60,
    maxTokens: 32768,
    capabilities: ["reasoning", "code", "multilingual"],
  },
  {
    id: "z-ai/glm-4.5-air",
    name: "GLM-4.5 Air",
    provider: "oss",
    description: "Zhipu AI's efficient model - $1.10/1M tokens",
    priceMultiplier: 2.10,
    maxTokens: 128000,
    capabilities: ["reasoning", "code", "analysis"],
  },
];

// =============================================================================
// Combined Models List
// =============================================================================

export const AVAILABLE_MODELS: AIModel[] = [
  ...MAINSTREAM_MODELS,
  ...ASI_ONE_MODELS,
  ...ASI_CLOUD_MODELS,
];

// =============================================================================
// Helper Functions
// =============================================================================

// Get model by ID
export function getModelById(id: string): AIModel | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

// Get models by provider
export function getModelsByProvider(provider: ModelProvider): AIModel[] {
  return AVAILABLE_MODELS.filter((m) => m.provider === provider);
}

// Get models by capability
export function getModelsByCapability(capability: string): AIModel[] {
  return AVAILABLE_MODELS.filter((m) => m.capabilities.includes(capability));
}

// Check if a model uses ASI infrastructure
export function isAsiModel(model: AIModel): boolean {
  return model.provider === "asi-one" || model.provider === "oss";
}

// Check if a model is a mainstream model (uses provider-specific API key)
export function isMainstreamModel(model: AIModel): boolean {
  return ["openai", "anthropic", "google"].includes(model.provider);
}

// Get the API key environment variable name for a provider
export function getApiKeyEnvName(provider: ModelProvider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    case "asi-one":
      return "ASI_ONE_API_KEY";
    case "oss":
      return "ASI_INFERENCE_API_KEY";
    case "huggingface":
      return "HUGGING_FACE_INFERENCE_TOKEN";
    default:
      return "ASI_INFERENCE_API_KEY";
  }
}

// Default model for new agents (ASI-1 Mini - uses ASI_INFERENCE_API_KEY)
export const DEFAULT_MODEL_ID = "asi1-mini";
