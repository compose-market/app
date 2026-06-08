export const CHAIN_IDS = {
  avalancheFuji: 43113,
  avalanche: 43114,
  arbitrumTestnet: 421614,
  arbitrum: 42161,
  bscTestnet: 97,
  bsc: 56,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [CHAIN_IDS.avalancheFuji]: "0x5425890298aed601595a70AB815c96711a31Bc65",
  [CHAIN_IDS.avalanche]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  [CHAIN_IDS.arbitrumTestnet]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [CHAIN_IDS.arbitrum]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [CHAIN_IDS.bscTestnet]: "0x64544969ed7ebf5f083679233325356ebe738930",
  [CHAIN_IDS.bsc]: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
};

export const CHAIN_CONFIG: Record<number, {
  name: string;
  isTestnet: boolean;
  explorer: string;
  color: string;
}> = {
  [CHAIN_IDS.avalancheFuji]: {
    name: "Avalanche Fuji",
    isTestnet: true,
    explorer: "https://testnet.snowtrace.io",
    color: "red",
  },
  [CHAIN_IDS.avalanche]: {
    name: "Avalanche C-Chain",
    isTestnet: false,
    explorer: "https://snowtrace.io",
    color: "red",
  },
  [CHAIN_IDS.arbitrumTestnet]: {
    name: "Arbitrum Sepolia",
    isTestnet: true,
    explorer: "https://sepolia.arbiscan.io",
    color: "cyan",
  },
  [CHAIN_IDS.arbitrum]: {
    name: "Arbitrum One",
    isTestnet: false,
    explorer: "https://arbiscan.io",
    color: "cyan",
  },
  [CHAIN_IDS.bscTestnet]: {
    name: "BNB Smart Chain Testnet",
    isTestnet: true,
    explorer: "https://testnet.bscscan.com",
    color: "yellow",
  },
  [CHAIN_IDS.bsc]: {
    name: "BNB Smart Chain",
    isTestnet: false,
    explorer: "https://bscscan.com",
    color: "yellow",
  },
};

export const SUPPORTED_CHAIN_IDS = [
  CHAIN_IDS.avalancheFuji,
  CHAIN_IDS.arbitrumTestnet,
] as const;

export type Address = `0x${string}`;

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env ?? {};

// Deterministic Compose deployment uses the same contract addresses across supported chains.
const SHARED_COMPOSE_CONTRACTS = {
  AgentFactory: env.VITE_AGENT_FACTORY_ADDRESS as Address,
  Clone: env.VITE_CLONE_ADDRESS as Address,
  Warp: env.VITE_WARP_ADDRESS as Address,
  Workflow: env.VITE_WORKFLOW_ADDRESS as Address,
  RFA: env.VITE_RFA_ADDRESS as Address,
  Lease: env.VITE_LEASE_ADDRESS as Address,
  Royalties: env.VITE_ROYALTIES_ADDRESS as Address,
  Distributor: env.VITE_DISTRIBUTOR_ADDRESS as Address,
  Delegation: env.VITE_DELEGATION_ADDRESS as Address,
  AgentManager: env.VITE_AGENT_MANAGER_ADDRESS as Address,
  Utils: env.VITE_UTILS_ADDRESS as Address,
} as const;

export const CONTRACT_ADDRESSES = {
  [CHAIN_IDS.avalancheFuji]: { ...SHARED_COMPOSE_CONTRACTS },
  [CHAIN_IDS.arbitrumTestnet]: { ...SHARED_COMPOSE_CONTRACTS },
} as const;

export type ContractName = keyof typeof SHARED_COMPOSE_CONTRACTS;

export function getContractAddress(
  contract: ContractName,
  chainId: number = CHAIN_IDS.avalancheFuji,
): Address {
  const chainContracts = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  if (!chainContracts) {
    throw new Error(`Contract addresses not configured for chain ${chainId}`);
  }
  return chainContracts[contract];
}

export function getContractAddressForChain(contract: ContractName, chainId: number): Address {
  return getContractAddress(contract, chainId);
}

/**
 * Convert USDC wei to display amount.
 */
export function weiToUsdc(wei: bigint): string {
  return (Number(wei) / 1_000_000).toFixed(6);
}

/**
 * Format USDC wei for compact display.
 */
export function formatUsdcPrice(wei: bigint): string {
  const usdc = Number(wei) / 1_000_000;
  return usdc < 0.01 ? `$${usdc.toFixed(4)}` : `$${usdc.toFixed(2)}`;
}

/**
 * RFA bounty constraints.
 */
export const RFA_BOUNTY_LIMITS = {
  MIN_BOUNTY: 0.10,
  MAX_BOUNTY: 1.00,
  DEFAULT_BOUNTY: 0.50,
  BASIC_BOUNTY: 0.10,
  README_BONUS_MAX: 0.90,
} as const;
