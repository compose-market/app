import { useState, useCallback, useMemo } from "react";
import { useChat, type UseChatOptions } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { useActiveWallet } from "thirdweb/react";
import { thirdwebClient, calculateCostUSDC, PRICE_PER_TOKEN_WEI } from "@/lib/thirdweb";
import { useSession } from "@/hooks/use-session";
import { apiUrl, apiFetch } from "@/lib/api";
import type { AIModel } from "@/lib/models";

interface UseInferenceOptions {
  model: AIModel;
  systemPrompt?: string;
  onPaymentRequired?: () => void;
  onInsufficientFunds?: (topUpUrl: string) => void;
  onSessionBudgetExceeded?: () => void;
}

interface InferenceState {
  isConnected: boolean;
  isGenerating: boolean;
  lastCost: string | null;
  totalCost: string;
  tokenCount: number;
}

/**
 * Hook for making paid AI inference calls via x402
 * Automatically handles wallet connection and payment flow
 * 
 * When a session is active:
 * - Uses session budget (no wallet signatures needed)
 * - Tracks usage against budget
 * - Falls back to per-call signing when session exhausted
 */
export function useInference(options: UseInferenceOptions) {
  const { 
    model, 
    systemPrompt, 
    onPaymentRequired, 
    onInsufficientFunds,
    onSessionBudgetExceeded,
  } = options;
  
  const wallet = useActiveWallet();
  const { session, recordUsage, hasBudget } = useSession();
  
  const [state, setState] = useState<InferenceState>({
    isConnected: false,
    isGenerating: false,
    lastCost: null,
    totalCost: "0",
    tokenCount: 0,
  });

  // Create payment-wrapped fetch if wallet is connected
  const fetchWithPayment = useMemo(() => {
    if (!wallet) return null;
    return wrapFetchWithPayment(fetch, thirdwebClient, wallet) as typeof globalThis.fetch;
  }, [wallet]);

  // Create chat transport
  // When session is active, include session info in headers for server-side settlement
  const transport = useMemo(() => {
    if (!fetchWithPayment) return undefined;
    
    // Custom fetch that adds session headers when active
    const sessionAwareFetch: typeof globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      
      // Add session info for server-side budget tracking
      if (session.isActive && session.sessionKeyAddress) {
        headers.set("x-session-active", "true");
        headers.set("x-session-budget-remaining", session.budgetRemaining.toString());
      }
      
      return fetchWithPayment(input, { ...init, headers });
    };
    
    return new DefaultChatTransport({ 
      fetch: sessionAwareFetch,
      api: apiUrl("/api/inference"),
    });
  }, [fetchWithPayment, session.isActive, session.sessionKeyAddress, session.budgetRemaining]);

  const chatOptions: UseChatOptions<UIMessage> = {
    id: `inference-${model.id}`,
    transport,
    onError: (error: Error) => {
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.error === "insufficient_funds" && errorData.fundWalletLink) {
          onInsufficientFunds?.(errorData.fundWalletLink);
        } else if (errorData.error === "session_budget_exceeded") {
          onSessionBudgetExceeded?.();
        } else if (errorData.status === 402) {
          onPaymentRequired?.();
        }
      } catch {
        console.error("Inference error:", error.message);
      }
      setState((s) => ({ ...s, isGenerating: false }));
    },
    onFinish: ({ message }) => {
      // Extract token count from metadata if available
      // In new AI SDK, metadata is in message.metadata instead of annotations
      const messageMetadata = message.metadata as Record<string, unknown> | undefined;
      const totalTokens = messageMetadata?.totalTokens;
      
      if (typeof totalTokens === "number") {
        const tokens = totalTokens;
        const costWei = Math.ceil(PRICE_PER_TOKEN_WEI * model.priceMultiplier * tokens);
        const cost = calculateCostUSDC(tokens * model.priceMultiplier);
        
        // Record usage against session budget if active
        if (session.isActive) {
          recordUsage(costWei);
        }
        
        setState((s) => ({
          ...s,
          isGenerating: false,
          lastCost: cost,
          tokenCount: s.tokenCount + tokens,
          totalCost: calculateCostUSDC((s.tokenCount + tokens) * model.priceMultiplier),
        }));
      } else {
        setState((s) => ({ ...s, isGenerating: false }));
      }
    },
  };

  const chat = useChat(chatOptions);

  // Wrapped send that checks wallet connection and session budget
  const sendMessage = useCallback(
    async (content: string) => {
      if (!wallet) {
        onPaymentRequired?.();
        return;
      }
      
      // Estimate max cost for this call
      const estimatedMaxCost = Math.ceil(
        PRICE_PER_TOKEN_WEI * model.priceMultiplier * 100000 // Max 100k tokens
      );
      
      // Check session budget if active
      if (session.isActive && !hasBudget(estimatedMaxCost)) {
        onSessionBudgetExceeded?.();
        // Continue anyway - will fall back to per-call signing
      }
      
      setState((s) => ({ ...s, isGenerating: true }));
      
      // Use the new sendMessage API
      // First arg is message, second arg is request options
      chat.sendMessage(
        { text: content },
        { 
          body: {
            modelId: model.id,
            systemPrompt,
            sessionActive: session.isActive,
          },
        }
      );
    },
    [wallet, chat, session.isActive, hasBudget, model.priceMultiplier, model.id, systemPrompt, onPaymentRequired, onSessionBudgetExceeded]
  );

  return {
    ...chat,
    sendMessage,
    isConnected: !!wallet,
    isGenerating: state.isGenerating,
    lastCost: state.lastCost,
    totalCost: state.totalCost,
    tokenCount: state.tokenCount,
    model,
    // Session info
    sessionActive: session.isActive,
    sessionBudgetRemaining: session.budgetRemaining,
  };
}

/**
 * Hook to fetch available models from the backend
 */
export function useModels() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/models");
      if (!response.ok) throw new Error("Failed to fetch models");
      const data = await response.json();
      setModels(data.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { models, loading, error, refetch: fetchModels };
}
