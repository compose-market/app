import assert from "node:assert/strict";
import test from "node:test";

import type { InferenceAnalytics } from "@compose-market/sdk";

import {
  formatMs,
  formatPct,
  formatTokens,
  mapRequestRow,
  summarize,
  tickTime,
  zeroFillTimeline,
} from "../src/lib/analytics.ts";

type Totals = InferenceAnalytics.InferenceAnalyticsTotals;
type Response = InferenceAnalytics.InferenceAnalyticsResponse;

function makeTotals(overrides: Partial<Totals> = {}): Totals {
  return {
    requests: { total: 10, succeeded: 9, failed: 1, aborted: 0, streamed: 8 },
    usage: { metrics: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 }, units: [] },
    billing: {
      inferenceAmountAtomic: "900000",
      platformFeeAtomic: "9000",
      finalAmountAtomic: "909000",
      currency: "USDC",
      decimals: 6,
    },
    latency: { count: 10, averageMs: 800, p50Ms: 700, p95Ms: 1200, p99Ms: 2000 },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<Response> = {}): Response {
  return {
    kind: "inference",
    filters: { from: "2026-08-01T00:30:00.000Z", to: "2026-08-01T03:10:00.000Z", interval: "hour" },
    totals: makeTotals(),
    breakdowns: {
      families: [],
      models: [],
      types: [],
      operations: [],
      statuses: [],
      settlements: [],
    },
    timeline: [],
    requests: { data: [], nextCursor: null },
    settlements: { data: [], nextCursor: null },
    updatedAt: "2026-08-01T04:00:00.000Z",
    ...overrides,
  };
}

test("zeroFillTimeline rebuilds a contiguous UTC grid and zero-fills gaps", () => {
  const response = makeResponse({
    timeline: [
      { start: "2026-08-01T01:00:00.000Z", end: "2026-08-01T02:00:00.000Z", totals: makeTotals() },
    ],
  });
  const buckets = zeroFillTimeline(response, "hour");
  // from 00:30 → floor 00:00; to 03:10 → floor 03:00 → 4 buckets (00, 01, 02, 03)
  assert.equal(buckets.length, 4);
  assert.equal(buckets[0].timestamp, Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(buckets[1].totals.requests.total, 10);
  assert.equal(buckets[0].totals.requests.total, 0);
  assert.equal(buckets[2].totals.latency.count, 0);
  assert.equal(buckets[3].endTimestamp - buckets[3].timestamp, 3_600_000);
});

test("zeroFillTimeline falls back to API buckets when from/to are missing", () => {
  const response = makeResponse({
    filters: { interval: "day" },
    timeline: [
      { start: "2026-07-01T00:00:00.000Z", end: "2026-07-02T00:00:00.000Z", totals: makeTotals() },
    ],
  });
  const buckets = zeroFillTimeline(response, "day");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].totals.requests.total, 10);
});

test("summarize never throws on model rows missing label/types and keeps health signals", () => {
  const response = makeResponse({
    breakdowns: {
      families: [],
      models: [
        { key: "gpt-5.5", totals: makeTotals() },
        { key: "kimi-k3", label: "Moonshot", types: ["text"], totals: makeTotals() },
      ],
      types: [{ key: "text", totals: makeTotals() }],
      operations: [],
      statuses: [],
      settlements: [],
    },
  });
  const summary = summarize(response);
  assert.equal(summary.modelUsage.length, 2);
  assert.equal(summary.modelUsage[0].family, "gpt-5.5");
  assert.equal(summary.modelUsage[0].type, "unknown");
  assert.equal(summary.modelUsage[0].p95Ms, 1200);
  assert.equal(summary.modelUsage[0].successRate, 0.9);
  assert.equal(summary.successRate, 0.9);
  assert.equal(summary.streamedShare, 0.8);
  assert.equal(summary.avgLatencyMs, 800);
  assert.equal(summary.p95LatencyMs, 1200);
  assert.equal(summary.tokensIn, 1000);
  assert.equal(summary.tokensOut, 500);
  assert.equal(summary.interval, "hour");
  assert.equal(summary.timeline.length, 4);
  assert.equal(summary.typeBreakdown[0].avgLatencyMs, 800);
});

test("summarize computes avgTtftMs only over measured requests", () => {
  const record: InferenceAnalytics.InferenceRequestRecord = {
    id: "req-1",
    responseId: "resp-1",
    network: "eip155:43113",
    family: "OpenAI",
    model: "gpt-5.5",
    types: ["text"],
    operation: "chat",
    streamed: true,
    status: "succeeded",
    startedAt: "2026-08-01T01:05:00.000Z",
    completedAt: "2026-08-01T01:05:01.000Z",
    latencyMs: 1000,
    timeToFirstTokenMs: 200,
    usage: { metrics: { input_tokens: 10, output_tokens: 20 }, units: [] },
    billing: { inferenceAmountAtomic: "100", platformFeeAtomic: "1", finalAmountAtomic: "101", currency: "USDC", decimals: 6 },
    settlementIds: [],
  };
  const unmeasured = { ...record, id: "req-2", timeToFirstTokenMs: undefined };
  const summary = summarize(makeResponse({ requests: { data: [record, unmeasured], nextCursor: null } }));
  assert.equal(summary.requests.length, 2);
  assert.equal(summary.avgTtftMs, 200);
  assert.equal(summary.requests[0].ttftMs, 200);
  assert.equal(summary.requests[1].ttftMs, null);
  assert.equal(summary.requests[0].tokensIn, 10);
  assert.equal(summary.requests[0].tokensOut, 20);
});

test("mapRequestRow surfaces errors as 'code: message'", () => {
  const row = mapRequestRow({
    id: "req-3",
    responseId: "resp-3",
    network: "eip155:43113",
    family: "OpenAI",
    model: "gpt-5.5",
    types: ["text"],
    operation: "chat",
    streamed: false,
    status: "failed",
    startedAt: "2026-08-01T01:05:00.000Z",
    completedAt: "2026-08-01T01:05:01.000Z",
    latencyMs: 500,
    usage: { metrics: {}, units: [] },
    billing: { inferenceAmountAtomic: "0", platformFeeAtomic: "0", finalAmountAtomic: "0", currency: "USDC", decimals: 6 },
    settlementIds: [],
    error: { code: "content_filter", message: "Blocked by upstream filter" },
  });
  assert.equal(row.error, "content_filter: Blocked by upstream filter");
  assert.equal(row.status, "failed");
});

test("formatters are compact and null-safe", () => {
  assert.equal(formatMs(340), "340ms");
  assert.equal(formatMs(1200), "1.2s");
  assert.equal(formatMs(0), "—");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(12_400), "12.4K");
  assert.equal(formatPct(0.992), "99.2%");
  assert.equal(formatPct(null), "—");
  assert.equal(tickTime(Date.parse("2026-08-01T13:45:00.000Z"), "hour").length > 0, true);
  assert.equal(tickTime(Date.parse("2026-08-01T00:00:00.000Z"), "day"), "Aug 1");
});
