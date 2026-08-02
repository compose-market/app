import type { InferenceAnalytics } from "@compose-market/sdk";

import { atomicToUsd } from "@/lib/receipts";

type Response = InferenceAnalytics.InferenceAnalyticsResponse;
type Totals = InferenceAnalytics.InferenceAnalyticsTotals;

export interface ModelUsage {
  subject: string;
  modelId: string;
  family: string;
  totalAmountAtomic: bigint;
  totalUsd: number;
  calls: number;
  totalTokens: number;
  lastUsed: number;
  type: string;
}

export interface TimelineBucket {
  timestamp: number;
  endTimestamp: number;
  totals: Totals;
}

export interface TypeEntry {
  key: string;
  usd: number;
  calls: number;
  tokens: number;
  pct: number;
}

export interface FeedItem {
  id: string;
  requestId: string;
  network: string;
  model: string;
  type: string;
  pricedUnits: InferenceAnalytics.InferencePricedUnit[];
  inferenceAmountAtomic: string;
  platformFeeAtomic: string;
  finalAmountAtomic: string;
  settlementStatus: InferenceAnalytics.InferenceSettlementStatus;
  transactionHash?: string;
  settledAt: number;
}

export interface ChartMetric {
  id: string;
  label: string;
  value: (totals: Totals) => number;
  format: (value: number) => string;
}

export interface Summary {
  response: Response;
  totalUsd: number;
  inferenceUsd: number;
  platformFeeUsd: number;
  requestCount: number;
  modelUsage: ModelUsage[];
  typeBreakdown: TypeEntry[];
  timeline: TimelineBucket[];
  activity: FeedItem[];
  chartMetrics: ChartMetric[];
}

function atomic(value: string): bigint {
  return /^\d+$/u.test(value) ? BigInt(value) : 0n;
}

function numberLabel(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, notation: value >= 100_000 ? "compact" : "standard" }).format(value);
}

function title(value: string): string {
  return value.replace(/_/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function metrics(response: Response): ChartMetric[] {
  const metricKeys = new Set<string>();
  const units = new Map<string, InferenceAnalytics.InferenceUsageUnit>();
  for (const bucket of response.timeline) {
    Object.keys(bucket.totals.usage.metrics).forEach((key) => metricKeys.add(key));
    for (const unit of bucket.totals.usage.units) units.set(`${unit.key}\u0000${unit.unit}`, unit);
  }
  return [
    { id: "billing", label: "Settled Spend", value: (totals) => atomicToUsd(totals.billing.finalAmountAtomic), format: (value) => `$${value.toFixed(value < 0.01 ? 4 : 2)}` },
    { id: "requests", label: "Requests", value: (totals) => totals.requests.total, format: numberLabel },
    { id: "latency-average", label: "Average Latency", value: (totals) => totals.latency.averageMs, format: (value) => `${numberLabel(value)} ms` },
    { id: "latency-p50", label: "P50 Latency", value: (totals) => totals.latency.p50Ms, format: (value) => `${numberLabel(value)} ms` },
    { id: "latency-p95", label: "P95 Latency", value: (totals) => totals.latency.p95Ms, format: (value) => `${numberLabel(value)} ms` },
    { id: "latency-p99", label: "P99 Latency", value: (totals) => totals.latency.p99Ms, format: (value) => `${numberLabel(value)} ms` },
    ...[...metricKeys].sort().map((key): ChartMetric => ({
      id: `metric:${key}`,
      label: title(key),
      value: (totals) => totals.usage.metrics[key] || 0,
      format: numberLabel,
    })),
    ...[...units.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, unit]): ChartMetric => ({
      id: `unit:${id}`,
      label: `${title(unit.key)} · ${unit.unit}`,
      value: (totals) => totals.usage.units.find((candidate) => `${candidate.key}\u0000${candidate.unit}` === id)?.quantity || 0,
      format: numberLabel,
    })),
  ];
}

export function summarize(response: Response): Summary {
  const totalUsd = atomicToUsd(response.totals.billing.finalAmountAtomic);
  return {
    response,
    totalUsd,
    inferenceUsd: atomicToUsd(response.totals.billing.inferenceAmountAtomic),
    platformFeeUsd: atomicToUsd(response.totals.billing.platformFeeAtomic),
    requestCount: response.totals.requests.total,
    modelUsage: response.breakdowns.models.map((entry) => {
      if (!entry.label || !entry.types?.length) throw new Error(`Missing model analytics dimensions: ${entry.key}`);
      return {
        subject: entry.key,
        modelId: entry.key,
        family: entry.label,
        totalAmountAtomic: atomic(entry.totals.billing.finalAmountAtomic),
        totalUsd: atomicToUsd(entry.totals.billing.finalAmountAtomic),
        calls: entry.totals.requests.total,
        totalTokens: entry.totals.usage.metrics.total_tokens || 0,
        lastUsed: entry.lastAt ? Date.parse(entry.lastAt) : 0,
        type: entry.types.join(", "),
      };
    }).sort((left, right) => right.totalUsd - left.totalUsd),
    typeBreakdown: response.breakdowns.types.map((entry) => ({
      key: entry.key,
      usd: atomicToUsd(entry.totals.billing.finalAmountAtomic),
      calls: entry.totals.requests.total,
      tokens: entry.totals.usage.metrics.total_tokens || 0,
      pct: totalUsd > 0 ? atomicToUsd(entry.totals.billing.finalAmountAtomic) / totalUsd * 100 : 0,
    })),
    timeline: response.timeline.map((bucket) => ({
      timestamp: Date.parse(bucket.start),
      endTimestamp: Date.parse(bucket.end),
      totals: bucket.totals,
    })),
    activity: response.settlements.data.map((settlement) => {
      return {
        id: settlement.id,
        requestId: settlement.requestId,
        network: settlement.network,
        model: settlement.model,
        type: settlement.types.join(", "),
        pricedUnits: settlement.pricedUnits,
        inferenceAmountAtomic: settlement.billing.inferenceAmountAtomic,
        platformFeeAtomic: settlement.billing.platformFeeAtomic,
        finalAmountAtomic: settlement.billing.finalAmountAtomic,
        settlementStatus: settlement.status,
        transactionHash: settlement.transactionHash,
        settledAt: Date.parse(settlement.settledAt || settlement.createdAt),
      };
    }),
    chartMetrics: metrics(response),
  };
}

export interface RollingAnalyticsInput {
  rangeMs: number;
  filters: Omit<InferenceAnalytics.InferenceAnalyticsFilters, "from" | "to" | "networks">;
  networks: readonly string[];
}

function canonicalOwner(owner: string): string {
  return owner.startsWith("0x") ? owner.toLowerCase() : owner;
}

function canonicalNetworks(networks: readonly string[]): string[] {
  return [...new Set(networks)].sort();
}

export function buildAnalyticsQueryKey(
  owner: string,
  rangeId: string,
  networks: readonly string[],
  filters: Omit<InferenceAnalytics.InferenceAnalyticsFilters, "from" | "to" | "networks">,
) {
  return [
    "inference-analytics-dashboard",
    canonicalOwner(owner),
    rangeId,
    canonicalNetworks(networks),
    filters,
  ] as const;
}

export function buildRollingAnalyticsFilters(
  input: RollingAnalyticsInput,
  now = Date.now(),
): InferenceAnalytics.InferenceAnalyticsFilters {
  const networks = canonicalNetworks(input.networks);
  return {
    ...input.filters,
    from: new Date(now - input.rangeMs).toISOString(),
    to: new Date(now).toISOString(),
    ...(networks.length > 0 ? { networks } : {}),
  };
}
