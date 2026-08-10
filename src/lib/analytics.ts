import type { InferenceAnalytics } from "@compose-market/sdk";
import type { NetworkId } from "@compose-market/sdk/chains";

import { atomicToUsd } from "@/lib/receipts";

type Response = InferenceAnalytics.InferenceAnalyticsResponse;
type Totals = InferenceAnalytics.InferenceAnalyticsTotals;
type RequestStatus = InferenceAnalytics.InferenceRequestStatus;
export type AnalyticsInterval = InferenceAnalytics.InferenceAnalyticsInterval;

export interface ModelUsage {
  subject: string;
  modelId: string;
  family: string;
  totalAmountAtomic: bigint;
  totalUsd: number;
  calls: number;
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  /** null when the model recorded no completed requests in range. */
  p50Ms: number | null;
  p95Ms: number | null;
  /** 0..1, null when the model recorded no requests in range. */
  successRate: number | null;
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
  avgLatencyMs: number | null;
  successRate: number | null;
}

export interface FeedItem {
  id: string;
  requestId: string;
  network: NetworkId;
  model: string;
  type: string;
  pricedUnits: InferenceAnalytics.InferencePricedUnit[];
  inferenceAmountAtomic: string;
  platformFeeAtomic: string;
  finalAmountAtomic: string;
  settlementStatus: InferenceAnalytics.InferenceSettlementStatus;
  transactionHash?: string;
  paymentIntentId?: string;
  settledAt: number;
}

/** A single inference request — the per-request telemetry the API returns. */
export interface RequestRow {
  id: string;
  model: string;
  family: string;
  type: string;
  operation: string;
  status: RequestStatus;
  streamed: boolean;
  latencyMs: number;
  /** Time to first token, null when the request was not streamed or not measured. */
  ttftMs: number | null;
  startedAt: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  error?: string;
}

export interface Summary {
  response: Response;
  totalUsd: number;
  inferenceUsd: number;
  platformFeeUsd: number;
  requestCount: number;
  /** 0..1, null when there were no requests in range. */
  successRate: number | null;
  /** Share of requests that streamed, 0..1, null when there were none. */
  streamedShare: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  /** Mean time-to-first-token across the request page, null when unmeasured. */
  avgTtftMs: number | null;
  tokensIn: number;
  tokensOut: number;
  interval: AnalyticsInterval;
  modelUsage: ModelUsage[];
  typeBreakdown: TypeEntry[];
  timeline: TimelineBucket[];
  activity: FeedItem[];
  requests: RequestRow[];
}

function atomic(value: string): bigint {
  return /^\d+$/u.test(value) ? BigInt(value) : 0n;
}

function pickMetric(metrics: Record<string, number>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && value > 0) return value;
  }
  return 0;
}

const INPUT_TOKEN_KEYS = ["input_tokens", "text_input_tokens"] as const;
const OUTPUT_TOKEN_KEYS = ["output_tokens", "text_output_tokens"] as const;

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function emptyTotals(): Totals {
  return {
    requests: { total: 0, succeeded: 0, failed: 0, aborted: 0, streamed: 0 },
    usage: { metrics: {}, units: [] },
    billing: {
      inferenceAmountAtomic: "0",
      platformFeeAtomic: "0",
      finalAmountAtomic: "0",
      currency: "USDC",
      decimals: 6,
    },
    latency: { count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
  };
}

export function mapFeedItem(settlement: InferenceAnalytics.InferenceSettlement): FeedItem {
  const paymentIntentId = (settlement as InferenceAnalytics.InferenceSettlement & { paymentIntentId?: string }).paymentIntentId;
  return {
    id: settlement.id,
    requestId: settlement.requestId,
    network: settlement.network as NetworkId,
    model: settlement.model,
    type: settlement.types.join(", "),
    pricedUnits: settlement.pricedUnits,
    inferenceAmountAtomic: settlement.billing.inferenceAmountAtomic,
    platformFeeAtomic: settlement.billing.platformFeeAtomic,
    finalAmountAtomic: settlement.billing.finalAmountAtomic,
    settlementStatus: settlement.status,
    transactionHash: settlement.transactionHash,
    paymentIntentId,
    settledAt: Date.parse(settlement.settledAt || settlement.createdAt),
  };
}

export function mapRequestRow(record: InferenceAnalytics.InferenceRequestRecord): RequestRow {
  return {
    id: record.id,
    model: record.model,
    family: record.family,
    type: record.types.join(", "),
    operation: record.operation,
    status: record.status,
    streamed: record.streamed,
    latencyMs: record.latencyMs,
    ttftMs: typeof record.timeToFirstTokenMs === "number" ? record.timeToFirstTokenMs : null,
    startedAt: Date.parse(record.startedAt),
    tokensIn: pickMetric(record.usage.metrics, INPUT_TOKEN_KEYS),
    tokensOut: pickMetric(record.usage.metrics, OUTPUT_TOKEN_KEYS),
    costUsd: atomicToUsd(record.billing.finalAmountAtomic),
    error: record.error ? `${record.error.code}: ${record.error.message}` : undefined,
  };
}

// =============================================================================
// Timeline zero-fill — the API omits empty buckets, which makes hand-rolled
// charts collapse gaps. We rebuild a contiguous UTC grid from the echoed
// filters so every chart has an honest time axis.
// =============================================================================

const INTERVAL_MS: Record<AnalyticsInterval, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** Hard cap so a pathological range can never allocate unbounded buckets. */
const MAX_BUCKETS = 2_000;

function floorToInterval(timestampMs: number, interval: AnalyticsInterval): number {
  const date = new Date(timestampMs);
  if (interval === "day") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (interval === "hour") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
  }
  return Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(),
  );
}

export function zeroFillTimeline(response: Response, interval: AnalyticsInterval): TimelineBucket[] {
  const step = INTERVAL_MS[interval];
  const byStart = new Map<number, Totals>();
  for (const bucket of response.timeline) {
    byStart.set(Date.parse(bucket.start), bucket.totals);
  }

  const from = response.filters.from ? Date.parse(response.filters.from) : Number.NaN;
  const to = response.filters.to ? Date.parse(response.filters.to) : Number.NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return response.timeline.map((bucket) => ({
      timestamp: Date.parse(bucket.start),
      endTimestamp: Date.parse(bucket.end),
      totals: bucket.totals,
    }));
  }

  const buckets: TimelineBucket[] = [];
  let cursor = floorToInterval(from, interval);
  const last = floorToInterval(to, interval);
  while (cursor <= last && buckets.length < MAX_BUCKETS) {
    buckets.push({
      timestamp: cursor,
      endTimestamp: cursor + step,
      totals: byStart.get(cursor) ?? emptyTotals(),
    });
    cursor += step;
  }
  return buckets;
}

export function summarize(response: Response): Summary {
  const totalUsd = atomicToUsd(response.totals.billing.finalAmountAtomic);
  const interval: AnalyticsInterval = response.filters.interval ?? "day";
  const requests = response.requests.data.map(mapRequestRow);
  const ttftSamples = requests.filter((row) => row.ttftMs !== null);
  const requestTotals = response.totals.requests;

  return {
    response,
    totalUsd,
    inferenceUsd: atomicToUsd(response.totals.billing.inferenceAmountAtomic),
    platformFeeUsd: atomicToUsd(response.totals.billing.platformFeeAtomic),
    requestCount: requestTotals.total,
    successRate: ratio(requestTotals.succeeded, requestTotals.total),
    streamedShare: ratio(requestTotals.streamed, requestTotals.total),
    avgLatencyMs: response.totals.latency.count > 0 ? response.totals.latency.averageMs : null,
    p95LatencyMs: response.totals.latency.count > 0 ? response.totals.latency.p95Ms : null,
    avgTtftMs: ttftSamples.length > 0
      ? ttftSamples.reduce((sum, row) => sum + (row.ttftMs ?? 0), 0) / ttftSamples.length
      : null,
    tokensIn: pickMetric(response.totals.usage.metrics, INPUT_TOKEN_KEYS),
    tokensOut: pickMetric(response.totals.usage.metrics, OUTPUT_TOKEN_KEYS),
    interval,
    modelUsage: response.breakdowns.models.map((entry) => ({
      subject: entry.key,
      modelId: entry.key,
      family: entry.label ?? entry.key,
      totalAmountAtomic: atomic(entry.totals.billing.finalAmountAtomic),
      totalUsd: atomicToUsd(entry.totals.billing.finalAmountAtomic),
      calls: entry.totals.requests.total,
      totalTokens: entry.totals.usage.metrics.total_tokens || 0,
      tokensIn: pickMetric(entry.totals.usage.metrics, INPUT_TOKEN_KEYS),
      tokensOut: pickMetric(entry.totals.usage.metrics, OUTPUT_TOKEN_KEYS),
      p50Ms: entry.totals.latency.count > 0 ? entry.totals.latency.p50Ms : null,
      p95Ms: entry.totals.latency.count > 0 ? entry.totals.latency.p95Ms : null,
      successRate: ratio(entry.totals.requests.succeeded, entry.totals.requests.total),
      lastUsed: entry.lastAt ? Date.parse(entry.lastAt) : 0,
      type: entry.types?.join(", ") || "unknown",
    })).sort((left, right) => right.totalUsd - left.totalUsd),
    typeBreakdown: response.breakdowns.types.map((entry) => ({
      key: entry.key,
      usd: atomicToUsd(entry.totals.billing.finalAmountAtomic),
      calls: entry.totals.requests.total,
      tokens: entry.totals.usage.metrics.total_tokens || 0,
      pct: totalUsd > 0 ? atomicToUsd(entry.totals.billing.finalAmountAtomic) / totalUsd * 100 : 0,
      avgLatencyMs: entry.totals.latency.count > 0 ? entry.totals.latency.averageMs : null,
      successRate: ratio(entry.totals.requests.succeeded, entry.totals.requests.total),
    })),
    timeline: zeroFillTimeline(response, interval),
    activity: response.settlements.data.map(mapFeedItem),
    requests,
  };
}

// =============================================================================
// Formatters — shared by KPI cards, charts, tables, and the activity feed.
// =============================================================================

export function numberLabel(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    notation: value >= 100_000 ? "compact" : "standard",
  }).format(value);
}

/** Compact latency: 340ms, 1.2s, 61.4s */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 100_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

/** Compact token counts: 999, 12.4k, 1.2M */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1000) return String(Math.round(value));
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** 0..1 → "99.2%" (em dash for null) */
export function formatPct(rate: number | null, digits = 1): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Axis tick: intra-day ranges get HH:mm, day ranges get "MMM d". */
export function tickTime(timestamp: number, interval: AnalyticsInterval): string {
  const date = new Date(timestamp);
  if (interval === "day") return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Tooltip heading: always fully unambiguous. */
export function tooltipTime(timestamp: number, endTimestamp: number, interval: AnalyticsInterval): string {
  const date = new Date(timestamp);
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (interval === "day") return day;
  const end = new Date(endTimestamp);
  return `${day} ${two(date.getHours())}:${two(date.getMinutes())}–${two(end.getHours())}:${two(end.getMinutes())}`;
}

// =============================================================================
// Query key + rolling filters (stable identities, fetch-time timestamps)
// =============================================================================

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
