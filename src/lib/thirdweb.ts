import { createThirdwebClient, getContract } from "thirdweb";
import { avalancheFuji, avalanche } from "thirdweb/chains";
import type { SmartWalletOptions } from "thirdweb/wallets";

// USDC addresses per chain (supports ERC-3009 for x402)
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [avalancheFuji.id]: "0x5425890298aed601595a70AB815c96711a31Bc65", // Fuji USDC
  [avalanche.id]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // Avalanche USDC
};

// Pricing configuration for AI inference
export const PRICE_PER_TOKEN_WEI = 1; // 0.000001 USDC per inference token
export const MAX_TOKENS_PER_CALL = 100000; // 100k tokens max per call

// Session budget presets (in USDC wei - 6 decimals)
export const SESSION_BUDGET_PRESETS = [
  { label: "$1", value: 1_000_000 },
  { label: "$5", value: 5_000_000 },
  { label: "$10", value: 10_000_000 },
  { label: "$25", value: 25_000_000 },
  { label: "$50", value: 50_000_000 },
];

// Calculate cost in human-readable format
export function calculateCostUSDC(tokens: number): string {
  const cost = (PRICE_PER_TOKEN_WEI * tokens) / 10 ** 6;
  return cost.toFixed(6);
}

// Validate clientId at startup
const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;

if (!clientId) {
  console.error(`
╔══════════════════════════════════════════════════════════════════════╗
║  THIRDWEB CLIENT ID MISSING                                          ║
╠══════════════════════════════════════════════════════════════════════╣
║  Create a .env file with:                                            ║
║                                                                      ║
║  VITE_THIRDWEB_CLIENT_ID=your_client_id_here                         ║
║  VITE_TREASURY_WALLET=0xYourWalletAddress                            ║
║  VITE_USE_MAINNET=false                                              ║
║                                                                      ║
║  Get your client ID at: https://thirdweb.com/create-api-key          ║
╚══════════════════════════════════════════════════════════════════════╝
`);
}

// Client-side thirdweb client
export const thirdwebClient = createThirdwebClient({
  clientId: clientId || "placeholder",
});

// Payment chain - Fuji for testnet, Avalanche for mainnet
export const paymentChain = import.meta.env.VITE_USE_MAINNET === "true" 
  ? avalanche 
  : avalancheFuji;

export const paymentToken = {
  address: USDC_ADDRESSES[paymentChain.id],
  symbol: "USDC",
  decimals: 6,
  name: "USD Coin",
};

// Get USDC contract instance
export function getPaymentTokenContract() {
  return getContract({
    address: paymentToken.address,
    chain: paymentChain,
    client: thirdwebClient,
  });
}

// Account abstraction config for gas sponsorship (ERC-4337)
export const accountAbstraction: SmartWalletOptions = {
  chain: paymentChain,
  sponsorGas: true,
};

// Treasury wallet that receives payments
export const TREASURY_WALLET = import.meta.env.VITE_TREASURY_WALLET as `0x${string}`;
