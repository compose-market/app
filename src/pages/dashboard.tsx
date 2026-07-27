import { useMemo, useState } from "react";
import { BarChart3, RefreshCw, Wallet } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import type { InferenceAnalytics } from "@compose-market/sdk";

import { useAnalytics } from "@/hooks/use-analytics";
import { useFocus } from "@/hooks/use-focus";
import { OverviewCards } from "@/components/dashboard/overview";
import { SpendingChart } from "@/components/dashboard/spending";
import { ModelUsageTable } from "@/components/dashboard/models";
import { ReceiptFeed } from "@/components/dashboard/receipts";
import { SpendingByModality } from "@/components/dashboard/by-modality";
import { Button } from "@/components/ui/button";

const RANGES = [
  { label: "24h", ms: 86_400_000, interval: "hour" },
  { label: "7d", ms: 7 * 86_400_000, interval: "hour" },
  { label: "30d", ms: 30 * 86_400_000, interval: "day" },
  { label: "180d", ms: 180 * 86_400_000, interval: "day" },
] as const;

export default function DashboardPage() {
  const account = useActiveAccount();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const [anchor, setAnchor] = useState(() => Date.now());
  const [metric, setMetric] = useState("billing");
  const filters = useMemo<InferenceAnalytics.InferenceAnalyticsFilters>(() => ({
    from: new Date(anchor - range.ms).toISOString(),
    to: new Date(anchor).toISOString(),
    interval: range.interval,
    limit: 100,
  }), [anchor, range]);
  const { summary, isLoading, isRefetching, error, forceRefresh } = useAnalytics(filters);
  const { containerRef, focused, toggleFocus } = useFocus();

  const refresh = async () => {
    setAnchor(Date.now());
    await forceRefresh();
  };

  const header = (
    <div className="cm-dashboard__header">
      <div className="cm-dashboard__title"><BarChart3 className="cm-dashboard__title-icon" /><span>Dashboard</span></div>
      <div className="cm-dashboard__actions">
        <div className="cm-time-range">
          {RANGES.map((option) => <button key={option.label} className="cm-time-range__option" data-active={range === option} onClick={() => { setRange(option); setAnchor(Date.now()); }}>{option.label}</button>)}
        </div>
        <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={isRefetching || isLoading} className="cm-shell-button cm-shell-button--ghost cm-shell-button--icon" aria-label="Refresh analytics">
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );

  const empty = (title: string, text: string, loading = false) => (
    <div className="cm-dashboard" ref={containerRef} data-focus={focused ?? undefined}>
      {header}<div className="cm-dashboard__empty">{loading ? <RefreshCw className="cm-dashboard__empty-icon animate-spin" /> : <Wallet className="cm-dashboard__empty-icon" />}<span className="cm-dashboard__empty-title">{title}</span><span className="cm-dashboard__empty-text">{text}</span></div>
    </div>
  );

  if (!account) return empty("Connect your wallet", "Connect your wallet to view your inference usage and spending analytics.");
  if (error && !summary) return empty("Unable to load usage data", error.message);
  if (isLoading && !summary) return empty("Loading usage data", "Reading your inference telemetry.", true);
  if (!summary || summary.requestCount === 0) return empty("No usage yet", "Head to the Playground to make your first inference call.");

  const selectedMetric = summary.chartMetrics.some((candidate) => candidate.id === metric) ? metric : summary.chartMetrics[0]?.id || "billing";
  return (
    <div className="cm-dashboard" ref={containerRef} data-focus={focused ?? undefined}>
      {header}
      <OverviewCards summary={summary} />
      <SpendingChart timeline={summary.timeline} metrics={summary.chartMetrics} selectedMetric={selectedMetric} onMetricChange={setMetric} focused={focused === "chart"} dataBlock="chart" onClick={() => toggleFocus("chart")} />
      <SpendingByModality modalityBreakdown={summary.typeBreakdown} focused={focused === "mod"} dataBlock="mod" onClick={() => toggleFocus("mod")} />
      <ModelUsageTable models={summary.modelUsage} focused={focused === "models"} dataBlock="models" onClick={() => toggleFocus("models")} />
      <ReceiptFeed receipts={summary.activity} focused={focused === "feed"} dataBlock="feed" onClick={() => toggleFocus("feed")} />
    </div>
  );
}
