import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveAccount } from "thirdweb/react";

import { persistDurableQueries } from "@/lib/queryClient";

const OWNER_QUERY_ROOTS = new Set([
  "wallet-pair",
  "inference-analytics-dashboard",
  "keys",
]);

function removeOwnerQueries(owner: string, queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.removeQueries({
    predicate: (query) => {
      const [root, queryOwner] = query.queryKey;
      return typeof root === "string"
        && OWNER_QUERY_ROOTS.has(root)
        && queryOwner === owner;
    },
  });
}

export function OwnerCacheBoundary({ children }: { children: ReactNode }) {
  const account = useActiveAccount();
  const queryClient = useQueryClient();
  const owner = account?.address?.toLowerCase() ?? null;
  const previousOwner = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousOwner.current;
    previousOwner.current = owner;
    if (!previous || previous === owner) return;

    removeOwnerQueries(previous, queryClient);
    void persistDurableQueries(queryClient);
  }, [owner, queryClient]);

  return children;
}
