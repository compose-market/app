/**
 * Hooks for reading on-chain Manowar protocol data
 * Fetches agents and workflows from deployed contracts
 */
import { useQuery } from "@tanstack/react-query";
import { readContract } from "thirdweb";
import { 
  getAgentFactoryContract, 
  getManowarContract,
  getWarpContract,
  AgentFactoryABI,
  ManowarABI,
  WarpABI,
  formatUsdcPrice,
  weiToUsdc,
  type AgentData,
  type ManowarData,
} from "@/lib/contracts";
import { getIpfsUrl } from "@/lib/pinata";
import type { AgentCard, ManowarMetadata } from "@/lib/pinata";

// =============================================================================
// Types
// =============================================================================

export interface OnchainAgent {
  id: number;
  dnaHash: string;
  walletAddress: string; // Derived wallet address (primary identifier)
  units: number;
  unitsMinted: number;
  unitsAvailable: number;
  price: string;
  priceFormatted: string;
  creator: string;
  cloneable: boolean;
  isClone: boolean;
  parentAgentId: number;
  agentCardUri: string;
  // Resolved metadata from IPFS
  metadata?: AgentCard;
  // Warp status
  isWarped: boolean;
}

export interface OnchainManowar {
  id: number;
  title: string;
  description: string;
  banner: string;
  totalPrice: string;
  x402Price: string;
  units: number;
  unitsMinted: number;
  creator: string;
  leaseEnabled: boolean;
  leaseDuration: number;
  leasePercent: number;
  coordinatorAgentId: number;
  coordinatorModel: string;
  hasActiveRfa: boolean;
  rfaId: number;
  // Resolved metadata
  metadata?: ManowarMetadata;
  agentIds?: number[];
}

// =============================================================================
// Contract Read Helpers
// =============================================================================

async function fetchAgentData(agentId: number): Promise<OnchainAgent | null> {
  try {
    const factoryContract = getAgentFactoryContract();
    const data = await readContract({
      contract: factoryContract,
      method: "function getAgentData(uint256 agentId) view returns ((bytes32 dnaHash, uint256 units, uint256 unitsMinted, uint256 price, address creator, bool cloneable, bool isClone, uint256 parentAgentId, string agentCardUri))",
      params: [BigInt(agentId)],
    }) as AgentData;
    
    const units = Number(data.units);
    const unitsMinted = Number(data.unitsMinted);
    
    // Check if this agent was created via warp
    let isWarped = false;
    try {
      const warpContract = getWarpContract();
      isWarped = await readContract({
        contract: warpContract,
        method: "function isWarped(uint256 agentId) view returns (bool)",
        params: [BigInt(agentId)],
      }) as boolean;
    } catch {
      // Warp check failed, assume not warped
      isWarped = false;
    }
    
    // walletAddress will be populated from IPFS metadata in fetchAgentMetadata
    // NOT derived here - metadata is the single source of truth
    return {
      id: agentId,
      dnaHash: data.dnaHash,
      walletAddress: "", // Populated from metadata
      units,
      unitsMinted,
      unitsAvailable: units === 0 ? Infinity : units - unitsMinted,
      price: weiToUsdc(data.price),
      priceFormatted: formatUsdcPrice(data.price),
      creator: data.creator,
      cloneable: data.cloneable,
      isClone: data.isClone,
      parentAgentId: Number(data.parentAgentId),
      agentCardUri: data.agentCardUri,
      isWarped,
    };
  } catch (error) {
    console.error(`Failed to fetch agent ${agentId}:`, error);
    return null;
  }
}

async function fetchAgentMetadata(agent: OnchainAgent): Promise<OnchainAgent> {
  if (!agent.agentCardUri || !agent.agentCardUri.startsWith("ipfs://")) {
    return agent;
  }
  
  try {
    const cid = agent.agentCardUri.replace("ipfs://", "");
    
    // Validate CID format - proper IPFS CIDs start with 'Qm' (v0) or 'bafy/bafk' (v1)
    // Skip fetching if CID looks invalid (e.g., timestamp-based names from old mints)
    if (!cid.startsWith("Qm") && !cid.startsWith("baf")) {
      console.warn(`[use-onchain] Skipping invalid CID for agent ${agent.id}: ${cid}`);
      return agent;
    }
    
    const url = getIpfsUrl(cid);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch metadata");
    const metadata = await response.json() as AgentCard;
    
    // walletAddress comes from IPFS metadata - this is the SINGLE SOURCE OF TRUTH
    // Frontend and backend both read this, neither derives it
    const walletAddress = metadata.walletAddress || agent.walletAddress;
    
    return { ...agent, metadata, walletAddress };
  } catch (error) {
    console.error(`Failed to fetch metadata for agent ${agent.id}:`, error);
    return agent;
  }
}

/**
 * Find an agent by its wallet address (stored in IPFS metadata)
 * Iterates through all agents and checks metadata for matching wallet
 */
async function fetchAgentByWalletAddress(walletAddress: string): Promise<OnchainAgent | null> {
  try {
    const contract = getAgentFactoryContract();
    
    // Get total agents count
    const total = await readContract({
      contract,
      method: "function totalAgents() view returns (uint256)",
      params: [],
    }) as bigint;
    
    const totalNum = Number(total);
    const normalizedSearch = walletAddress.toLowerCase();
    
    // Search through all agents (most recent first for efficiency)
    // Agent IDs start at 1, not 0
    for (let i = totalNum; i >= 1; i--) {
      const agent = await fetchAgentData(i);
      if (!agent) continue;
      
      // Fetch metadata to get the wallet address (source of truth)
      const agentWithMeta = await fetchAgentMetadata(agent);
      
      if (agentWithMeta.walletAddress && agentWithMeta.walletAddress.toLowerCase() === normalizedSearch) {
        return agentWithMeta;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to find agent by wallet ${walletAddress}:`, error);
    return null;
  }
}

async function fetchManowarData(manowarId: number): Promise<OnchainManowar | null> {
  try {
    const contract = getManowarContract();
    const data = await readContract({
      contract,
      method: "function getManowarData(uint256 manowarId) view returns ((string title, string description, string banner, uint256 totalPrice, uint256 x402Price, uint256 units, uint256 unitsMinted, address creator, bool leaseEnabled, uint256 leaseDuration, uint8 leasePercent, uint256 coordinatorAgentId, string coordinatorModel, bool hasActiveRfa, uint256 rfaId))",
      params: [BigInt(manowarId)],
    }) as ManowarData;
    
    return {
      id: manowarId,
      title: data.title,
      description: data.description,
      banner: data.banner,
      totalPrice: weiToUsdc(data.totalPrice),
      x402Price: weiToUsdc(data.x402Price),
      units: Number(data.units),
      unitsMinted: Number(data.unitsMinted),
      creator: data.creator,
      leaseEnabled: data.leaseEnabled,
      leaseDuration: Number(data.leaseDuration),
      leasePercent: data.leasePercent,
      coordinatorAgentId: Number(data.coordinatorAgentId),
      coordinatorModel: data.coordinatorModel,
      hasActiveRfa: data.hasActiveRfa,
      rfaId: Number(data.rfaId),
    };
  } catch (error) {
    console.error(`Failed to fetch manowar ${manowarId}:`, error);
    return null;
  }
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all on-chain agents from AgentFactory
 */
export function useOnchainAgents(options?: { includeMetadata?: boolean }) {
  const { includeMetadata = true } = options || {};
  
  return useQuery({
    queryKey: ["onchain-agents", includeMetadata],
    queryFn: async () => {
      const contract = getAgentFactoryContract();
      
      // Get total agents count
      const total = await readContract({
        contract,
        method: "function totalAgents() view returns (uint256)",
        params: [],
      }) as bigint;
      
      const totalNum = Number(total);
      if (totalNum === 0) return [];
      
      // Fetch all agents (IDs start at 1)
      const agentPromises = Array.from({ length: totalNum }, (_, i) => 
        fetchAgentData(i + 1)
      );
      
      let agents = (await Promise.all(agentPromises)).filter((a): a is OnchainAgent => a !== null);
      
      // Optionally fetch metadata
      if (includeMetadata) {
        agents = await Promise.all(agents.map(fetchAgentMetadata));
      }
      
      return agents;
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: 2,
  });
}

/**
 * Fetch a single agent by numeric ID
 */
export function useOnchainAgent(agentId: number | null) {
  return useQuery({
    queryKey: ["onchain-agent", agentId],
    queryFn: async () => {
      if (!agentId) return null;
      const agent = await fetchAgentData(agentId);
      if (!agent) return null;
      return fetchAgentMetadata(agent);
    },
    enabled: !!agentId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single agent by wallet address
 * This is the preferred method since wallet address is the canonical identifier
 */
export function useOnchainAgentByWallet(walletAddress: string | null) {
  return useQuery({
    queryKey: ["onchain-agent-wallet", walletAddress?.toLowerCase()],
    queryFn: async () => {
      if (!walletAddress) return null;
      return fetchAgentByWalletAddress(walletAddress);
    },
    enabled: !!walletAddress && walletAddress.startsWith("0x"),
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single agent by either ID or wallet address
 * Automatically detects the identifier type
 */
export function useOnchainAgentByIdentifier(identifier: string | null) {
  // Determine if identifier is a wallet address (0x...) or numeric ID
  // Wallet address = 0x + 40 hex chars = 42 total
  const isWalletAddress = identifier?.startsWith("0x") && identifier.length === 42;
  const numericId = !isWalletAddress && identifier ? parseInt(identifier) : null;
  const walletAddress = isWalletAddress ? identifier : null;
  
  const byIdQuery = useOnchainAgent(!isWalletAddress ? numericId : null);
  const byWalletQuery = useOnchainAgentByWallet(isWalletAddress ? walletAddress : null);
  
  if (isWalletAddress) {
    return byWalletQuery;
  }
  return byIdQuery;
}

/**
 * Fetch agents owned by a specific address
 */
export function useAgentsByCreator(creator: string | undefined) {
  const { data: allAgents, ...rest } = useOnchainAgents();
  
  return {
    ...rest,
    data: allAgents?.filter(a => 
      a.creator.toLowerCase() === creator?.toLowerCase()
    ),
  };
}

/**
 * Fetch all on-chain manowars
 */
export function useOnchainManowars(options?: { 
  includeRFA?: boolean;
  onlyComplete?: boolean;
}) {
  const { includeRFA = false, onlyComplete = true } = options || {};
  
  return useQuery({
    queryKey: ["onchain-manowars", includeRFA, onlyComplete],
    queryFn: async () => {
      const contract = getManowarContract();
      
      // Get total manowars count
      const total = await readContract({
        contract,
        method: "function totalManowars() view returns (uint256)",
        params: [],
      }) as bigint;
      
      const totalNum = Number(total);
      if (totalNum === 0) return [];
      
      // Fetch all manowars (IDs start at 1)
      const manowarPromises = Array.from({ length: totalNum }, (_, i) => 
        fetchManowarData(i + 1)
      );
      
      let manowars = (await Promise.all(manowarPromises)).filter((m): m is OnchainManowar => m !== null);
      
      // Filter based on options
      if (onlyComplete && !includeRFA) {
        manowars = manowars.filter(m => !m.hasActiveRfa);
      } else if (includeRFA && !onlyComplete) {
        manowars = manowars.filter(m => m.hasActiveRfa);
      }
      
      return manowars;
    },
    staleTime: 30 * 1000,
    retry: 2,
  });
}

/**
 * Fetch manowars owned by a specific address
 */
export function useManowarsByCreator(creator: string | undefined) {
  const { data: allManowars, ...rest } = useOnchainManowars({ onlyComplete: false });
  
  return {
    ...rest,
    data: allManowars?.filter(m => 
      m.creator.toLowerCase() === creator?.toLowerCase()
    ),
  };
}

/**
 * Fetch manowars with active RFAs (for marketplace RFA tab)
 */
export function useManowarsWithRFA() {
  return useOnchainManowars({ includeRFA: true, onlyComplete: false });
}



