import assert from "node:assert/strict";
import test from "node:test";

import {
    BENCHMARK_METRIC_ACRONYMS,
    benchmarkMetricShortLabel,
    benchmarkOperationLabel,
    catalogModelSupportsBenchmarks,
    cleanBenchmarkDisplayName,
    cleanBenchmarkParameters,
    compareBenchmarkModels,
    compareModelBenchmarks,
    defaultComparisonModelIds,
    formatBenchmarkMetric,
} from "../src/lib/benchmarks";
import type { CatalogModel } from "../src/lib/models";
import type { BenchmarkMetric, ModelBenchmark } from "../src/types/benchmarks";

function benchmark(overrides: Partial<ModelBenchmark>): ModelBenchmark {
    return {
        id: overrides.sourceId ?? "source",
        sourceId: overrides.sourceId ?? "source",
        sourceSlug: null,
        sourceName: overrides.name ?? "Model",
        modelId: overrides.modelId ?? "model",
        slug: overrides.modelId ?? "model",
        provider: "openai",
        family: "openai",
        creator: "OpenAI",
        creatorSlug: "openai",
        name: overrides.name ?? "Model",
        operation: overrides.operation ?? "chat",
        variant: overrides.variant ?? null,
        modality: "text",
        types: ["text generation"],
        isFrontier: overrides.isFrontier ?? false,
        releaseDate: null,
        parameters: overrides.parameters ?? [],
        metrics: overrides.metrics ?? [{ key: "intelligence", label: "Intelligence", unit: "points", direction: "higher", format: "score", headline: true, value: 50 }],
        primaryMetric: overrides.primaryMetric ?? "intelligence",
        intelligenceIndex: 50,
        codingIndex: null,
        mathIndex: null,
        agenticIndex: null,
        tokensPerSecond: null,
        timeToFirstTokenSeconds: null,
        timeToFirstAnswerTokenSeconds: null,
        priceInput1M: null,
        priceOutput1M: null,
        efficiencyScore: null,
        elo: null,
        ci95: null,
        samples: null,
        aaWerIndex: null,
        bbaScore: null,
        fdbScore: null,
        tauVoiceScore: null,
        mmluPro: null,
        gpqa: null,
        hle: null,
        livecodebench: null,
        scicode: null,
        math500: null,
        aime25: null,
        ifbench: null,
        lcr: null,
        terminalbenchHard: null,
        tau2: null,
        priceBlended1M: null,
    };
}

test("benchmark defaults use active model plus current compatible frontier rows, not obsolete literals", () => {
    const rows = [
        benchmark({ sourceId: "active-source", modelId: "active-model", name: "Active", isFrontier: true }),
        benchmark({ sourceId: "frontier-source", modelId: "frontier-model", name: "Frontier", isFrontier: true, metrics: [{ key: "intelligence", label: "Intelligence", unit: "points", direction: "higher", format: "score", headline: true, value: 70 }] }),
        benchmark({ sourceId: "image-source", modelId: "image-model", name: "Image", operation: "text-to-image", modality: "image", metrics: [{ key: "elo", label: "Elo", unit: "Elo", direction: "higher", format: "score", headline: true, value: 1200 }], primaryMetric: "elo" }),
    ];

    const selected = defaultComparisonModelIds("active-model", rows);
    assert.deepEqual(selected.slice(0, 2), ["active-source", "frontier-source"]);
    assert.equal(selected.includes("gpt-4o"), false);
    assert.equal(selected.includes("claude-3-5-sonnet"), false);
    assert.equal(selected.includes("image-source"), false);
});

test("unsupported specialized catalog models do not expose benchmark tabs", () => {
    assert.equal(catalogModelSupportsBenchmarks({ modelId: "embed", provider: "openai", type: "embeddings" } as CatalogModel), false);
    assert.equal(catalogModelSupportsBenchmarks({ modelId: "ocr", provider: "roboflow", type: "ocr" } as CatalogModel), false);
    assert.equal(catalogModelSupportsBenchmarks({ modelId: "image", provider: "openai", type: "image generation" } as CatalogModel), true);
});

test("local comparisons preserve benchmark parameter variants with shared catalog IDs", () => {
    const base = { modelId: "shared-model", operation: "chat" as const };
    const rows = [
        benchmark({ ...base, sourceId: "standard", name: "Shared Standard", metrics: [{ key: "intelligence", label: "Intelligence", unit: "points", direction: "higher", format: "score", headline: true, value: 50 }] }),
        benchmark({ ...base, sourceId: "long-horizon", name: "Shared Long Horizon", variant: "long-horizon", parameters: ["long-horizon"], metrics: [{ key: "intelligence", label: "Intelligence", unit: "points", direction: "higher", format: "score", headline: true, value: 60 }] }),
    ];

    const comparison = compareModelBenchmarks(rows, ["standard", "long-horizon"]);
    assert.equal(comparison.models.length, 2);
    assert.equal(comparison.models[1].parameters[0], "long-horizon");
    assert.equal(comparison.winners.intelligence.modelId, "long-horizon");
});

test("formatBenchmarkMetric correctly handles all metric formats and nulls", () => {
    assert.equal(formatBenchmarkMetric(null), "—");
    assert.equal(formatBenchmarkMetric({ key: "null-val", label: "Test", unit: "", direction: "higher", format: "score", value: null }), "—");
    
    const currency: BenchmarkMetric = { key: "c", label: "Cost", unit: "$", direction: "lower", format: "currency", value: 0.045 };
    assert.equal(formatBenchmarkMetric(currency), "$0.045");
    
    const currencyHigh: BenchmarkMetric = { key: "c", label: "Cost", unit: "$", direction: "lower", format: "currency", value: 2.5 };
    assert.equal(formatBenchmarkMetric(currencyHigh), "$2.50");

    const ms: BenchmarkMetric = { key: "t", label: "Latency", unit: "s", direction: "lower", format: "milliseconds", value: 0.35 };
    assert.equal(formatBenchmarkMetric(ms), "350ms");

    const sec: BenchmarkMetric = { key: "s", label: "Time", unit: "s", direction: "lower", format: "seconds", value: 1.256 };
    assert.equal(formatBenchmarkMetric(sec), "1.26s");

    const tps: BenchmarkMetric = { key: "spd", label: "Speed", unit: "tok/s", direction: "higher", format: "tokens-per-second", value: 142.8 };
    assert.equal(formatBenchmarkMetric(tps), "142.8 tok/s");

    const pct: BenchmarkMetric = { key: "acc", label: "Accuracy", unit: "%", direction: "higher", format: "percent", value: 0.895 };
    assert.equal(formatBenchmarkMetric(pct), "89.5%");
});

test("benchmarkOperationLabel returns friendly human names for all modalities", () => {
    assert.equal(benchmarkOperationLabel("chat"), "Language");
    assert.equal(benchmarkOperationLabel("text-to-image"), "Text to Image");
    assert.equal(benchmarkOperationLabel("image-to-image"), "Image Editing");
    assert.equal(benchmarkOperationLabel("text-to-video"), "Text to Video");
    assert.equal(benchmarkOperationLabel("text-to-speech"), "Text to Speech");
    assert.equal(benchmarkOperationLabel("speech-to-text"), "Speech to Text");
    assert.equal(benchmarkOperationLabel("text-to-audio"), "Music");
});

test("compareBenchmarkModels correctly sorts based on primary metric direction", () => {
    const highWinsA = benchmark({ name: "Model A", metrics: [{ key: "intelligence", label: "Intelligence", unit: "pts", direction: "higher", format: "score", value: 90 }] });
    const highWinsB = benchmark({ name: "Model B", metrics: [{ key: "intelligence", label: "Intelligence", unit: "pts", direction: "higher", format: "score", value: 70 }] });
    
    // higher is better: A should come before B (diff < 0)
    assert.ok(compareBenchmarkModels(highWinsA, highWinsB) < 0);
    assert.ok(compareBenchmarkModels(highWinsB, highWinsA) > 0);

    const lowWinsA = benchmark({ name: "Fast", primaryMetric: "ttft", metrics: [{ key: "ttft", label: "TTFT", unit: "s", direction: "lower", format: "seconds", value: 0.2 }] });
    const lowWinsB = benchmark({ name: "Slow", primaryMetric: "ttft", metrics: [{ key: "ttft", label: "TTFT", unit: "s", direction: "lower", format: "seconds", value: 0.8 }] });

    // lower is better: Fast should come before Slow (diff < 0)
    assert.ok(compareBenchmarkModels(lowWinsA, lowWinsB) < 0);
    assert.ok(compareBenchmarkModels(lowWinsB, lowWinsA) > 0);
});

test("cleanBenchmarkDisplayName strips raw execution noise from model names", () => {
    assert.equal(
        cleanBenchmarkDisplayName("Claude 3.5 Sonnet (adaptive reasoning, opus 4.8 fallback)"),
        "Claude 3.5 Sonnet"
    );
    assert.equal(
        cleanBenchmarkDisplayName("Claude Fable 5 (high effort)"),
        "Claude Fable 5"
    );
    assert.equal(
        cleanBenchmarkDisplayName("GPT-5.6 (reasoning effort: high)"),
        "GPT-5.6"
    );
    assert.equal(
        cleanBenchmarkDisplayName("Qwen 2.5 72B"),
        "Qwen 2.5 72B"
    );
    assert.equal(
        cleanBenchmarkDisplayName(benchmark({ name: "Claude 3.5 Sonnet (adaptive reasoning, opus 4.8 fallback)" })),
        "Claude 3.5 Sonnet"
    );
});

test("cleanBenchmarkParameters filters out noisy fallback/effort flags while preserving semantic parameters", () => {
    const raw = ["adaptive reasoning", "opus 4.8 fallback", "Instrumental", "high effort", "With Vocals"];
    const cleaned = cleanBenchmarkParameters(raw);
    assert.deepEqual(cleaned, ["Instrumental", "With Vocals"]);
});

test("benchmarkMetricShortLabel returns canonical acronyms for known metric keys", () => {
    assert.equal(benchmarkMetricShortLabel({ key: "intelligence", label: "Intelligence Index" }), "II");
    assert.equal(benchmarkMetricShortLabel({ key: "coding", label: "Coding Index" }), "CI");
    assert.equal(benchmarkMetricShortLabel({ key: "agentic", label: "Agentic Index" }), "AX");
    assert.equal(benchmarkMetricShortLabel({ key: "speed", label: "Output Speed" }), "TOK/S");
    assert.equal(benchmarkMetricShortLabel({ key: "ttft", label: "Time to First Token" }), "TTFT");
    assert.equal(benchmarkMetricShortLabel({ key: "costPerTask", label: "Cost per Intelligence Task" }), "COST/TASK");
    assert.equal(benchmarkMetricShortLabel({ key: "elo", label: "Arena Quality Elo" }), "ELO");
    assert.equal(benchmarkMetricShortLabel({ key: "wer", label: "AA-WER Index" }), "WER");
    assert.equal(benchmarkMetricShortLabel({ key: "tauVoice", label: "𝜏-Voice Score" }), "τ-V");
});

test("benchmarkMetricShortLabel falls back to the full label for unknown keys and nullish input", () => {
    assert.equal(benchmarkMetricShortLabel({ key: "mmluPro", label: "MMLU-Pro" }), "MMLU-Pro");
    assert.equal(benchmarkMetricShortLabel(null), "—");
    assert.equal(benchmarkMetricShortLabel(undefined), "—");
});

test("BENCHMARK_METRIC_ACRONYMS stays compact for dense table headers", () => {
    for (const [key, acronym] of Object.entries(BENCHMARK_METRIC_ACRONYMS)) {
        assert.ok(acronym.length <= 12, `acronym for "${key}" ("${acronym}") must stay compact`);
    }
});

