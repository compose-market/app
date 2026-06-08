"use client";

/**
 * CostReceiptIndicator — compact badge that hydrates the authenticated
 * cumulative session receipt and then subscribes to sdk.events.receipt.
 */

import { useEffect, useState } from "react";
import { Receipt as ReceiptIcon } from "lucide-react";
import { sdk } from "@/lib/sdk";
import { useSession } from "@/hooks/use-session";

interface ReceiptCumulative {
    totalAmountWei: string;
    providerAmountWei?: string;
    platformFeeWei?: string;
    receiptCount: number;
}

interface ReceiptFees {
    total: {
        percent: string;
        amount: string;
    };
    distribution: Record<string, string>;
}

interface ReceiptBill {
    agent: string;
    agentWallet?: string;
    depth: number;
    model?: string;
    tokens: Record<string, number>;
    tools: string[];
    total: string;
    duration: string;
    txId?: string;
    fees: ReceiptFees;
    children?: ReceiptBill[];
}

interface ReceiptRecord {
    user?: string;
    runId?: string;
    duration?: string;
    bills?: ReceiptBill[];
    cumulative?: ReceiptCumulative;
}

interface ReceiptHistory {
    userAddress: string;
    chainId: number;
    cumulative: ReceiptCumulative;
    receipts: ReceiptRecord[];
}

type ReceiptsSdk = typeof sdk & {
    receipts?: {
        list(input?: { chainId?: number; limit?: number; signal?: AbortSignal }): Promise<ReceiptHistory>;
    };
};

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

function receiptTotal(receipt: ReceiptRecord | null): string | null {
    return formatReceiptUsd(receipt?.bills?.[0]?.total);
}

function receiptTx(receipt: ReceiptRecord | null): string | undefined {
    return receipt?.bills?.find((bill: ReceiptBill) => bill.txId)?.txId;
}

async function listReceipts(chainId: number, signal: AbortSignal): Promise<ReceiptHistory> {
    const capable = sdk as ReceiptsSdk;
    if (capable.receipts?.list) {
        return await capable.receipts.list({ chainId, limit: 1, signal }) as unknown as ReceiptHistory;
    }

    const response = await sdk.fetch(`/api/receipts?chainId=${chainId}&limit=1`, {
        method: "GET",
        chainId,
        paymentMode: "composeKey",
        signal,
    });
    if (!response.ok) {
        throw new Error(`receipt history request failed (${response.status})`);
    }
    return await response.json() as ReceiptHistory;
}

export function CostReceiptIndicator({ className }: { className?: string }) {
    const { session, composeKeyToken } = useSession();
    const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
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
            const next = event.receipt as ReceiptRecord;
            setReceipt(next);
            if (next.cumulative) {
                setCumulative(next.cumulative);
            }
        });
    }, []);

    if (!receipt && !cumulative) return null;

    const totalWei = cumulative?.totalAmountWei;
    const usd = receiptTotal(receipt) ?? formatWeiUsd(totalWei);
    const tx = shortTx(receiptTx(receipt));
    const count = cumulative?.receiptCount;

    return (
        <div
            className={`inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[10px] font-mono text-emerald-300 ${className ?? ""}`}
            title={`Session total ${usd ?? "$0.000000"}${count ? ` across ${count} receipt${count === 1 ? "" : "s"}` : ""}${receipt?.runId ? ` · run ${receipt.runId}` : ""}${tx ? ` · tx ${receiptTx(receipt)}` : ""}`}
        >
            <ReceiptIcon className="h-3 w-3" aria-hidden="true" />
            <span>{usd ?? "—"}</span>
            {typeof count === "number" && count > 0 ? <span className="text-emerald-200/60">{count}</span> : null}
            {tx ? <span className="text-emerald-200/60">{tx}</span> : null}
        </div>
    );
}
