"use client";

/**
 * CostReceiptIndicator — compact badge that hydrates the authenticated
 * cumulative session receipt and then subscribes to sdk.events.receipt.
 */

import { useEffect, useState } from "react";
import { Receipt as ReceiptIcon } from "lucide-react";
import { sdk } from "@/lib/sdk";
import { addAtomicAmounts, formatWeiUsd, shortTx } from "@/lib/receipts";
import { useSession } from "@/hooks/use-session";
import type { NetworkId } from "@compose-market/sdk/chains";
import type { Receipt, CumulativeBill, ListResponse } from "@compose-market/sdk";

function receiptTx(receipt: Receipt | null): string | undefined {
    return receipt?.txHash;
}

async function listReceipts(network: NetworkId, signal: AbortSignal): Promise<ListResponse> {
    return await sdk.receipts.list({ network, limit: 1, signal });
}

export function CostReceiptIndicator({ className }: { className?: string }) {
    const { session, keyToken } = useSession();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [cumulative, setCumulative] = useState<CumulativeBill | null>(null);

    useEffect(() => {
        if (!keyToken || !session.network) return;

        const controller = new AbortController();
        void listReceipts(session.network, controller.signal)
            .then((history) => {
                if (controller.signal.aborted) return;
                setCumulative(history.cumulative);
                setReceipt(history.receipts[0] ?? null);
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    console.warn("[receipts] failed to hydrate receipt history", error);
                }
            });

        return () => controller.abort();
    }, [keyToken, session.network]);

    useEffect(() => {
        return sdk.events.on("receipt", (event) => {
            setReceipt(event.receipt);
            if (event.receipt) {
                setCumulative((prev) => prev ? {
                    ...prev,
                    totalAmountWei: addAtomicAmounts(prev.totalAmountWei, event.receipt.finalAmountWei),
                    receiptCount: prev.receiptCount + 1,
                } : prev);
            }
        });
    }, []);

    const totalUsd = formatWeiUsd(cumulative?.totalAmountWei);
    const txHash = shortTx(receiptTx(receipt));

    if (!keyToken) return null;

    return (
        <div className={className}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ReceiptIcon className="w-3.5 h-3.5" />
                {totalUsd && <span className="font-mono">{totalUsd}</span>}
                {cumulative && <span className="text-muted-foreground/60">({cumulative.receiptCount})</span>}
                {txHash && (
                    <span className="font-mono text-muted-foreground/60 ml-1" title={receiptTx(receipt)}>
                        {txHash}
                    </span>
                )}
            </div>
        </div>
    );
}
