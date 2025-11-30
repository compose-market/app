import { createThirdwebClient, getContract } from "thirdweb";
import type { SmartWalletOptions } from "thirdweb/wallets";
import { 
  avalancheFuji, 
  avalanche, 
  USDC_ADDRESSES,
  PRICE_PER_TOKEN_WEI,
  MAX_TOKENS_PER_CALL,
  SESSION_BUDGET_PRESETS,
  calculateCostUSDC,
} from "@shared/thirdweb";

// Validate clientId at startup
const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;

if (!clientId) {
  console.error(`
╔══════════════════════════════════════════════════════════════════════╗
║  THIRDWEB CLIENT ID MISSING                                          ║
╠══════════════════════════════════════════════════════════════════════╣
║  Create a .env file in the project root with:                        ║
║                                                                      ║
║  VITE_THIRDWEB_CLIENT_ID=your_client_id_here                         ║
║  VITE_TREASURY_WALLET=0xYourWalletAddress                            ║
║  VITE_USE_MAINNET=false                                              ║
║                                                                      ║
║  Get your client ID at: https://thirdweb.com/create-api-key          ║
╚══════════════════════════════════════════════════════════════════════╝
`);
}

// Client-side thirdweb client (uses client ID - safe to expose)
export const thirdwebClient = createThirdwebClient({
  clientId: clientId || "placeholder", // Will fail gracefully with helpful error above
});

// Payment configuration - use Fuji for testnet, Avalanche for mainnet
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
  sponsorGas: true, // Thirdweb sponsors gas fees
};

// Treasury wallet that receives payments
export const TREASURY_WALLET = import.meta.env.VITE_TREASURY_WALLET as `0x${string}`;

// Re-export shared constants for convenience
export { 
  PRICE_PER_TOKEN_WEI, 
  MAX_TOKENS_PER_CALL, 
  SESSION_BUDGET_PRESETS, 
  calculateCostUSDC 
};

