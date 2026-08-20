/**
 * Published benchmark snapshots joined to canonical Compose catalog models.
 */

export type BenchmarkOperation =
    | "chat"
    | "text-to-image"
    | "image-to-image"
    | "text-to-video"
    | "image-to-video"
    | "text-to-speech"
    | "speech-to-text"
    | "speech-to-speech"
    | "text-to-audio";

export type BenchmarkModality = "text" | "image" | "audio" | "video";
export type BenchmarkMetricDirection = "higher" | "lower";
export type BenchmarkMetricFormat =
    | "number"
    | "score"
    | "percent"
    | "currency"
    | "milliseconds"
    | "seconds"
    | "tokens-per-second";

export interface BenchmarkMetric {
    key: string;
    label: string;
    unit: string;
    direction: BenchmarkMetricDirection;
    format: BenchmarkMetricFormat;
    headline?: boolean;
    value: number | null;
}

export interface ModelBenchmark {
    id: string;
    sourceId: string;
    sourceSlug: string | null;
    sourceName: string;
    modelId: string;
    slug: string;
    provider: string;
    family: string;
    creator: string;
    creatorSlug: string;
    name: string;
    operation: BenchmarkOperation;
    variant: string | null;
    modality: BenchmarkModality;
    types: string[];
    isFrontier: boolean;
    releaseDate: string | null;
    parameters: string[];
    metrics: BenchmarkMetric[];
    primaryMetric: string | null;

    // Compatibility fields for the original text-model UI.
    intelligenceIndex: number | null;
    codingIndex: number | null;
    mathIndex: number | null;
    agenticIndex: number | null;
    tokensPerSecond: number | null;
    timeToFirstTokenSeconds: number | null;
    timeToFirstAnswerTokenSeconds: number | null;
    priceInput1M: number | null;
    priceOutput1M: number | null;
    efficiencyScore: number | null;
    elo: number | null;
    ci95: number | null;
    samples: number | null;
    aaWerIndex: number | null;
    bbaScore: number | null;
    fdbScore: number | null;
    tauVoiceScore: number | null;

    // Retired free-tier fields retained as nullable for API compatibility.
    mmluPro: number | null;
    gpqa: number | null;
    hle: number | null;
    livecodebench: number | null;
    scicode: number | null;
    math500: number | null;
    aime25: number | null;
    ifbench: number | null;
    lcr: number | null;
    terminalbenchHard: number | null;
    tau2: number | null;
    priceBlended1M: number | null;
}

export interface ComparisonWinner {
    modelId: string;
    value: number | null;
    advantageLabel: string;
}

export interface RadarDataPoint {
    metric: string;
    fullMark: number;
    [modelId: string]: number | string | undefined;
}

export interface ModelComparisonResult {
    models: ModelBenchmark[];
    winners: Record<string, ComparisonWinner>;
    radarData: RadarDataPoint[];
    unresolved: string[];
}

export interface BenchmarkSnapshot {
    fetchedAt: string | null;
    publishedAt: string | null;
    source: string;
    sourceVersion: string | null;
    intelligenceIndexVersion: number | null;
    stale: boolean;
}

export interface BenchmarksApiResponse {
    ok: boolean;
    total: number;
    frontierCount: number;
    operationCounts: Record<string, number>;
    snapshot: BenchmarkSnapshot;
    data: ModelBenchmark[];
    attribution?: {
        source: string;
        url: string;
        message?: string;
    };
}
