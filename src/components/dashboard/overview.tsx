import { useId, useMemo, useState } from "react";
import { Activity, ChevronDown, Coins, DollarSign, Gauge, Rocket } from "lucide-react";
import type { Summary } from "@/lib/analytics";
import { formatMs, formatPct, formatTokens, numberLabel } from "@/lib/analytics";
import { atomicToUsd, formatUsd } from "@/lib/receipts";

function successTone(rate: number | null): "emerald" | "amber" | "danger" | undefined {
  if (rate === null) return undefined;
  if (rate >= 0.99) return "emerald";
  if (rate >= 0.95) return "amber";
  return "danger";
}

/** Tiny brand-gradient sparkline — intentionally axis-less. */
function Sparkline({ values }: { values: number[] }) {
  const gradientId = useId().replace(/:/gu, "");
  const geometry = useMemo(() => {
    if (values.length === 0) return null;
    const max = Math.max(...values, 0);
    if (max <= 0) return { area: "", line: "" };
    const width = 100;
    const height = 28;
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const points = values.map((value, index) => {
      const x = values.length === 1 ? width / 2 : index * step;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const line = `M ${points.join(" L ")}`;
    const firstX = values.length === 1 ? width / 2 : 0;
    const lastX = values.length === 1 ? width / 2 : width;
    return { line, area: `${line} L ${lastX} ${height} L ${firstX} ${height} Z` };
  }, [values]);

  if (!geometry || !geometry.area) {
    return <span className="cm-stat-card__spark cm-stat-card__spark--flat" aria-hidden="true" />;
  }
  return (
    <svg className="cm-stat-card__spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${gradientId}-spark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={geometry.area} fill={`url(#${gradientId}-spark)`} />
      <path d={geometry.line} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.75" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function OverviewCards({ summary }: { summary: Summary }) {
  const [foldOpen, setFoldOpen] = useState(false);
  const spendSeries = useMemo(
    () => summary.timeline.map((bucket) => atomicToUsd(bucket.totals.billing.finalAmountAtomic)),
    [summary.timeline],
  );
  const tone = successTone(summary.successRate);

  return (
    <div className="cm-overview" data-fold-open={foldOpen ? "true" : undefined}>
      <div className="cm-overview-grid">
      <div className="cm-stat-card">
        <span className="cm-stat-card__label">
          <DollarSign className="cm-stat-card__label-icon" />
          Total Spent
        </span>
        <span className="cm-stat-card__value" data-tone="primary">{formatUsd(summary.totalUsd)}</span>
        <span className="cm-stat-card__sub">{numberLabel(summary.requestCount)} requests settled</span>
        <Sparkline values={spendSeries} />
      </div>

      <div className="cm-stat-card">
        <span className="cm-stat-card__label">
          <Activity className="cm-stat-card__label-icon" />
          Requests
        </span>
        <span className="cm-stat-card__value">{numberLabel(summary.requestCount)}</span>
        <span className="cm-stat-card__sub">
          <span className="cm-stat-card__pill" data-tone={tone}>{formatPct(summary.successRate)} success</span>
          {summary.streamedShare !== null ? ` · ${formatPct(summary.streamedShare, 0)} streamed` : ""}
        </span>
      </div>

      <div className="cm-stat-card">
        <span className="cm-stat-card__label">
          <Gauge className="cm-stat-card__label-icon" />
          Avg Latency
        </span>
        <span className="cm-stat-card__value">{summary.avgLatencyMs !== null ? formatMs(summary.avgLatencyMs) : "—"}</span>
        <span className="cm-stat-card__sub">P95 {formatMs(summary.p95LatencyMs ?? 0)}</span>
      </div>

      <div className="cm-stat-card cm-stat-card--fold">
        <span className="cm-stat-card__label">
          <Rocket className="cm-stat-card__label-icon" />
          Avg TTFT
        </span>
        <span className="cm-stat-card__value" data-tone="accent">
          {summary.avgTtftMs !== null ? formatMs(summary.avgTtftMs) : "—"}
        </span>
        <span className="cm-stat-card__sub">time to first token</span>
      </div>

      <div className="cm-stat-card cm-stat-card--fold">
        <span className="cm-stat-card__label">
          <Coins className="cm-stat-card__label-icon" />
          Tokens
        </span>
        <span className="cm-stat-card__value">{formatTokens(summary.tokensIn + summary.tokensOut)}</span>
        <span className="cm-stat-card__sub">
          {formatTokens(summary.tokensIn)} in <span aria-hidden="true">→</span> {formatTokens(summary.tokensOut)} out
        </span>
      </div>
      </div>

      <button
        type="button"
        className="cm-overview__fold-toggle"
        aria-expanded={foldOpen}
        onClick={() => setFoldOpen((open) => !open)}
      >
        {foldOpen ? "Less stats" : "More stats"}
        <ChevronDown className="cm-overview__fold-icon" data-open={foldOpen ? "true" : undefined} />
      </button>
    </div>
  );
}
