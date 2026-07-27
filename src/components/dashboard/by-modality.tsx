import { useMemo } from "react";
import type { TypeEntry } from "@/lib/analytics";
import { formatUsd } from "@/lib/receipts";
import { formatModelTypeLabel } from "@/lib/models";

export function SpendingByModality({
  modalityBreakdown,
  focused = false,
  dataBlock,
  onClick,
}: {
  modalityBreakdown: TypeEntry[];
  focused?: boolean;
  dataBlock?: string;
  onClick?: () => void;
}) {
  const data = useMemo(() => {
    const total = modalityBreakdown.reduce((sum, e) => sum + e.usd, 0);
    return { entries: modalityBreakdown, total };
  }, [modalityBreakdown]);

  return (
    <div className="cm-block" data-block={dataBlock} data-focused={focused} onClick={onClick}>
      <div className="cm-block__header">
        <span className="cm-block__title">By Type</span>
        <span className="cm-block__badge">{formatUsd(data.total)}</span>
      </div>
      {data.entries.length === 0 ? (
        <div className="cm-block__empty">No data</div>
      ) : (
        <>
          <div className="cm-modality-bar">
            {data.entries.map((entry) => (
              <div
                key={entry.key}
                className="cm-modality-bar__segment"
                data-modality={entry.key}
                style={{ width: `${entry.pct}%` }}
                title={`${formatModelTypeLabel(entry.key)}: ${formatUsd(entry.usd)} (${entry.pct.toFixed(0)}%)`}
              >
                {entry.pct > 8 ? formatModelTypeLabel(entry.key).slice(0, 5) : ""}
              </div>
            ))}
          </div>

          {/* Compact legend (always visible) */}
          <div className="cm-modality-legend">
            {data.entries.map((entry) => (
              <span key={entry.key} className="cm-modality-legend__item">
                <span className="cm-modality-legend__dot" data-modality={entry.key} />
                {formatModelTypeLabel(entry.key)} · {entry.pct.toFixed(0)}%
              </span>
            ))}
          </div>

          {/* Expanded detail (visible when focused) */}
          <div className="cm-modality-detail">
            {data.entries.map((entry) => (
              <div key={entry.key} className="cm-modality-detail__row">
                <span className="cm-modality-detail__name">
                  <span className="cm-modality-legend__dot" data-modality={entry.key} />
                  {formatModelTypeLabel(entry.key)}
                </span>
                <span className="cm-modality-detail__stats">
                  <span data-tone="primary">{formatUsd(entry.usd)}</span>
                  <span>{entry.calls} calls</span>
                  {entry.tokens > 0 && (
                    <span>{entry.tokens >= 1000 ? `${(entry.tokens / 1000).toFixed(1)}k tok` : `${entry.tokens} tok`}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
