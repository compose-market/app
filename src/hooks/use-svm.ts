/**
 * useSolanaSmartAccount — deterministic Solana Swig smart account per
 * Thirdweb smart-account admin signer.
 *
 * One Thirdweb admin signer ↔ one Solana smart account, forever.
 *
 * This hook mirrors the EVM pattern exactly:
 *   EVM:  useActiveAccount() → smart account address (instant, client-side)
 *   SVM:  this hook → wallet PDA address (instant, client-side)
 *
 * The admin wallet returned by Thirdweb's useAdminWallet() is the signer
 * behind the visible EVM smart account. It is the Swig authority and the
 * deterministic seed source. The visible EVM smart account remains the EVM
 * userAddress; the walletPda below is the SVM userAddress.
 *
 * The walletPda is what the user sees, funds, and what balance/settlement use.
 * The configPda is internal — only for fetchSwigAccount + instruction building.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAdminWallet } from "thirdweb/react";
import { sdk } from "@/lib/sdk";
import { useChain } from "@/contexts/Network";
import { isEvmNetwork } from "@/lib/chains";
import { clearSwigCreated, readSwigCreated, writeSwigCreated } from "@/lib/cache";
import {
    deriveSwigId,
    deriveSwigConfigAddress,
    deriveSwigWalletAddress,
    recoverEvmSecp256k1Pubkey,
    SWIG_AUTH_SIGN_MESSAGE,
} from "@/lib/svm/account";
import {
    createSolanaRpcFromNetwork,
    fetchSwigAccount,
    buildCreateSwigTransaction,
} from "@/lib/svm/swig";

export interface SolanaSmartAccountState {
    swigAddress: string | null;
    evmSignerAddress: string | null;
    isCreating: boolean;
    error: string | null;
}

export function useSolanaSmartAccount(): SolanaSmartAccountState & {
    create: () => Promise<void>;
} {
    const adminWallet = useAdminWallet();
    const { paymentNetwork, solanaChains } = useChain();
    const [swigAddress, setSwigAddress] = useState<string | null>(null);
    const [evmSignerAddress, setEvmSignerAddress] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const creatingRef = useRef(false);
    const checkedKeyRef = useRef<string | null>(null);

    const selectedSolanaChain = useMemo(() => {
        const defaultSolanaChain = solanaChains.at(0) ?? null;
        if (!isEvmNetwork(paymentNetwork)) {
            return solanaChains.find((chain) => chain.network === paymentNetwork) ?? defaultSolanaChain;
        }
        return defaultSolanaChain;
    }, [paymentNetwork, solanaChains]);

    const selectedSolanaNetwork = selectedSolanaChain?.network ?? null;
    const selectedSolanaRpcUrl = selectedSolanaChain?.rpcUrl ?? null;

    const adminAddress = adminWallet?.getAccount?.()?.address ?? null;

    const create = useCallback(async () => {
        if (!adminAddress || creatingRef.current) return;
        if (!selectedSolanaNetwork || !selectedSolanaRpcUrl) return;

        const swigId = deriveSwigId(adminAddress);
        const configPda = await deriveSwigConfigAddress(adminAddress);

        const checkedKey = `${adminAddress.toLowerCase()}:${selectedSolanaNetwork}:${configPda}`;
        if (checkedKeyRef.current === checkedKey) {
            return;
        }

        // Existence cache hit: the Swig account is permanent once created, so
        // trust the cache and never flip isCreating (which would gate
        // useSelectedUserAddress → session sync). Revalidate in the
        // background and self-heal if the cache ever lies.
        if (readSwigCreated(adminAddress, selectedSolanaNetwork)) {
            checkedKeyRef.current = checkedKey;
            void (async () => {
                try {
                    const rpc = createSolanaRpcFromNetwork(selectedSolanaNetwork, selectedSolanaRpcUrl);
                    const existing = await fetchSwigAccount(rpc, configPda);
                    if (!existing) clearSwigCreated(adminAddress, selectedSolanaNetwork);
                } catch {
                    // Transient RPC failure: keep trusting the cache.
                }
            })();
            return;
        }

        creatingRef.current = true;
        setIsCreating(true);
        setError(null);
        try {
            const rpc = createSolanaRpcFromNetwork(selectedSolanaNetwork, selectedSolanaRpcUrl);

            const existing = await fetchSwigAccount(rpc, configPda);
            if (existing) {
                writeSwigCreated(adminAddress, selectedSolanaNetwork);
                checkedKeyRef.current = checkedKey;
                return;
            }

            const account = adminWallet?.getAccount?.();
            if (!account) {
                throw new Error("EVM account not available for signing");
            }

            const signature = await account.signMessage({
                message: SWIG_AUTH_SIGN_MESSAGE,
            });
            const evmPubkey = await recoverEvmSecp256k1Pubkey(signature, SWIG_AUTH_SIGN_MESSAGE);

            const { feePayer } = await sdk.svm.feePayer();

            const unsignedTxB64 = await buildCreateSwigTransaction({
                swigId,
                evmPubkey,
                feePayer: feePayer as any,
                rpc,
            });

            await sdk.svm.relay({
                unsignedTransaction: unsignedTxB64,
                network: selectedSolanaNetwork,
            });

            const created = await fetchSwigAccount(rpc, configPda);
            if (!created) {
                throw new Error("Solana account creation relayed but Swig account was not found");
            }
            writeSwigCreated(adminAddress, selectedSolanaNetwork);
            checkedKeyRef.current = checkedKey;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[useSolanaSmartAccount] Failed:", message);
            setError(message);
        } finally {
            creatingRef.current = false;
            setIsCreating(false);
        }
    }, [adminAddress, adminWallet, selectedSolanaNetwork, selectedSolanaRpcUrl]);

    useEffect(() => {
        if (!adminAddress) {
            setSwigAddress(null);
            setEvmSignerAddress(null);
            setError(null);
            checkedKeyRef.current = null;
            return;
        }

        setEvmSignerAddress(adminAddress);

        let cancelled = false;
        setError(null);
        checkedKeyRef.current = null;
        (async () => {
            try {
                const walletPda = await deriveSwigWalletAddress(adminAddress);
                if (cancelled) return;
                setSwigAddress(walletPda);
            } catch (err) {
                if (cancelled) return;
                console.error("[useSolanaSmartAccount] Derive failed:", err);
            }
        })();

        return () => { cancelled = true; };
    }, [adminAddress]);

    useEffect(() => {
        if (!adminAddress || !swigAddress || !selectedSolanaNetwork) return;
        create();
    }, [adminAddress, swigAddress, selectedSolanaNetwork, create]);

    return { swigAddress, evmSignerAddress, isCreating, error, create };
}
