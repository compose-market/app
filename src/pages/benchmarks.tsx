import { useLocation } from "wouter";

import { BenchmarksExplorer } from "@/components/benchmarks/explorer";
import type { BenchmarkOperation } from "@/types/benchmarks";

const OPERATIONS = new Set<BenchmarkOperation>([
    "chat",
    "text-to-image",
    "image-to-image",
    "text-to-video",
    "image-to-video",
    "text-to-speech",
    "speech-to-text",
    "speech-to-speech",
    "text-to-audio",
]);

export default function BenchmarksPage() {
    const [, setLocation] = useLocation();
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const operation = params.get("operation");
    const models = (params.get("models") ?? "")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean);
    const family = params.get("family") || "all";

    return (
        <BenchmarksExplorer
            key={window.location.search}
            variant="page"
            open
            initialTab={view === "compare" ? "battle" : view === "frontiers" ? "frontiers" : "leaderboard"}
            initialCompareModelIds={models}
            initialFamily={family}
            initialOperation={OPERATIONS.has(operation as BenchmarkOperation) ? operation as BenchmarkOperation : "chat"}
            initialFrontierOnly={params.get("frontier") !== "0"}
            onSelectModel={(modelId) => setLocation(`/playground?model=${encodeURIComponent(modelId)}`)}
        />
    );
}
