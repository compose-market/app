import { useEffect, useRef } from "react";
import type { Event } from "@compose-market/sdk";

import { createReconciliationController } from "@/lib/reconciliation";

interface SubscriptionOptions {
  userAddress: string;
  signal: AbortSignal;
}

interface ReconciliationOptions {
  owner: string | null;
  subscribe: (options: SubscriptionOptions) => AsyncIterable<Event>;
  refetch: () => Promise<unknown>;
}

export function useReconciliation({
  owner,
  subscribe,
  refetch,
}: ReconciliationOptions): void {
  const subscribeRef = useRef(subscribe);
  const refetchRef = useRef(refetch);
  subscribeRef.current = subscribe;
  refetchRef.current = refetch;

  useEffect(() => {
    if (!owner) return;

    const abortController = new AbortController();
    const controller = createReconciliationController(() => refetchRef.current());
    const reconcile = () => {
      void controller.reconcile().catch(() => {
        // The authoritative query owns its visible error state. A later hint,
        // focus, online event, or lease-ready frame starts another cycle.
      });
    };

    const consume = async () => {
      try {
        for await (const event of subscribeRef.current({
          userAddress: owner,
          signal: abortController.signal,
        })) {
          if (event.type === "ready" || event.type === "invalidate") reconcile();
        }
      } catch {
        // The SDK retries transient failures and throws only terminal failures.
        // The list query remains authoritative and retains its own error state.
      }
    };

    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    void consume();

    return () => {
      abortController.abort();
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
    };
  }, [owner]);
}
