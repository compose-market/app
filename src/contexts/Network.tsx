import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchChains, type FacilitatorChain, type NetworkId } from "@compose-market/sdk/chains";
import { evmChainId, getChainByNetwork, isEvmNetwork, setChainRegistry } from "@/lib/chains";

interface NetworkValue {
  selectedNetwork: NetworkId;
  setSelectedNetwork: (network: NetworkId) => void;
  paymentNetwork: NetworkId;
  chains: FacilitatorChain[];
  evmChains: FacilitatorChain[];
  solanaChains: FacilitatorChain[];
  defaultNetwork: NetworkId;
  isLoading: boolean;
  error: Error | null;
  getChainById: (chainId: number) => FacilitatorChain | undefined;
  getChainByNetworkId: (network: string) => FacilitatorChain | undefined;
}

const Network = createContext<NetworkValue | null>(null);
const STORAGE_KEY = "selected_network";
const REGISTRY_CACHE_KEY = "chain_registry";
const FETCH_CHAINS_TIMEOUT_MS = 8_000;

const FIRST_TIME_DEFAULT: NetworkId = "eip155:5042002";

interface CachedChainRegistry {
  chains: FacilitatorChain[];
  defaultNetwork: NetworkId;
  fetchedAt: number;
}

/**
 * The chain registry changes rarely and is needed to render anything useful
 * (the whole app gates on it). Cache it in localStorage so reloads hydrate
 * synchronously and revalidate in the background, instead of blocking first
 * paint on GET /api/x402/facilitator/chains (un-cached, un-timeout'ed at the
 * SDK layer).
 */
function readCachedRegistry(): CachedChainRegistry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REGISTRY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChainRegistry;
    if (!Array.isArray(parsed?.chains) || parsed.chains.length === 0) return null;
    if (typeof parsed?.defaultNetwork !== "string" || !parsed.defaultNetwork) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedRegistry(chains: FacilitatorChain[], defaultNetwork: NetworkId): void {
  try {
    localStorage.setItem(
      REGISTRY_CACHE_KEY,
      JSON.stringify({ chains, defaultNetwork, fetchedAt: Date.now() } satisfies CachedChainRegistry),
    );
  } catch {
    // Quota / private-mode failures are non-fatal: next reload just refetches.
  }
}

function initialNetwork(_defaultNetwork: NetworkId): NetworkId {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored as NetworkId;
  }
  return FIRST_TIME_DEFAULT;
}

export function ChainProvider({ children }: { children: ReactNode }) {
  // Synchronously hydrate from the cached registry so the module-level chain
  // registry (lib/chains.ts) and all dependent UI work on first render.
  // setChainRegistry is idempotent, so a double-invoked initializer is safe.
  const [cachedRegistry] = useState<CachedChainRegistry | null>(() => {
    const cached = readCachedRegistry();
    if (cached) setChainRegistry(cached.chains, cached.defaultNetwork);
    return cached;
  });
  const [chains, setChains] = useState<FacilitatorChain[]>(cachedRegistry?.chains ?? []);
  const [defaultNetwork, setDefaultNetwork] = useState<NetworkId>(
    cachedRegistry?.defaultNetwork ?? "eip155:43113",
  );
  const [isLoading, setIsLoading] = useState(!cachedRegistry);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), FETCH_CHAINS_TIMEOUT_MS);
    fetchChains({ signal: controller.signal }).then(
      (result) => {
        if (!current) return;
        setChainRegistry(result.chains, result.defaultNetwork);
        writeCachedRegistry(result.chains, result.defaultNetwork);
        setChains(result.chains);
        setDefaultNetwork(result.defaultNetwork);
        setIsLoading(false);
      },
      (err: unknown) => {
        if (!current) return;
        if (cachedRegistry) {
          // A stale registry beats an error screen — keep it and warn.
          console.warn("[chains] revalidation failed, using cached registry", err);
          setIsLoading(false);
          return;
        }
        setError(err instanceof Error ? err : new Error("Failed to fetch chains"));
        setIsLoading(false);
      },
    );
    return () => {
      current = false;
      globalThis.clearTimeout(timeout);
      controller.abort();
    };
    // cachedRegistry is the constant mount-time snapshot; revalidation runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evmChains = chains.filter((c) => c.namespace === "eip155" || (c.network ?? "").startsWith("eip155:"));
  const solanaChains = chains.filter((c) => c.namespace === "solana" || (c.network ?? "").startsWith("solana:"));

  const getChainById = (chainId: number) =>
    evmChains.find((c) => isEvmNetwork(c.network) && evmChainId(c.network) === chainId);

  const getChainByNetworkId = (network: string) =>
    getChainByNetwork(network) ?? chains.find((c) => c.network === network);

  const [selectedNetwork, setSelectedNetworkState] = useState<NetworkId>(
    () => initialNetwork("eip155:5042002"),
  );

  useEffect(() => {
    if (!isLoading && chains.length > 0) {
      setSelectedNetworkState((prev) => {
        const chain = getChainByNetworkId(prev);
        if (chain) return prev;
        return defaultNetwork;
      });
    }
  }, [isLoading, chains.length, defaultNetwork]);

  const setSelectedNetwork = (network: NetworkId) => {
    setSelectedNetworkState(network);
    localStorage.setItem(STORAGE_KEY, network);
  };

  return (
    <Network.Provider
      value={{
        selectedNetwork,
        setSelectedNetwork,
        paymentNetwork: selectedNetwork,
        chains,
        evmChains,
        solanaChains,
        defaultNetwork,
        isLoading,
        error,
        getChainById,
        getChainByNetworkId,
      }}
    >
      {children}
    </Network.Provider>
  );
}

export function useChain(): NetworkValue {
  const context = useContext(Network);
  if (!context) throw new Error("useChain must be used within a ChainProvider");
  return context;
}
