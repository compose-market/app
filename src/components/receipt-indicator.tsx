"use client";

/**
 * CostReceiptIndicator — compact badge that hydrates the authenticated
 * cumulative session receipt and then subscribes to sdk.events.receipt.
 */

import { useEffect, useState } from "react";
import { Receipt as ReceiptIcon } from "lucide-react";
import { sdk } from "@/lib/sdk";
import { useSession } from "@/hooks/use-session";
import type { Receipt, ReceiptBill, ReceiptCumulative, ReceiptListResponse } from "@compose-market/sdk";

function formatUsd(value: number): string {
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(6)}`;
}

function formatWeiUsd(wei: string | undefined): string | null {
    if (!wei) return null;
    const n = Number(wei);
    if (!Number.isFinite(n) || n < 0) return null;
    return formatUsd(n / 1_000_000);
}

function formatReceiptUsd(total: string | undefined): string | null {
    if (!total) return null;
    if (total.includes("$")) return total;
    const match = total.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!match) return null;
    const amount = Number(match[1]);
    return Number.isFinite(amount) ? formatUsd(amount) : null;
}

function shortTx(hash: string | undefined): string | null {
    if (!hash) return null;
    return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function receiptTotal(receipt: Receipt | null): string | null {
    return formatReceiptUsd(receipt?.bills?.[0]?.total);
}

function receiptTx(receipt: Receipt | null): string | undefined {
    return receipt?.bills?.find((bill: ReceiptBill) => bill.txId)?.txId;
}

async function listReceipts(chainId: number, signal: AbortSignal): Promise<ReceiptListResponse> {
    return await sdk.receipts.list({ chainId, limit: 1, signal });
}

export function CostReceiptIndicator({ className }: { className?: string }) {
    const { session, composeKeyToken } = useSession();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [cumulative, setCumulative] = useState<ReceiptCumulative | null>(null);

    useEffect(() => {
        if (!composeKeyToken || !session.chainId) return;

        const controller = new AbortController();
        void listReceipts(session.chainId, controller.signal)
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
    }, [composeKeyToken, session.chainId]);

    useEffect(() => {
        return sdk.events.on("receipt", (event) => {
            setReceipt(event.receipt);
            if (event.receipt) {
                setCumulative((prev) => prev ? {
                    ...prev,
                    totalAmountWei: String(Number(prev.totalAmountWei) + Number(event.receipt?.bills?.[0]?.total ?? 0)),
                    receiptCount: prev.receiptCount + 1,
                } : prev);
            }
        });
    }, []);

    const totalUsd = formatWeiUsd(cumulative?.totalAmountWei);
    const lastTotal = receiptTotal(receipt);
    const txHash = shortTx(receiptTx(receipt));

    if (!composeKeyToken) return null;

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
