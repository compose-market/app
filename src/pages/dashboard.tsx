import { useMemo, useState } from "react";
import { BarChart3, Filter, RefreshCw, Wallet } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import type { InferenceAnalytics } from "@compose-market/sdk";
import type { NetworkId } from "@compose-market/sdk/chains";

import { useAnalytics } from "@/hooks/use-analytics";
import { useFocus } from "@/hooks/use-focus";
import { useChain } from "@/contexts/Network";
import { OverviewCards } from "@/components/dashboard/overview";
import { SpendingChart } from "@/components/dashboard/spending";
import { ModelUsageTable } from "@/components/dashboard/models";
import { ReceiptFeed } from "@/components/dashboard/receipts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleNetworkSelection } from "@/components/dashboard/networks";

const RANGES = [
  { label: "24h", ms: 86_400_000, interval: "hour" },
  { label: "7d", ms: 7 * 86_400_000, interval: "hour" },
  { label: "30d", ms: 30 * 86_400_000, interval: "day" },
  { label: "180d", ms: 180 * 86_400_000, interval: "day" },
] as const;

type StableFilters = Omit<
  InferenceAnalytics.InferenceAnalyticsFilters,
  "from" | "to" | "networks"
>;

export default function DashboardPage() {
  const account = useActiveAccount();
  const { chains } = useChain();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const [selectedNetworks, setSelectedNetworks] = useState<NetworkId[]>([]);
  const { containerRef, focused, toggleFocus } = useFocus();

  const supportedNetworks = useMemo(
    () => [...chains]
      .filter((chain): chain is typeof chain & { network: NetworkId } => Boolean(chain.network))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [chains],
  );
  const filters = useMemo<StableFilters>(() => ({
    interval: range.interval,
    limit: 100,
  }), [range.interval]);
  const {
    summary,
    requests,
    activity,
    hasMoreRequests,
    hasMoreSettlements,
    isLoadingMore,
    loadMore,
    isLoading,
    isRefetching,
    error,
    forceRefresh,
  } = useAnalytics({
    rangeId: range.label,
    rangeMs: range.ms,
    networks: selectedNetworks,
    filters,
  });

  const networkLabel = selectedNetworks.length === 0
    ? "All networks"
    : selectedNetworks.length === 1
      ? supportedNetworks.find((chain) => chain.network === selectedNetworks[0])?.name ?? selectedNetworks[0]
      : `${selectedNetworks.length} networks`;

  const header = (
    <div className="cm-dashboard__header">
      <div className="cm-dashboard__title">
        <BarChart3 className="cm-dashboard__title-icon" />
        <span>Dashboard</span>
        {isRefetching ? <span className="text-xs font-normal text-muted-foreground">Updating…</span> : null}
      </div>
      <div className="cm-dashboard__actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="cm-shell-button cm-shell-button--ghost">
              <Filter className="h-4 w-4" />
              {networkLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuCheckboxItem
              checked={selectedNetworks.length === 0}
              onCheckedChange={(checked) => {
                if (checked) setSelectedNetworks([]);
              }}
              onSelect={(event) => event.preventDefault()}
            >
              All
            </DropdownMenuCheckboxItem>
            {supportedNetworks.map((chain) => (
              <DropdownMenuCheckboxItem
                key={chain.network}
                checked={selectedNetworks.includes(chain.network)}
                onCheckedChange={(checked) => {
                  setSelectedNetworks((current) => toggleNetworkSelection(
                    current,
                    chain.network,
                    checked === true,
                  ) as NetworkId[]);
                }}
                onSelect={(event) => event.preventDefault()}
              >
                {chain.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="cm-time-range">
          {RANGES.map((option) => (
            <button
              key={option.label}
              className="cm-time-range__option"
              data-active={range === option}
              onClick={() => setRange(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void forceRefresh()}
          disabled={isRefetching || isLoading}
          className="cm-shell-button cm-shell-button--ghost cm-shell-button--icon"
          aria-label="Refresh analytics"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );

  const empty = (title: string, text: string, loading = false) => (
    <div className="cm-dashboard" ref={containerRef} data-focus={focused ?? undefined}>
      {header}
      <div className="cm-dashboard__empty">
        {loading
          ? <RefreshCw className="cm-dashboard__empty-icon animate-spin" />
          : <Wallet className="cm-dashboard__empty-icon" />}
        <span className="cm-dashboard__empty-title">{title}</span>
        <span className="cm-dashboard__empty-text">{text}</span>
      </div>
    </div>
  );

  if (!account) return empty("Connect your wallet", "Connect your wallet to view your inference usage and spending analytics.");
  if (error && !summary) return empty("Unable to load usage data", error.message);
  if (isLoading && !summary) return empty("Loading usage data", "Reading your inference telemetry.", true);
  if (!summary || summary.requestCount === 0) return empty("No usage yet", "Head to the Playground to make your first inference call.");

  return (
    <div className="cm-dashboard" ref={containerRef} data-focus={focused ?? undefined}>
      {header}
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          Unable to update usage data: {error.message}
        </div>
      ) : null}
      <OverviewCards summary={summary} />
      <SpendingChart
        timeline={summary.timeline}
        interval={summary.interval}
        focused={focused === "chart"}
        dataBlock="chart"
        onClick={() => toggleFocus("chart")}
      />
      <ModelUsageTable
        models={summary.modelUsage}
        modalityBreakdown={summary.typeBreakdown}
        focused={focused === "models"}
        dataBlock="models"
        onClick={() => toggleFocus("models")}
      />
      <ReceiptFeed
        receipts={activity}
        requests={requests}
        hasMoreSettlements={hasMoreSettlements}
        hasMoreRequests={hasMoreRequests}
        isLoadingMore={isLoadingMore}
        onLoadMore={(kind) => void loadMore(kind)}
        focused={focused === "feed"}
        dataBlock="feed"
        onClick={() => toggleFocus("feed")}
      />
    </div>
  );
}
