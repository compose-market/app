import { useActiveAccount } from "thirdweb/react";
import { useChain } from "@/contexts/Network";
import { isEvmNetwork } from "@/lib/chains";
import { useSolanaSmartAccount } from "@/hooks/use-svm";

export function useSelectedUserAddress() {
    const account = useActiveAccount();
    const { paymentNetwork } = useChain();
    const { swigAddress, evmSignerAddress, isCreating, error } = useSolanaSmartAccount();
    const isEvm = isEvmNetwork(paymentNetwork);
    const evmAddress = account?.address ?? null;
    const solanaAddress = swigAddress ?? null;
    const userAddress = isEvm ? evmAddress : solanaAddress;
    const isResolving = Boolean(evmAddress) && !isEvm && (!solanaAddress || isCreating);

    return {
        userAddress,
        evmAddress,
        solanaAddress,
        evmSignerAddress,
        paymentNetwork,
        isEvm,
        isResolving,
        error,
    };
}
