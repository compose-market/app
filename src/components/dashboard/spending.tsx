import { Suspense, lazy, useMemo, useState } from "react";
import type { AnalyticsInterval, TimelineBucket } from "@/lib/analytics";
import { formatMs, formatTokens, numberLabel } from "@/lib/analytics";
import { atomicToUsd, formatUsd } from "@/lib/receipts";
import { BlockDropdown } from "./dropdown";
import type { ChartTab } from "./usage";

const UsageChart = lazy(() => import("./usage"));

const TABS: Array<{ value: ChartTab; label: string }> = [
  { value: "spend", label: "Spend" },
  { value: "requests", label: "Requests" },
  { value: "tokens", label: "Tokens" },
  { value: "latency", label: "Latency" },
];

function usePeriodBadge(timeline: TimelineBucket[], tab: ChartTab): string {
  return useMemo(() => {
    if (tab === "spend") {
      const total = timeline.reduce((sum, bucket) => sum + atomicToUsd(bucket.totals.billing.finalAmountAtomic), 0);
      return formatUsd(total);
    }
    if (tab === "requests") {
      const total = timeline.reduce((sum, bucket) => sum + bucket.totals.requests.total, 0);
      return numberLabel(total);
    }
    if (tab === "tokens") {
      const total = timeline.reduce((sum, bucket) => {
        const metrics = bucket.totals.usage.metrics;
        const input = metrics.input_tokens ?? metrics.text_input_tokens ?? 0;
        const output = metrics.output_tokens ?? metrics.text_output_tokens ?? 0;
        return sum + (input + output > 0 ? input + output : metrics.total_tokens ?? 0);
      }, 0);
      return formatTokens(total);
    }
    // Latency: count-weighted average across buckets.
    let weighted = 0;
    let count = 0;
    for (const bucket of timeline) {
      weighted += bucket.totals.latency.averageMs * bucket.totals.latency.count;
      count += bucket.totals.latency.count;
    }
    return count > 0 ? `${formatMs(weighted / count)} avg` : "—";
  }, [timeline, tab]);
}

export function SpendingChart({
  timeline,
  interval,
  focused = false,
  dataBlock,
  onClick,
}: {
  timeline: TimelineBucket[];
  interval: AnalyticsInterval;
  focused?: boolean;
  dataBlock?: string;
  onClick?: () => void;
}) {
  const [tab, setTab] = useState<ChartTab>("spend");
  const badge = usePeriodBadge(timeline, tab);

  return (
    <div className="cm-block" data-block={dataBlock} data-focused={focused} onClick={onClick}>
      <div className="cm-block__header">
        {focused ? (
          <div className="cm-time-range" onClick={(event) => event.stopPropagation()}>
            {TABS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="cm-time-range__option"
                data-active={tab === option.value}
                onClick={() => setTab(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="cm-block__header-side" onClick={(event) => event.stopPropagation()}>
            <BlockDropdown value={tab} options={TABS} label="Metric" onChange={setTab} align="start" />
          </div>
        )}
        <span className="cm-block__badge">{badge}</span>
      </div>
      {timeline.length === 0 ? (
        <div className="cm-block__empty">No telemetry for this range</div>
      ) : (
        <Suspense fallback={<div className="cm-chart-loading" aria-label="Loading chart" />}>
          <UsageChart timeline={timeline} interval={interval} tab={tab} focused={focused} />
        </Suspense>
      )}
    </div>
  );
}
