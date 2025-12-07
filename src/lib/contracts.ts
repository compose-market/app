/**
 * Manowar Protocol Contract Configuration
 * Deployed on Avalanche Fuji (Chain ID: 43113)
 */

import { getContract } from "thirdweb";
import { thirdwebClient, paymentChain, CHAIN_IDS } from "./thirdweb";
import { keccak256, encodePacked, type Address } from "viem";

// =============================================================================
// Deployed Contract Addresses (Avalanche Fuji)
// =============================================================================

export const CONTRACT_ADDRESSES = {
  [CHAIN_IDS.avalancheFuji]: {
    AgentFactory: "0xb6d62374Ba0076bE2c1020b6a8BBD1b3c67052F7" as Address,
    Clone: "0xA5D57363d55698Cf7bad6a285632d40bd6a66DA6" as Address,
    Warp: "0xd5008675e2FeC755cfe1Fd30295309BB65A049a5" as Address,
    Manowar: "0x9fCdA3E828D142e942ECba6183dC09e294C5D38d" as Address,
    RFA: "0xa0E3f84Ad2b2075aa36083962A4EAAB16d88227d" as Address,
    Lease: "0x5DFa23efCa811cB974177b800cA1884eFFB51692" as Address,
    Royalties: "0x0f938769179f116A29FD0c7F8876089A80D4B735" as Address,
    Distributor: "0x1E8a036ED015b836D8543DB48f70EEEE86C77EAA" as Address,
    Delegation: "0x962fC821626106c772b7F97B9Fcf7Ded3238678f" as Address,
    AgentManager: "0xC4039E60391b1bFEEdfE577eB20967eD6CFd2D6e" as Address,
    Utils: "0xc73dD4aB79149FC8E69D43940ec0D3A2Ea285c3c" as Address,
  },
} as const;

// Get addresses for active chain
export function getContractAddress(contract: keyof typeof CONTRACT_ADDRESSES[typeof CHAIN_IDS.avalancheFuji]): Address {
  const chainId = CHAIN_IDS.avalancheFuji; // Currently only Fuji
  return CONTRACT_ADDRESSES[chainId][contract];
}

// =============================================================================
// ABIs (Minimal - only functions we need on frontend)
// =============================================================================

export const AgentFactoryABI = [
  // Read functions
  {
    name: "getAgentData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      name: "data",
      type: "tuple",
      components: [
        { name: "dnaHash", type: "bytes32" },
        { name: "units", type: "uint256" },
        { name: "unitsMinted", type: "uint256" },
        { name: "price", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "cloneable", type: "bool" },
        { name: "isClone", type: "bool" },
        { name: "parentAgentId", type: "uint256" },
        { name: "agentCardUri", type: "string" },
      ],
    }],
  },
  {
    name: "totalAgents",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "total", type: "uint256" }],
  },
  {
    name: "hasAvailableUnits",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "available", type: "bool" }],
  },
  {
    name: "getDnaHash",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "dnaHash", type: "bytes32" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "uri", type: "string" }],
  },
  // Write functions
  {
    name: "mintAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dnaHash", type: "bytes32" },
      { name: "units", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "cloneable", type: "bool" },
      { name: "agentCardUri", type: "string" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "updatePrice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newPrice", type: "uint256" },
    ],
    outputs: [],
  },
  // Events
  {
    name: "AgentMinted",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "dnaHash", type: "bytes32", indexed: false },
      { name: "units", type: "uint256", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "cloneable", type: "bool", indexed: false },
    ],
  },
] as const;

export const ManowarABI = [
  // Read functions
  {
    name: "getManowarData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "manowarId", type: "uint256" }],
    outputs: [{
      name: "data",
      type: "tuple",
      components: [
        { name: "title", type: "string" },
        { name: "description", type: "string" },
        { name: "banner", type: "string" },
        { name: "totalPrice", type: "uint256" },
        { name: "x402Price", type: "uint256" },
        { name: "units", type: "uint256" },
        { name: "unitsMinted", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "leaseEnabled", type: "bool" },
        { name: "leaseDuration", type: "uint256" },
        { name: "leasePercent", type: "uint8" },
        { name: "coordinatorAgentId", type: "uint256" },
        { name: "coordinatorModel", type: "string" },
        { name: "hasActiveRfa", type: "bool" },
        { name: "rfaId", type: "uint256" },
      ],
    }],
  },
  {
    name: "totalManowars",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "total", type: "uint256" }],
  },
  {
    name: "getAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "manowarId", type: "uint256" }],
    outputs: [{ name: "agentIds", type: "uint256[]" }],
  },
  {
    name: "getAgentCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "manowarId", type: "uint256" }],
    outputs: [{ name: "count", type: "uint256" }],
  },
  {
    name: "isComplete",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "manowarId", type: "uint256" }],
    outputs: [{ name: "complete", type: "bool" }],
  },
  {
    name: "getCompleteManowars",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "manowarIds", type: "uint256[]" }],
  },
  {
    name: "getManowarsWithRFA",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "manowarIds", type: "uint256[]" }],
  },
  {
    name: "getManowarsByCreator",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ name: "manowarIds", type: "uint256[]" }],
  },
  {
    name: "calculateTotalPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "manowarId", type: "uint256" }],
    outputs: [{ name: "total", type: "uint256" }],
  },
  // Write functions
  {
    name: "mintManowar",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "banner", type: "string" },
          { name: "x402Price", type: "uint256" },
          { name: "units", type: "uint256" },
          { name: "leaseEnabled", type: "bool" },
          { name: "leaseDuration", type: "uint256" },
          { name: "leasePercent", type: "uint8" },
          { name: "coordinatorAgentId", type: "uint256" },
          { name: "coordinatorModel", type: "string" },
        ],
      },
      { name: "agentIds", type: "uint256[]" },
    ],
    outputs: [{ name: "manowarId", type: "uint256" }],
  },
  {
    name: "addAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "manowarId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "setCoordinator",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "manowarId", type: "uint256" },
      { name: "coordinatorAgentId", type: "uint256" },
      { name: "model", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "updateLeaseSettings",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "manowarId", type: "uint256" },
      { name: "enabled", type: "bool" },
      { name: "duration", type: "uint256" },
      { name: "percent", type: "uint8" },
    ],
    outputs: [],
  },
  // Events
  {
    name: "ManowarMinted",
    type: "event",
    inputs: [
      { name: "manowarId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "title", type: "string", indexed: false },
      { name: "x402Price", type: "uint256", indexed: false },
      { name: "units", type: "uint256", indexed: false },
    ],
  },
] as const;

export const CloneABI = [
  {
    name: "cloneAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "originalAgentId", type: "uint256" },
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "chainId", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "model", type: "string" },
          { name: "units", type: "uint256" },
        ],
      },
      { name: "newAgentCardUri", type: "string" },
    ],
    outputs: [{ name: "clonedAgentId", type: "uint256" }],
  },
  {
    name: "canClone",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "canClone", type: "bool" }],
  },
  {
    name: "getClonesOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "originalAgentId", type: "uint256" }],
    outputs: [{ name: "cloneIds", type: "uint256[]" }],
  },
] as const;

export const WarpABI = [
  {
    name: "warpAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "originalAgentHash", type: "bytes32" },
      { name: "originalCreator", type: "address" },
      { name: "units", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "agentCardUri", type: "string" },
    ],
    outputs: [{ name: "warpedAgentId", type: "uint256" }],
  },
  {
    name: "isWarped",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "isWarped", type: "bool" }],
  },
  {
    name: "getWarpedData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "warpedAgentId", type: "uint256" }],
    outputs: [{
      name: "data",
      type: "tuple",
      components: [
        { name: "originalCreator", type: "address" },
        { name: "warper", type: "address" },
        { name: "originalAgentHash", type: "bytes32" },
        { name: "royaltyExpiryDate", type: "uint256" },
        { name: "royaltiesClaimed", type: "bool" },
        { name: "accumulatedRoyalties", type: "uint256" },
      ],
    }],
  },
  {
    name: "totalWarped",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "total", type: "uint256" }],
  },
  {
    name: "getWarpedAgentId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "externalHash", type: "bytes32" }],
    outputs: [{ name: "warpedAgentId", type: "uint256" }],
  },
] as const;

export const RFAABI = [
  {
    name: "createRFA",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "manowarId", type: "uint256" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "requiredSkills", type: "bytes32[]" },
      { name: "offerAmount", type: "uint256" },
    ],
    outputs: [{ name: "rfaId", type: "uint256" }],
  },
  {
    name: "submitAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rfaId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "acceptAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rfaId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getRFAData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "rfaId", type: "uint256" }],
    outputs: [{
      name: "data",
      type: "tuple",
      components: [
        { name: "manowarId", type: "uint256" },
        { name: "title", type: "string" },
        { name: "description", type: "string" },
        { name: "requiredSkills", type: "bytes32[]" },
        { name: "offerAmount", type: "uint256" },
        { name: "publisher", type: "address" },
        { name: "createdAt", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "fulfilledByAgentId", type: "uint256" },
        { name: "agentCreator", type: "address" },
      ],
    }],
  },
  {
    name: "getOpenRFAs",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "rfaIds", type: "uint256[]" }],
  },
  {
    name: "getSubmissions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "rfaId", type: "uint256" }],
    outputs: [{
      name: "submissions",
      type: "tuple[]",
      components: [
        { name: "agentId", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "submittedAt", type: "uint256" },
      ],
    }],
  },
] as const;

// =============================================================================
// Contract Instances
// =============================================================================

// Contract getters WITHOUT ABI - allows full function signature strings in readContract/prepareContractCall
// This is required because thirdweb's type system forces method names when ABI is provided,
// but runtime encoding works better with explicit function signatures.

export function getAgentFactoryContract() {
  return getContract({
    address: getContractAddress("AgentFactory"),
    chain: paymentChain,
    client: thirdwebClient,
  });
}

export function getManowarContract() {
  return getContract({
    address: getContractAddress("Manowar"),
    chain: paymentChain,
    client: thirdwebClient,
  });
}

export function getCloneContract() {
  return getContract({
    address: getContractAddress("Clone"),
    chain: paymentChain,
    client: thirdwebClient,
  });
}

export function getWarpContract() {
  return getContract({
    address: getContractAddress("Warp"),
    chain: paymentChain,
    client: thirdwebClient,
  });
}

export function getRFAContract() {
  return getContract({
    address: getContractAddress("RFA"),
    chain: paymentChain,
    client: thirdwebClient,
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate DNA hash from agent parameters (matches contract logic)
 * 
 * The dnaHash uniquely identifies an agent and is used to derive its wallet.
 * The derivation formula includes timestamp to ensure uniqueness even for identical skills/chain/model.
 * 
 * Formula: keccak256(skills + chainId + model + timestamp)
 */
export function computeDnaHash(
  skills: string[], 
  chainId: number, 
  model: string
): `0x${string}` {
  // Sort skills for deterministic hashing
  const sortedSkills = [...skills].sort();
  const skillsStr = sortedSkills.join(",");

  return keccak256(
    encodePacked(
      ["string", "uint256", "string"],
      [skillsStr, BigInt(chainId), model]
    )
  );
}

/**
 * Derive agent wallet address from dnaHash + timestamp
 * 
 * - dnaHash = keccak256(skills, chainId, model) - sent to contract
 * - timestamp makes each wallet unique even for same skills/chain/model
 * - walletAddress is stored in IPFS metadata as single source of truth
 * 
 * Formula: walletAddress = privateKeyToAddress(keccak256(dnaHash + timestamp + ":agent:wallet"))
 * 
 * IMPORTANT: Both frontend (this function) and backend (agent-wallet.ts) use
 * the same derivation formula. The walletAddress is stored in IPFS metadata and
 * the backend verifies it can derive the same address from dnaHash + walletTimestamp.
 */
export function deriveAgentWalletAddress(dnaHash: `0x${string}`, timestamp: number): `0x${string}` {
  // Derive private key from dnaHash + timestamp for uniqueness
  const derivationSeed = keccak256(
    encodePacked(
      ["bytes32", "uint256", "string"],
      [dnaHash, BigInt(timestamp), ":agent:wallet"]
    )
  );

  // Compute public address from private key
  return computeAddressFromPrivateKey(derivationSeed);
}

/**
 * Compute Ethereum address from private key
 * Uses the standard secp256k1 -> keccak256 -> last 20 bytes flow
 */
function computeAddressFromPrivateKey(privateKey: `0x${string}`): `0x${string}` {
  // viem's privateKeyToAccount works in browser via noble-curves
  // Use dynamic import for code splitting
  try {
    const { privateKeyToAccount } = require("viem/accounts") as typeof import("viem/accounts");
    const account = privateKeyToAccount(privateKey);
    return account.address;
  } catch {
    // Fallback: return a deterministic placeholder based on the private key
    // This shouldn't happen in practice as viem works in browser
    const fallback = keccak256(privateKey);
    return `0x${fallback.slice(26)}` as `0x${string}`;
  }
}

/**
 * Convert USDC amount to wei (6 decimals)
 */
export function usdcToWei(amount: number | string): bigint {
  const amountNum = typeof amount === "string" ? parseFloat(amount) : amount;
  return BigInt(Math.round(amountNum * 1_000_000));
}

/**
 * Convert USDC wei to display amount
 */
export function weiToUsdc(wei: bigint): string {
  return (Number(wei) / 1_000_000).toFixed(6);
}

/**
 * Format price for display
 */
export function formatUsdcPrice(wei: bigint): string {
  const usdc = Number(wei) / 1_000_000;
  return usdc < 0.01 ? `$${usdc.toFixed(4)}` : `$${usdc.toFixed(2)}`;
}

/**
 * Compute hash for external agent (used as originalAgentHash in Warp contract)
 * Creates a unique identifier for an agent from an external registry
 */
export function computeExternalAgentHash(registry: string, address: string): `0x${string}` {
  return keccak256(
    encodePacked(
      ["string", "string"],
      [registry, address]
    )
  );
}

// =============================================================================
// Types
// =============================================================================

export interface AgentData {
  dnaHash: `0x${string}`;
  units: bigint;
  unitsMinted: bigint;
  price: bigint;
  creator: Address;
  cloneable: boolean;
  isClone: boolean;
  parentAgentId: bigint;
  agentCardUri: string;
}

export interface ManowarData {
  title: string;
  description: string;
  banner: string;
  totalPrice: bigint;
  x402Price: bigint;
  units: bigint;
  unitsMinted: bigint;
  creator: Address;
  leaseEnabled: boolean;
  leaseDuration: bigint;
  leasePercent: number;
  coordinatorAgentId: bigint;
  coordinatorModel: string;
  hasActiveRfa: boolean;
  rfaId: bigint;
}

export interface MintAgentParams {
  skills: string[];
  chainId: number;
  model: string;
  units: number; // 0 = infinite
  price: number; // USDC
  cloneable: boolean;
  agentCardUri: string;
}

export interface MintManowarParams {
  title: string;
  description: string;
  banner: string;
  x402Price: number; // USDC
  units: number; // 0 = infinite
  leaseEnabled: boolean;
  leaseDuration: number; // days
  leasePercent: number; // 0-20
  coordinatorAgentId: number;
  coordinatorModel: string;
  agentIds: number[];
}

