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
const STORAGE_KEY = "compose_selected_network";

const FIRST_TIME_DEFAULT: NetworkId = "eip155:5042002";

function initialNetwork(_defaultNetwork: NetworkId): NetworkId {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored as NetworkId;
  }
  return FIRST_TIME_DEFAULT;
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chains, setChains] = useState<FacilitatorChain[]>([]);
  const [defaultNetwork, setDefaultNetwork] = useState<NetworkId>("eip155:43113");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let current = true;
    fetchChains().then(
      (result) => {
        if (!current) return;
        setChainRegistry(result.chains, result.defaultNetwork);
        setChains(result.chains);
        setDefaultNetwork(result.defaultNetwork);
        setIsLoading(false);
      },
      (err: unknown) => {
        if (!current) return;
        setError(err instanceof Error ? err : new Error("Failed to fetch chains"));
        setIsLoading(false);
      },
    );
    return () => { current = false; };
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
