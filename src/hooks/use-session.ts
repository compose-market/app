import { useState, useCallback, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { getContract } from "thirdweb";
import { addSessionKey, getAllActiveSigners } from "thirdweb/extensions/erc4337";
import { approve, allowance, balanceOf } from "thirdweb/extensions/erc20";
import { sendTransaction } from "thirdweb";
import { 
  thirdwebClient, 
  paymentChain, 
  paymentToken, 
  TREASURY_WALLET,
  SESSION_BUDGET_PRESETS,
} from "@/lib/thirdweb";

// Session storage key
const SESSION_KEY = "manowar_session";

export interface SessionState {
  isActive: boolean;
  budgetLimit: number; // in USDC wei (6 decimals)
  budgetUsed: number;
  budgetRemaining: number;
  expiresAt: number | null;
  sessionKeyAddress: string | null;
}

interface StoredSession {
  budgetLimit: number;
  budgetUsed: number;
  expiresAt: number;
  sessionKeyAddress: string;
  userAddress: string;
}

/**
 * Hook for managing ERC-4337 session keys with spending limits
 * Allows users to set a budget once and make multiple calls without signing
 */
export function useSession() {
  const account = useActiveAccount();
  
  const [session, setSession] = useState<SessionState>({
    isActive: false,
    budgetLimit: 0,
    budgetUsed: 0,
    budgetRemaining: 0,
    expiresAt: null,
    sessionKeyAddress: null,
  });
  
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load session from storage on mount
  useEffect(() => {
    if (!account?.address) return;
    
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const data: StoredSession = JSON.parse(stored);
        
        // Validate session belongs to current user and hasn't expired
        if (
          data.userAddress === account.address &&
          data.expiresAt > Date.now()
        ) {
          setSession({
            isActive: true,
            budgetLimit: data.budgetLimit,
            budgetUsed: data.budgetUsed,
            budgetRemaining: data.budgetLimit - data.budgetUsed,
            expiresAt: data.expiresAt,
            sessionKeyAddress: data.sessionKeyAddress,
          });
        } else {
          // Session expired or different user - clear it
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, [account?.address]);

  /**
   * Create a new session with a budget limit
   * This requires ONE signature to approve spending
   */
  const createSession = useCallback(
    async (budgetUSDC: number, durationHours: number = 24) => {
      if (!account) {
        setError("Wallet not connected");
        return false;
      }

      setIsCreating(true);
      setError(null);

      try {
        const budgetWei = budgetUSDC * 1_000_000; // Convert to 6 decimals
        const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;

        // Get the smart account contract
        const smartAccountContract = getContract({
          address: account.address,
          chain: paymentChain,
          client: thirdwebClient,
        });

        // Get USDC contract
        const usdcContract = getContract({
          address: paymentToken.address,
          chain: paymentChain,
          client: thirdwebClient,
        });

        // Check actual USDC balance before creating session
        const balance = await balanceOf({
          contract: usdcContract,
          address: account.address,
        });

        if (balance < BigInt(budgetWei)) {
          const balanceUSDC = Number(balance) / 1_000_000;
          throw new Error(
            `Insufficient USDC balance. You have $${balanceUSDC.toFixed(2)} but want to budget $${budgetUSDC.toFixed(2)}`
          );
        }

        // Step 1: Approve USDC spending for the treasury (one-time per session)
        const currentAllowance = await allowance({
          contract: usdcContract,
          owner: account.address,
          spender: TREASURY_WALLET,
        });

        if (currentAllowance < BigInt(budgetWei)) {
          // Need to approve more spending
          const approveTx = approve({
            contract: usdcContract,
            spender: TREASURY_WALLET,
            amountWei: BigInt(budgetWei),
          });

          await sendTransaction({
            transaction: approveTx,
            account,
          });
        }

        // Step 2: Create session key for the treasury to pull payments
        // This allows the server to settle payments without user signatures
        const sessionKeyTx = addSessionKey({
          contract: smartAccountContract,
          account,
          sessionKeyAddress: TREASURY_WALLET,
          permissions: {
            approvedTargets: [paymentToken.address], // Only USDC contract
            nativeTokenLimitPerTransaction: "0", // No native token spending
            permissionStartTimestamp: new Date(Date.now()),
            permissionEndTimestamp: new Date(expiresAt),
          },
        });

        await sendTransaction({
          transaction: sessionKeyTx,
          account,
        });

        // Store session locally
        const sessionData: StoredSession = {
          budgetLimit: budgetWei,
          budgetUsed: 0,
          expiresAt,
          sessionKeyAddress: TREASURY_WALLET,
          userAddress: account.address,
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

        setSession({
          isActive: true,
          budgetLimit: budgetWei,
          budgetUsed: 0,
          budgetRemaining: budgetWei,
          expiresAt,
          sessionKeyAddress: TREASURY_WALLET,
        });

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create session");
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [account]
  );

  /**
   * Record usage against the session budget
   * Called after each successful inference
   */
  const recordUsage = useCallback((amountWei: number) => {
    setSession((prev) => {
      const newUsed = prev.budgetUsed + amountWei;
      const newRemaining = prev.budgetLimit - newUsed;
      
      // Update storage
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const data: StoredSession = JSON.parse(stored);
        data.budgetUsed = newUsed;
        localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      }

      // Check if budget exhausted
      if (newRemaining <= 0) {
        return {
          ...prev,
          isActive: false,
          budgetUsed: newUsed,
          budgetRemaining: 0,
        };
      }

      return {
        ...prev,
        budgetUsed: newUsed,
        budgetRemaining: newRemaining,
      };
    });
  }, []);

  /**
   * End the current session
   */
  const endSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession({
      isActive: false,
      budgetLimit: 0,
      budgetUsed: 0,
      budgetRemaining: 0,
      expiresAt: null,
      sessionKeyAddress: null,
    });
  }, []);

  /**
   * Check if session has enough budget for an operation
   */
  const hasBudget = useCallback(
    (requiredWei: number) => {
      return session.isActive && session.budgetRemaining >= requiredWei;
    },
    [session]
  );

  /**
   * Format budget display ($X.XX)
   */
  const formatBudget = useCallback((weiAmount: number) => {
    return `$${(weiAmount / 1_000_000).toFixed(2)}`;
  }, []);

  return {
    session,
    isCreating,
    error,
    createSession,
    recordUsage,
    endSession,
    hasBudget,
    formatBudget,
    budgetPresets: SESSION_BUDGET_PRESETS,
    // Convenience aliases for direct access
    sessionActive: session.isActive,
    budgetRemaining: session.budgetRemaining,
    budgetLimit: session.budgetLimit,
  };
}

/**
 * Get active session keys for the current account
 */
export function useActiveSessionKeys() {
  const account = useActiveAccount();
  const [signers, setSigners] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account?.address) return;

    const fetchSigners = async () => {
      setLoading(true);
      try {
        const contract = getContract({
          address: account.address,
          chain: paymentChain,
          client: thirdwebClient,
        });

        const activeSigners = await getAllActiveSigners({ contract });
        setSigners(activeSigners.map((s) => s.signer));
      } catch (err) {
        console.error("Failed to fetch session keys:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSigners();
  }, [account?.address]);

  return { signers, loading };
}

