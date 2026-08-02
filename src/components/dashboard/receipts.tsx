import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { formatWeiUsd, timeAgo, shortTx, settlementTone } from "@/lib/receipts";
import type { FeedItem } from "@/lib/analytics";
import { CHAIN_CONFIG } from "@/lib/chains";
import { formatModelTypeLabel } from "@/lib/models";

export function ReceiptFeed({ receipts, focused = false, dataBlock, onClick }: {
  receipts: FeedItem[];
  focused?: boolean;
  dataBlock?: string;
  onClick?: () => void;
}) {
  const summary = useMemo(() => {
    const counts = { settled: 0, claimed: 0, submitted: 0, queued: 0, failed: 0 };
    for (const receipt of receipts) counts[receipt.settlementStatus] += 1;
    return counts;
  }, [receipts]);
  const visible = focused ? receipts : receipts.slice(0, 5);

  return (
    <div className="cm-block" data-block={dataBlock} data-focused={focused} onClick={onClick}>
      <div className="cm-block__header">
        <span className="cm-block__title">Recent Settlements</span>
        <div className="cm-feed-summary" onClick={(event) => event.stopPropagation()}>
          {Object.entries(summary).filter(([, count]) => count > 0).map(([status, count]) => (
            <span key={status} className="cm-feed-summary__item"><span className="cm-feed-summary__dot" data-tone={settlementTone(status)} />{count}</span>
          ))}
        </div>
      </div>
      {receipts.length === 0 ? <div className="cm-block__empty">No settlements yet</div> : (
        <div className="cm-feed-list">
          {visible.map((receipt) => {
            const chainId = receipt.network.startsWith("eip155:") ? Number(receipt.network.slice("eip155:".length)) : undefined;
            const explorer = chainId ? CHAIN_CONFIG[chainId]?.explorer : undefined;
            return (
              <div key={receipt.id} className="cm-receipt-item">
                <div className="cm-receipt-item__top">
                  <span className="cm-receipt-item__model">{receipt.model}</span>
                  <span className="cm-receipt-item__amount">{formatWeiUsd(receipt.finalAmountAtomic)}</span>
                </div>
                <div className="cm-receipt-item__bottom">
                  <span className="cm-receipt-item__meta">
                    <span>{timeAgo(receipt.settledAt)}</span>
                    <span className="cm-usage-modality" data-tone={receipt.type}>{formatModelTypeLabel(receipt.type)}</span>
                    {receipt.transactionHash && explorer && (
                      <a href={`${explorer}/tx/${receipt.transactionHash}`} target="_blank" rel="noopener noreferrer" className="cm-receipt-tx" onClick={(event) => event.stopPropagation()}>
                        {shortTx(receipt.transactionHash)}<ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </span>
                  <span className="cm-settlement-badge" data-tone={settlementTone(receipt.settlementStatus)}>{receipt.settlementStatus}</span>
                </div>
                {focused && receipt.pricedUnits.length > 0 && (
                  <div className="cm-receipt-detail">
                    <div className="cm-receipt-detail__row"><span>Inference</span><strong>{formatWeiUsd(receipt.inferenceAmountAtomic)}</strong></div>
                    <div className="cm-receipt-detail__row"><span>Platform Fee</span><strong>{formatWeiUsd(receipt.platformFeeAtomic)}</strong></div>
                    <div className="cm-receipt-detail__lineitems">
                      {receipt.pricedUnits.map((item) => (
                        <div key={`${item.key}:${item.unit}`} className="cm-receipt-detail__lineitem">
                          <span className="cm-receipt-detail__lineitem-key">{item.key} · {item.quantity} {item.unit}</span>
                          <span className="cm-receipt-detail__lineitem-amount">{formatWeiUsd(item.amountAtomic)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
