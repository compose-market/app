/**
 * Unified Chat Component
 * 
 * Consolidates:
 * - MultimodalCanvas (chat container with input, attachments, recording)
 * - MessageItem (message bubbles with actions)
 * - MarkdownRenderer (rich content with Mermaid, LaTeX, code)
 * 
 * Used by: agent.tsx, workflow.tsx, playground.tsx
 */
import React, { Suspense, lazy, useState, memo, useCallback, useEffect, useRef } from "react";
import {
    PlanReview as SharedPlanReview,
    StreamMedia as SharedStreamMedia,
    StreamNode as SharedStreamNode,
    StreamNotice as SharedStreamNotice,
    StreamPocket as SharedStreamPocket,
} from "@compose-market/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Bot,
    User,
    Loader2,
    Send,
    Play,
    Paperclip,
    Mic,
    MicOff,
    Music,
    Video,
    X,
    Layers,
    Trash2,
    BookOpen,
    Copy,
    RefreshCw,
    ChevronDown,
    FileText,
    Image as ImageIcon,
    Maximize2,
    Download,
} from "lucide-react";
import type { ActivityNode, ActivityState } from "@compose-market/sdk";
import type { Artifact, AttachedFile, ChatActivityState, Message, MessageBlock, Plan } from "@/hooks/use-chat";

// Re-export for convenience
export type { Message, AttachedFile };
const LazyMarkdownRenderer = lazy(() =>
    import("@/lib/performance/markdown").then((module) => ({ default: module.MarkdownRenderer }))
);

function EmbeddingBlock({ content }: { content: string }) {
    const [copied, setCopied] = useState(false);

    // Parse embedding content - try to prettify it
    let formattedContent = content;
    let dimensions = 0;
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            // Handle nested arrays (multiple embeddings)
            if (Array.isArray(parsed[0])) {
                dimensions = parsed[0].length;
                formattedContent = parsed.map((emb: number[], idx: number) =>
                    `[${idx}]:\n  ` + emb.map((v, i) => `[${i}]: ${v.toFixed(8)}`).join('\n  ')
                ).join('\n\n');
            } else {
                // Single embedding array
                dimensions = parsed.length;
                formattedContent = parsed.map((v: number, i: number) => `[${i}]: ${v.toFixed(8)}`).join('\n');
            }
        }
    } catch {
        // Keep original content if not valid JSON
    }

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <SharedStreamNode
            title={<>Embedding vector {dimensions > 0 && <span>({dimensions} dimensions)</span>}</>}
            defaultOpen={false}
            metadata={
                <button
                    onClick={handleCopy}
                    className="cm-chat__icon-action w-fit rounded-full px-2 py-1 text-[11px] transition-colors"
                    title="Copy raw embedding"
                    type="button"
                >
                    {copied ? "Copied" : "Copy raw embedding"}
                </button>
            }
        >
            <pre className="text-xs font-mono text-emerald-300/80 overflow-auto max-h-80 whitespace-pre leading-relaxed">
                {formattedContent}
            </pre>
        </SharedStreamNode>
    );
}

function shortId(value?: string): string {
    if (!value) return "";
    return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatBytes(value?: number): string | null {
    if (!value || !Number.isFinite(value)) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function PlanReview({
    messageId,
    plan,
    onPlanDecision,
}: {
    messageId: string;
    plan: Plan;
    onPlanDecision?: MessageItemProps["onPlanDecision"];
}) {
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedback, setFeedback] = useState("");
    const decided = plan.decision || plan.state === "approved" || plan.state === "rejected" || plan.state === "changes_requested";
    const canAct = Boolean(onPlanDecision) && !plan.pending && !decided;
    const title = plan.type === "harness_plan_decided" ? "Plan decision" : "Plan review";
    const subtitle = plan.decision === "changes_requested"
        ? "Changes were requested. The agent can revise and propose the next version."
        : plan.decision === "rejected"
            ? "The plan was rejected."
            : plan.decision === "approved" || plan.state === "approved"
                ? "The plan was approved and execution can continue."
                : "Review the proposed work plan and choose an out-of-band decision.";
    const metadata = (
        <>
            <span>v{plan.version}</span>
            {plan.proposalId && <span>{shortId(plan.proposalId)}</span>}
            {plan.composeRunId && <span>{shortId(plan.composeRunId)}</span>}
        </>
    );
    const body = plan.markdown || "Plan proposal received.";
    const actions = canAct ? (
        <>
            {feedbackOpen && (
                <Textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Feedback for the revised plan"
                    className="min-h-16 w-full basis-full resize-none border-amber-500/30 bg-background/60 text-xs"
                />
            )}
            <Button
                type="button"
                size="sm"
                className="h-8 bg-emerald-500 text-black hover:bg-emerald-400"
                disabled={plan.pending}
                onClick={() => onPlanDecision?.(messageId, plan, "approved")}
            >
                Approve
            </Button>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-amber-500/40 text-amber-300"
                disabled={plan.pending || (feedbackOpen && feedback.trim().length === 0)}
                onClick={() => {
                    if (!feedbackOpen) {
                        setFeedbackOpen(true);
                        return;
                    }
                    onPlanDecision?.(messageId, plan, "changes_requested", feedback.trim());
                }}
            >
                Request changes
            </Button>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-red-500/40 text-red-300"
                disabled={plan.pending}
                onClick={() => onPlanDecision?.(messageId, plan, "rejected", feedback.trim() || undefined)}
            >
                Reject
            </Button>
        </>
    ) : null;

    return (
        <details className="cm-chat-plan mb-2" open={!decided}>
            <summary className="cm-stream-node__summary-row">
                <span className="cm-stream-node__marker" />
                <span className="cm-stream-node__title">{planSummary(plan)}</span>
                <span className="cm-stream-node__metadata">{metadata}</span>
            </summary>
            <SharedPlanReview
                title={title}
                subtitle={plan.error ? plan.error : subtitle}
                state={plan.decision || plan.state}
                metadata={metadata}
                actions={actions}
            >
                <Suspense fallback={<p className="whitespace-pre-wrap text-sm">{body}</p>}>
                    <LazyMarkdownRenderer content={body} />
                </Suspense>
            </SharedPlanReview>
        </details>
    );
}

function planSummary(plan: Plan): string {
    const state = plan.decision || plan.state;
    if (state === "approved") return `Plan approved · v${plan.version}`;
    if (state === "rejected") return `Plan rejected · v${plan.version}`;
    if (state === "changes_requested") return `Plan changes requested · v${plan.version}`;
    return `Plan proposed · v${plan.version}`;
}

function ArtifactBlock({ artifacts }: { artifacts: Artifact[] }) {
    const [expanded, setExpanded] = useState<Artifact | null>(null);
    const rows = artifacts;
    if (rows.length === 0) return null;
    const mediaTotal = mediaCounts(rows);
    return (
        <div className="cm-chat-artifacts mb-2 space-y-4">
            {rows.map((item, index) => {
                const size = formatBytes(item.bytes);
                const status = artifactStatus(item);
                const mediaKind = artifactMediaKind(item.artifactType);
                const partial = item.partial === true || item.hydrating === true || item.status === "running";
                const progress = progressLabel(item.progress);
                const title = mediaKind
                    ? mediaTitle(item, rows, mediaTotal)
                    : `${artifactTitle(item.artifactType)} ${index + 1}`;
                const actionLabel = title || artifactTitle(item.artifactType);

                if (mediaKind) {
                    return (
                        <div key={item.id} className="cm-chat-media-asset space-y-1.5">
                            {item.url ? (
                                <div className={cn(
                                    "relative max-w-full",
                                    mediaKind === "audio" ? "w-full min-w-0" : mediaKind === "video" ? "w-full max-w-2xl" : "w-fit",
                                )}>
                                    {mediaKind === "image" ? (
                                        <button
                                            type="button"
                                            className="block max-w-full cursor-zoom-in rounded-md text-left"
                                            onClick={() => setExpanded(item)}
                                            aria-label={`Open ${actionLabel}`}
                                        >
                                            <SharedStreamMedia
                                                kind={mediaKind}
                                                url={item.url}
                                                partial={partial}
                                            />
                                        </button>
                                    ) : (
                                        <SharedStreamMedia
                                            kind={mediaKind}
                                            url={item.url}
                                            partial={partial}
                                        />
                                    )}
                                    {partial && (
                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/15 text-xs font-medium text-white shadow">
                                            {progress || "Generating"}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <PendingMedia
                                    type={mediaKind}
                                    status={progress ? `${status} ${progress}` : status}
                                />
                            )}
                            <ArtifactMeta
                                title={title}
                                values={[
                                    mediaStatus(status),
                                    progress,
                                    item.mimeType,
                                    size || undefined,
                                    item.responseId ? `response ${shortId(item.responseId)}` : undefined,
                                ]}
                                url={item.url}
                                onOpen={() => setExpanded(item)}
                            />
                            {item.error && (
                                <SharedStreamNotice tone="error" title="Artifact error">
                                    {item.error}
                                </SharedStreamNotice>
                            )}
                        </div>
                    );
                }

                if (item.artifactType === "embedding") {
                    const label = title ?? `${artifactTitle(item.artifactType)} ${index + 1}`;
                    return (
                        <EmbeddingArtifact
                            key={item.id}
                            item={item}
                            title={label}
                            values={[
                                embeddingShape(item),
                                item.responseId ? `response ${shortId(item.responseId)}` : undefined,
                            ]}
                        />
                    );
                }

                return (
                    <div key={item.id} className="cm-chat-artifact-meta space-y-1.5">
                        <ArtifactMeta
                            title={title}
                            values={[
                                status,
                                progress,
                                item.mimeType,
                                size || undefined,
                                item.responseId ? `response ${shortId(item.responseId)}` : undefined,
                            ]}
                            url={item.url}
                        />
                        {item.url ? (
                            <a className="text-xs underline-offset-2 hover:underline" href={item.url} target="_blank" rel="noreferrer">
                                Open artifact
                            </a>
                        ) : null}
                        {item.error && (
                            <SharedStreamNotice tone="error" title="Artifact error">
                                {item.error}
                            </SharedStreamNotice>
                        )}
                    </div>
                );
            })}
            <MediaPreview artifact={expanded} onOpenChange={(open) => {
                if (!open) setExpanded(null);
            }} />
        </div>
    );
}

function MediaPreview({
    artifact,
    onOpenChange,
}: {
    artifact: Artifact | null;
    onOpenChange: (open: boolean) => void;
}) {
    const kind = artifact ? artifactMediaKind(artifact.artifactType) : null;
    const url = artifact?.url;
    const title = artifact ? artifactTitle(artifact.artifactType) : "Asset";
    return (
        <Dialog open={Boolean(kind && url)} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl border-cyan-500/30 bg-background/95 p-4">
                <DialogHeader>
                    <DialogTitle className="font-display text-sm text-cyan-100">{title}</DialogTitle>
                </DialogHeader>
                {kind && url ? (
                    <div className={cn("flex max-h-[78vh] min-h-0 items-center justify-center", kind === "audio" && "items-stretch")}>
                        <SharedStreamMedia
                            kind={kind}
                            url={url}
                            className={cn(
                                kind === "image" && "max-h-[72vh] w-auto",
                                kind === "video" && "max-h-[72vh]",
                                kind === "audio" && "w-full",
                            )}
                        />
                    </div>
                ) : null}
                {url ? (
                    <div className="flex justify-end text-xs text-muted-foreground">
                        <a
                            className="cm-chat__icon-action inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                            href={url}
                            download
                            rel="noreferrer"
                            aria-label="Download"
                            title="Download"
                        >
                            <Download className="h-3 w-3" />
                        </a>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function mediaCounts(artifacts: Artifact[]): Map<Artifact["artifactType"], number> {
    const counts = new Map<Artifact["artifactType"], number>();
    for (const item of artifacts) {
        if (!artifactMediaKind(item.artifactType)) continue;
        counts.set(item.artifactType, (counts.get(item.artifactType) ?? 0) + 1);
    }
    return counts;
}

function mediaTitle(
    item: Artifact,
    artifacts: Artifact[],
    counts: Map<Artifact["artifactType"], number>,
): string | undefined {
    if ((counts.get(item.artifactType) ?? 0) <= 1) return undefined;
    const index = artifacts
        .filter((current) => current.artifactType === item.artifactType)
        .findIndex((current) => current.id === item.id);
    return `${artifactTitle(item.artifactType)} ${index + 1}`;
}

function mediaStatus(status: string): string | undefined {
    return status === "Ready" ? undefined : status;
}

function EmbeddingArtifact({
    item,
    title,
    values,
}: {
    item: Artifact;
    title: string;
    values: Array<string | undefined>;
}) {
    const [copied, setCopied] = useState(false);
    const vector = embeddingVector(item);
    const raw = vector ? JSON.stringify(vector) : JSON.stringify(item.raw ?? {}, null, 2);
    const formatted = vector ? formatEmbedding(vector) : raw;
    const copy = async () => {
        await navigator.clipboard.writeText(raw);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <SharedStreamNode
            title={title}
            defaultOpen={false}
            metadata={
                <>
                    <StreamMeta values={values} />
                    <button
                        onClick={copy}
                        className="cm-chat__icon-action w-fit rounded-full px-2 py-1 text-[11px] transition-colors"
                        title="Copy raw embedding"
                        type="button"
                    >
                        {copied ? "Copied" : "Copy raw"}
                    </button>
                </>
            }
        >
            {vector ? (
                <pre className="text-xs font-mono text-emerald-300/80 overflow-auto max-h-80 whitespace-pre leading-relaxed">
                    {formatted}
                </pre>
            ) : (
                <SharedStreamNotice tone="warning" title="Embedding data unavailable">
                    {item.responseId ? `Response ${shortId(item.responseId)} finished, but the vector payload was not returned to the UI.` : "The embedding vector payload was not returned to the UI."}
                </SharedStreamNotice>
            )}
            {item.error && (
                <SharedStreamNotice tone="error" title="Embedding error">
                    {item.error}
                </SharedStreamNotice>
            )}
        </SharedStreamNode>
    );
}

function embeddingShape(item: Artifact): string | undefined {
    const vector = embeddingVector(item);
    if (!vector) return undefined;
    if (isVector(vector)) return `${vector.length} dimensions`;
    const dimensions = vector[0]?.length;
    return `${vector.length} vectors${dimensions ? ` · ${dimensions} dimensions` : ""}`;
}

function embeddingVector(item: Artifact): number[] | number[][] | null {
    const raw = item.raw ?? {};
    const hydrated = record(raw.hydrated);
    for (const value of [
        item.embedding,
        raw.embedding,
        raw.embeddings,
        hydrated?.embedding,
        hydrated?.embeddings,
    ]) {
        const parsed = parseEmbedding(value);
        if (parsed) return parsed;
    }
    return null;
}

function parseEmbedding(value: unknown): number[] | number[][] | null {
    if (isVector(value)) return value;
    if (Array.isArray(value) && value.every(isVector)) return value;
    return null;
}

function isVector(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatEmbedding(value: number[] | number[][]): string {
    if (isVector(value)) {
        return value.map((entry, index) => `[${index}]: ${entry.toFixed(8)}`).join("\n");
    }
    return value.map((vector, index) =>
        `[${index}]:\n  ${vector.map((entry, dimension) => `[${dimension}]: ${entry.toFixed(8)}`).join("\n  ")}`
    ).join("\n\n");
}

function ArtifactMeta({
    title,
    values,
    url,
    onOpen,
}: {
    title?: string;
    values: Array<string | undefined>;
    url?: string;
    onOpen?: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {title && <span className="font-medium text-foreground">{title}</span>}
            <StreamMeta values={values} />
            {url && (
                <>
                    {onOpen ? (
                        <button
                            type="button"
                            className="cm-chat__icon-action inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                            onClick={onOpen}
                            aria-label="Open"
                            title="Open"
                        >
                            <Maximize2 className="h-3 w-3" />
                        </button>
                    ) : (
                        <a className="underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">Open</a>
                    )}
                    {onOpen ? (
                        <a
                            className="cm-chat__icon-action inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                            href={url}
                            download
                            rel="noreferrer"
                            aria-label="Download"
                            title="Download"
                        >
                            <Download className="h-3 w-3" />
                        </a>
                    ) : (
                        <a className="underline-offset-2 hover:underline" href={url} download rel="noreferrer">Download</a>
                    )}
                </>
            )}
        </div>
    );
}

function artifactStatus(item: Artifact): string {
    if (item.error || item.status === "failed") return "Failed";
    if (item.hydrating) return "Preparing";
    const raw = typeof item.raw?.status === "string" ? item.raw.status : item.status;
    if (raw === "queued") return "Queued";
    if (raw === "processing" || raw === "running" || item.partial) return "Generating";
    if (raw === "completed") return "Ready";
    return item.url ? "Ready" : "Generating";
}

function progressLabel(value?: number): string | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const pct = value > 0 && value <= 1 ? value * 100 : value;
    return `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
}

function artifactTitle(kind: Artifact["artifactType"]): string {
    if (kind === "image") return "Image";
    if (kind === "audio") return "Audio";
    if (kind === "video") return "Video";
    if (kind === "embedding") return "Embedding";
    if (kind === "realtime") return "Realtime";
    if (kind === "file") return "File";
    return "Artifact";
}

function artifactMediaKind(kind: Artifact["artifactType"]): "image" | "audio" | "video" | null {
    return kind === "image" || kind === "audio" || kind === "video" ? kind : null;
}

function ActivityView({ activity, nodeId }: { activity?: ActivityState; nodeId?: string }) {
    const rows = activity ? buildActivityRows(activity, nodeId) : [];
    if (rows.length === 0) return null;
    const count = rows.reduce((sum, row) => sum + row.events, 0);
    return (
        <SharedStreamPocket
            title="Activity"
            metadata={count > 1 ? <span>{count} updates</span> : undefined}
            className="mb-2"
        >
            {rows.map((row) => <ActivityRowNode key={row.id} row={row} />)}
        </SharedStreamPocket>
    );
}

interface ActivityRow {
    id: string;
    class: StreamClass;
    title: string;
    summary?: string;
    metadata?: string;
    children: ActivityRow[];
    open?: boolean;
    events: number;
}

type StreamClass = "agent" | "tool" | "error" | "system";

function ActivityRowNode({ row }: { row: ActivityRow }) {
    return (
        <SharedStreamNode
            title={row.title}
            kind={row.class}
            summary={row.summary}
            metadata={row.metadata ? <span>{row.metadata}</span> : undefined}
            defaultOpen={row.open ?? false}
        >
            {row.children.map((child) => <ActivityRowNode key={child.id} row={child} />)}
        </SharedStreamNode>
    );
}

function buildActivityRows(activity: ActivityState, nodeId?: string): ActivityRow[] {
    const visited = new Set<string>();
    const roots = nodeId
        ? [activity.nodes[nodeId]].filter((node): node is ActivityNode => Boolean(node))
        : activity.roots.map((id) => activity.nodes[id]).filter((node): node is ActivityNode => Boolean(node));
    const rows: ActivityRow[] = [];
    for (const node of roots) {
        const row = projectActivityRow(node, activity, visited);
        if (row) rows.push(row);
    }
    if (!nodeId) {
        for (const node of Object.values(activity.nodes)) {
            if (visited.has(node.id) || !visibleActivityNode(node)) continue;
            const parent = node.parentId ? activity.nodes[node.parentId] : undefined;
            if (parent && visibleActivityNode(parent)) continue;
            const row = projectActivityRow(node, activity, visited);
            if (row) rows.push(row);
        }
    }
    return rows;
}

function StreamMeta({ values }: { values: Array<string | undefined> }) {
    const items = values.filter((value): value is string => Boolean(value));
    if (items.length === 0) return null;
    return (
        <>
            {items.map((item) => <span key={item}>{item}</span>)}
        </>
    );
}

function projectActivityRow(
    node: ActivityNode,
    activity: ActivityState,
    visited: Set<string>,
): ActivityRow | null {
    if (visited.has(node.id) || !visibleActivityNode(node)) return null;
    visited.add(node.id);
    const children = node.children
        .map((id) => activity.nodes[id])
        .filter((child): child is ActivityNode => Boolean(child))
        .map((child) => projectActivityRow(child, activity, visited))
        .filter((row): row is ActivityRow => Boolean(row));
    return {
        id: node.id,
        class: activityClass(node),
        title: activityTitle(node),
        summary: activitySummary(node),
        metadata: activityMeta(node),
        children,
        open: node.kind === "error" || node.status === "failed",
        events: node.events + children.reduce((sum, row) => sum + row.events, 0),
    };
}

function cleanLabel(value?: string): string | undefined {
    const cleaned = value
        ?.replace(/[_-]+/g, " ")
        .replace(/\b(runtime|debug|info|source)\b:?/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || undefined;
}

function activityClass(node: ActivityNode): StreamClass {
    if (node.kind === "error" || node.status === "failed") return "error";
    if (node.kind === "tool") return "tool";
    if (node.kind === "agent" || node.kind === "run" || node.kind === "thinking" || node.kind === "conclave" || node.kind === "route" || node.kind === "message") {
        return "agent";
    }
    return "system";
}

function activityTitle(node: ActivityNode): string {
    const name = cleanLabel(node.target?.name || node.name || node.target?.target);
    if (node.kind === "tool") {
        if (node.target?.kind === "model") return name ? `Model call: ${name}` : "Model call";
        return name ? `Tool call: ${name}` : "Tool call";
    }
    if (node.kind === "agent") return name ? `Agent: ${name}` : "Agent";
    if (node.kind === "thinking") return "Thinking";
    if (node.kind === "conclave") return "Conclave";
    if (node.kind === "route") return "Route";
    if (node.kind === "message") return "Message";
    if (node.kind === "error") return "Action failed";
    if (node.kind === "run") return node.status === "completed" ? "Run completed" : node.status === "cancelled" ? "Run stopped" : "Run";
    return "Activity";
}

function activitySummary(node: ActivityNode): string | undefined {
    const payload = node.payload ?? {};
    const summary = node.text
        || node.target?.summary
        || text(payload.message)
        || text(payload.summary)
        || text(payload.error)
        || text(payload.reason);
    return cleanLabel(summary);
}

function activityMeta(node: ActivityNode): string | undefined {
    const status = statusLabel(node.status);
    const updates = node.events > 1 ? `${node.events} updates` : undefined;
    return [status, updates].filter(Boolean).join(" · ") || undefined;
}

function statusLabel(status: ActivityNode["status"]): string | undefined {
    if (status === "pending") return "Pending";
    if (status === "running") return "Running";
    if (status === "completed") return "Completed";
    if (status === "failed") return "Failed";
    if (status === "cancelled") return "Stopped";
    return undefined;
}

function visibleActivityNode(node: ActivityNode): boolean {
    if (node.kind === "trace" || node.kind === "plan") return false;
    if (node.kind === "message" && !node.parentId) return false;
    return true;
}

function text(value: unknown): string | undefined {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
}

function DirectMedia({ message }: { message: Message }) {
    if (!message.imageUrl && !message.audioUrl && !message.videoUrl) return null;
    return (
        <div className="mb-2 space-y-2">
            {message.imageUrl && (
                <SharedStreamMedia kind="image" url={message.imageUrl} alt="Generated" partial={message.partialImage} />
            )}
            {message.audioUrl && <SharedStreamMedia kind="audio" url={message.audioUrl} />}
            {message.videoUrl && <SharedStreamMedia kind="video" url={message.videoUrl} />}
        </div>
    );
}

function PendingMedia({
    type,
    status,
}: {
    type: "image" | "audio" | "video";
    status?: string;
}) {
    const icon = type === "image"
        ? <ImageIcon className="w-8 h-8" />
        : type === "audio"
            ? <Music className="w-8 h-8" />
            : <Video className="w-8 h-8" />;
    const label = status || (type === "image" ? "Generating image" : type === "audio" ? "Generating audio" : "Generating video");
    return (
        <div className={cn(
            "relative overflow-hidden rounded-lg bg-zinc-900/80",
            type === "image" ? "aspect-square" : type === "video" ? "aspect-video" : "h-16",
            type === "audio" ? "w-full" : "w-64",
        )}>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/10 to-cyan-500/10 animate-pulse" />
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <div className="relative">
                    {icon}
                    <Loader2 className="w-4 h-4 absolute -bottom-1 -right-1 animate-spin text-cyan-400" />
                </div>
                <span className="text-xs font-medium">{label}...</span>
            </div>
        </div>
    );
}

class MessageBoundary extends React.Component<
    { children: React.ReactNode },
    { error: string | null }
> {
    state = { error: null };

    static getDerivedStateFromError(error: unknown) {
        return { error: error instanceof Error ? error.message : String(error) };
    }

    componentDidCatch(error: unknown) {
        console.error("[chat] message render failed:", error);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <SharedStreamPocket summary="A message renderer failed, but the page stayed mounted.">
                <SharedStreamNode title="Render error" kind="error" status="failed">
                    <SharedStreamNotice tone="error" title="Render error">
                        {this.state.error}
                    </SharedStreamNotice>
                </SharedStreamNode>
            </SharedStreamPocket>
        );
    }
}


// =============================================================================
// Chat Message Item
// =============================================================================

export interface MessageItemProps {
    message: Message;
    variant?: "agent" | "workflow" | "playground";
    showActions?: boolean;
    onCopy?: (content: string) => void;
    onRetry?: (content: string) => void;
    onDelete?: (id: string) => void;
    onPlanDecision?: (messageId: string, plan: Plan, decision: NonNullable<Plan["decision"]>, feedback?: string) => void;
    assistantAvatar?: React.ReactNode;
}

const messageVariantStyles = {
    agent: {
        user: "bg-fuchsia-500/20 text-fuchsia-100",
        userAvatar: "bg-fuchsia-500/20 text-fuchsia-400",
        assistant: "",
        assistantAvatar: "bg-cyan-500/20 text-cyan-400",
    },
    workflow: {
        user: "bg-cyan-500/20 text-cyan-100",
        userAvatar: "bg-cyan-500/20 text-cyan-400",
        assistant: "font-mono text-sm",
        assistantAvatar: "bg-fuchsia-500/20 text-fuchsia-400",
    },
    playground: {
        user: "cm-chat-message__bubble--user",
        userAvatar: "cm-chat-message__avatar-user",
        assistant: "",
        assistantAvatar: "bg-cyan-500/20 text-cyan-400",
    },
};

function MessageItemInner({
    message,
    variant = "agent",
    showActions = true,
    onCopy,
    onRetry,
    onDelete,
    onPlanDecision,
    assistantAvatar,
}: MessageItemProps) {
    const styles = messageVariantStyles[variant];
    const isUser = message.role === "user";
    const hasDirectMedia = Boolean(message.imageUrl || message.audioUrl || message.videoUrl);
    const hasStreamMedia = Boolean(message.artifacts?.some((item) => artifactMediaKind(item.artifactType)));
    const hasBlocks = !isUser && Boolean(message.blocks?.length);
    // Only treat assistant message as "loading" when generating non-text media.
    // Text "thinking" status is owned exclusively by the activityState bar (see line ~608),
    // so we don't render a second per-bubble spinner for plain text turns.
    const isLoadingMedia = !hasBlocks
        && !message.content
        && message.role === "assistant"
        && !hasDirectMedia
        && !hasStreamMedia
        && (message.type === "image" || message.type === "audio" || message.type === "video");
    const hasText = message.content.trim().length > 0;
    const shouldRenderText = message.type === "embedding"
        || isLoadingMedia
        || (isUser ? hasText || !hasDirectMedia : hasText && !hasBlocks);

    const getAssistantIcon = () => {
        if (assistantAvatar) return assistantAvatar;
        switch (message.type) {
            case "image": return <ImageIcon className="h-4 w-4" />;
            case "audio": return <Music className="h-4 w-4" />;
            case "video": return <Video className="h-4 w-4" />;
            default: return <Bot className="h-4 w-4" />;
        }
    };

    const renderBlock = (block: MessageBlock) => {
        if (block.type === "text") {
            if (!block.text) return null;
            return (
                <div key={block.id}>
                    <Suspense fallback={<p className="whitespace-pre-wrap text-sm">{block.text}</p>}>
                        <LazyMarkdownRenderer content={block.text} />
                    </Suspense>
                </div>
            );
        }
        if (block.type === "reasoning") {
            if (!block.text) return null;
            return (
                <SharedStreamNode
                    key={block.id}
                    title="Thinking"
                    defaultOpen={false}
                    className="cm-chat-thinking"
                >
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {block.text}
                    </pre>
                </SharedStreamNode>
            );
        }
        if (block.type === "plan") {
            if (!message.proposal || message.proposal.proposalId !== block.planId) return null;
            return (
                <PlanReview
                    key={block.id}
                    messageId={message.id}
                    plan={message.proposal}
                    onPlanDecision={onPlanDecision}
                />
            );
        }
        if (block.type === "activity") {
            return <ActivityView key={block.id} activity={message.activity} nodeId={block.nodeId} />;
        }
        if (block.type === "asset") {
            const artifact = message.artifacts?.find((item) => item.id === block.artifactId);
            return artifact ? <ArtifactBlock key={block.id} artifacts={[artifact]} /> : null;
        }
        return (
            <SharedStreamNotice
                key={block.id}
                tone={block.tone === "error" ? "error" : undefined}
                title={block.tone === "error" ? "Error" : "Notice"}
            >
                {block.text}
            </SharedStreamNotice>
        );
    };

    return (
        <div className={cn("cm-chat-message", isUser && "cm-chat-message--user")}>
            {!isUser && (
                <Avatar className="cm-chat-message__avatar">
                    <AvatarFallback className={cn("cm-chat-message__avatar-assistant", styles.assistantAvatar)}>{getAssistantIcon()}</AvatarFallback>
                </Avatar>
            )}

            <div className={cn("cm-chat-message__bubble group", isUser ? styles.user : styles.assistant, isUser && "cm-chat-message__bubble--user")}>
                {showActions && (
                    <div className="cm-chat-message__actions">
                        {onCopy && (
                            <button
                                onClick={() => onCopy(message.content)}
                                className="cm-chat__icon-action rounded-full p-1 transition-colors"
                                title="Copy message"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {isUser && onRetry && (
                            <button
                                onClick={() => onRetry(message.content)}
                                className="cm-chat__icon-action rounded-full p-1 transition-colors"
                                title="Retry this message"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={() => onDelete(message.id)}
                                className="cm-chat__icon-action rounded-full p-1 transition-colors hover:text-red-400"
                                title="Delete message"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {!hasBlocks && message.proposal && (
                    <PlanReview
                        messageId={message.id}
                        plan={message.proposal}
                        onPlanDecision={onPlanDecision}
                    />
                )}

                {hasBlocks && message.blocks?.map(renderBlock)}

                {!hasBlocks && shouldRenderText && message.type === "embedding" ? (
                    <EmbeddingBlock content={message.content || "..."} />
                ) : isLoadingMedia ? (
                    <PendingMedia
                        type={message.type as "image" | "audio" | "video"}
                        status={message.content || undefined}
                    />
                ) : !shouldRenderText ? null : isUser ? (
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                ) : (
                    <Suspense fallback={<p className="whitespace-pre-wrap text-sm">{message.content}</p>}>
                        <LazyMarkdownRenderer content={message.content} />
                    </Suspense>
                )}

                {hasDirectMedia && <DirectMedia message={message} />}

                {!hasBlocks && !!message.artifacts?.length && <ArtifactBlock artifacts={message.artifacts} />}
            </div>

            {isUser && (
                <Avatar className="cm-chat-message__avatar">
                    <AvatarFallback className={cn("cm-chat-message__avatar-user", styles.userAvatar)}><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
            )}
        </div>
    );
}

export const MessageItem = memo(function MessageItem(props: MessageItemProps) {
    return (
        <MessageBoundary>
            <MessageItemInner {...props} />
        </MessageBoundary>
    );
});

// =============================================================================
// Multimodal Canvas
// =============================================================================

export interface MultimodalCanvasProps {
    messages: Message[];
    inputValue: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    sending: boolean;
    variant?: "agent" | "workflow" | "playground";
    title?: string;
    icon?: React.ReactNode;
    emptyStateText?: string;
    emptyStateSubtext?: string;
    emptyStateIcon?: React.ReactNode;
    showHeader?: boolean;
    placeholder?: string;
    status?: "idle" | "paying" | "waiting" | "streaming";
    activityState?: ChatActivityState;
    error?: string | null;
    sessionActive?: boolean;
    onStartSession?: () => void;
    attachedFiles?: AttachedFile[];
    onFileSelect?: () => void;
    onRemoveFile?: (file: File) => void;
    fileInputRef?: React.RefObject<HTMLInputElement | null>;
    onFileInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isRecording?: boolean;
    recordingSupported?: boolean;
    onStartRecording?: () => void;
    onStopRecording?: () => void;
    showMessageActions?: boolean;
    onCopyMessage?: (content: string) => void;
    onRetryMessage?: (content: string) => void;
    onDeleteMessage?: (id: string) => void;
    onPlanDecision?: (messageId: string, plan: Plan, decision: NonNullable<Plan["decision"]>, feedback?: string) => void;
    onClearChat?: () => void;
    onKnowledgeUpload?: () => void;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
    messagesEndRef?: React.RefObject<HTMLDivElement | null>;
    height?: string;
}

const canvasVariantConfig = {
    agent: {
        border: "border-cyan-500/30",
        headerBg: "bg-cyan-500/5",
        headerText: "text-cyan-400",
        headerIcon: <Bot className="w-4 h-4 text-cyan-400" />,
        sendButton: "bg-cyan-500 hover:bg-cyan-600 text-black",
        accentColor: "cyan",
    },
    workflow: {
        border: "border-fuchsia-500/30",
        headerBg: "bg-fuchsia-500/5",
        headerText: "text-fuchsia-400",
        headerIcon: <Layers className="w-4 h-4 text-fuchsia-400" />,
        sendButton: "bg-fuchsia-500 hover:bg-fuchsia-600 text-white",
        accentColor: "fuchsia",
    },
    playground: {
        border: "border-cyan-500/20",
        headerBg: "bg-cyan-500/5",
        headerText: "text-cyan-400",
        headerIcon: <Bot className="w-4 h-4 text-cyan-400" />,
        sendButton: "bg-cyan-500 hover:bg-cyan-600 text-black",
        accentColor: "cyan",
    },
};

export function MultimodalCanvas({
    messages,
    inputValue,
    onInputChange,
    onSend,
    sending,
    variant = "agent",
    title,
    icon,
    emptyStateText = "Start a conversation",
    emptyStateSubtext,
    emptyStateIcon,
    showHeader = true,
    placeholder,
    status = "idle",
    activityState,
    error,
    attachedFiles = [],
    onFileSelect,
    onRemoveFile,
    fileInputRef,
    onFileInputChange,
    isRecording = false,
    recordingSupported = true,
    onStartRecording,
    onStopRecording,
    showMessageActions = true,
    onCopyMessage,
    onRetryMessage,
    onDeleteMessage,
    onPlanDecision,
    onClearChat,
    onKnowledgeUpload,
    scrollContainerRef,
    messagesEndRef,
    height = "h-64",
}: MultimodalCanvasProps) {
    const config = canvasVariantConfig[variant];
    const activeTools = activityState?.tools.slice(-3) || [];
    const shouldShowActivity = status !== "idle" || Boolean(activityState && activityState.phase !== "idle");
    const nearBottomRef = useRef(true);
    const [showJump, setShowJump] = useState(false);

    const handleSend = useCallback(() => {
        onSend();
    }, [onSend]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const canSend = !sending && (inputValue.trim() || attachedFiles.length > 0);
    const isUploading = attachedFiles.some(f => f.uploading);

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef?.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, [scrollContainerRef]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef?.current?.scrollIntoView({ behavior: "smooth" });
        nearBottomRef.current = true;
        setShowJump(false);
    }, [messagesEndRef]);

    useEffect(() => {
        const el = scrollContainerRef?.current;
        if (!el) return;
        const update = () => {
            const near = isNearBottom();
            nearBottomRef.current = near;
            if (near) setShowJump(false);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        return () => el.removeEventListener("scroll", update);
    }, [isNearBottom, scrollContainerRef]);

    useEffect(() => {
        if (nearBottomRef.current) {
            setShowJump(false);
            return;
        }
        if (messages.length > 0) {
            setShowJump(true);
        }
    }, [messages]);

    return (
        <div className={cn(
            "cm-chat",
            config.border,
            variant === "workflow" && "shadow-[0_0_30px_-5px_hsl(292_85%_55%/0.1)]",
            !showHeader && "cm-chat--bare",
            height
        )}>
            {showHeader && (
                <div className={cn("cm-chat__header", config.headerBg)}>
                    <div className="flex items-center gap-2">
                        {icon || config.headerIcon}
                        <span className={cn("text-sm font-mono", config.headerText)}>{title || "Chat"}</span>
                    </div>
                </div>
            )}

            <div ref={scrollContainerRef} className="cm-chat__body">
                {messages.length === 0 ? (
                    <div className="cm-chat__empty text-sm">
                        {emptyStateIcon || (variant === "workflow" ? (
                            <Play className={cn("w-12 h-12 mx-auto mb-4 opacity-50", config.headerText)} />
                        ) : (
                            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        ))}
                        <p>{emptyStateText}</p>
                        {emptyStateSubtext && <p className="text-xs mt-1 text-muted-foreground/70">{emptyStateSubtext}</p>}
                    </div>
                ) : (
                    <div className="cm-chat__messages">
                        {messages.map((msg) => (
                            <React.Fragment key={msg.id}>
                                <MessageItem
                                    message={msg}
                                    variant={variant}
                                    showActions={showMessageActions}
                                    onCopy={onCopyMessage}
                                    onRetry={onRetryMessage}
                                    onDelete={onDeleteMessage}
                                    onPlanDecision={onPlanDecision}
                                />
                            </React.Fragment>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
                {showJump ? (
                    <button type="button" className="cm-chat__jump" onClick={scrollToBottom}>
                        <ChevronDown className="h-3.5 w-3.5" />
                        New messages
                    </button>
                ) : null}
            </div>

            {shouldShowActivity && (
                <div className="cm-chat__activity">
                    <Loader2 className={cn("w-3 h-3", (status === "paying" || status === "waiting" || status === "streaming" || activityState?.phase === "thinking" || activityState?.phase === "tool" || activityState?.phase === "streaming") && "animate-spin", config.headerText)} />
                    <span className="text-muted-foreground">
                        {status === "paying" && <><span className="text-yellow-400">Paying...</span> Processing x402 payment</>}
                        {status === "waiting" && <><span className="text-orange-400">Waiting...</span> Awaiting response</>}
                        {status === "streaming" && activityState?.label ? <><span className={config.headerText}>Live...</span> {activityState.label}</> : null}
                        {status === "streaming" && !activityState?.label && <><span className={config.headerText}>Streaming...</span> Receiving response</>}
                        {status === "idle" && activityState?.phase === "streaming" && <><span className={config.headerText}>Live...</span> {activityState.label || "Receiving response"}</>}
                        {status === "idle" && activityState?.phase === "thinking" && <><span className={config.headerText}>Thinking...</span> {activityState.label || "Planning next step"}</>}
                        {status === "idle" && activityState?.phase === "tool" && <><span className={config.headerText}>Tool...</span> {activityState.label || "Using tools"}</>}
                        {status === "idle" && activityState?.phase === "error" && <><span className="text-red-400">Error...</span> {activityState.label || "Execution failed"}</>}
                    </span>
                    {activeTools.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-1">
                            {activeTools.map((tool) => (
                                <span
                                    key={tool.id}
                                    className={cn(
                                        "rounded-full border px-2 py-0.5 text-[10px] normal-case",
                                        tool.status === "running" && "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
                                        tool.status === "completed" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                                        tool.status === "error" && "border-red-500/40 bg-red-500/10 text-red-200",
                                    )}
                                    title={tool.summary || tool.displayName || tool.toolName}
                                >
                                    {tool.displayName || tool.toolName}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="cm-chat__composer">
                {error && <div className="text-xs text-red-400 mb-2 p-2 bg-red-500/10 rounded">{error}</div>}

                {attachedFiles.length > 0 && (
                    <div className="cm-chat__attachments">
                        {attachedFiles.map((file, index) => (
                            <div key={file.file.name + index} className="relative group">
                                <div className="cm-chat__attachment">
                                    {file.type === "image" ? (
                                        <img src={file.preview} alt="Preview" className="h-full w-full object-cover" />
                                    ) : file.type === "video" ? (
                                        file.preview ? <video src={file.preview} className="h-full w-full object-cover" muted /> : <Video className="h-6 w-6 text-pink-500" />
                                    ) : file.type === "pdf" ? (
                                        <FileText className="h-6 w-6 text-muted-foreground" />
                                    ) : file.type === "file" ? (
                                        <Paperclip className="h-6 w-6 text-muted-foreground" />
                                    ) : (
                                        <Music className="h-6 w-6 text-muted-foreground" />
                                    )}
                                    {file.uploading && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                {onRemoveFile && (
                                    <button
                                        onClick={() => onRemoveFile(file.file)}
                                        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-primary/20 bg-background/90 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="cm-chat__composer-row">
                    {onClearChat && (
                        <Button variant="ghost" size="icon" onClick={onClearChat} disabled={sending} className="cm-chat__icon-action shrink-0" title="Clear chat">
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    )}

                    {onFileSelect && (
                        <Button variant="ghost" size="icon" onClick={onFileSelect} disabled={sending || isRecording} className="cm-chat__icon-action shrink-0 cursor-pointer" title="Attach file">
                            <Paperclip className="w-4 h-4" />
                        </Button>
                    )}

                    {onStartRecording && onStopRecording && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={isRecording ? onStopRecording : onStartRecording}
                            disabled={sending || !recordingSupported}
                            className={cn("cm-chat__icon-action shrink-0 cursor-pointer transition-colors", isRecording && "text-red-500 hover:text-red-400 animate-pulse")}
                            title={isRecording ? "Stop recording" : "Record audio"}
                        >
                            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                    )}

                    {onKnowledgeUpload && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={onKnowledgeUpload} disabled={sending} className="cm-chat__icon-action shrink-0 cursor-pointer">
                                        <BookOpen className="w-4 h-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Upload Knowledge</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    <Textarea
                        placeholder={placeholder || (variant === "workflow" ? "Enter workflow parameters or instruction..." : "Type your message...")}
                        value={inputValue}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        className={cn("resize-none flex-1", variant === "workflow" && "font-mono text-sm")}
                        disabled={sending}
                    />

                    <Button onClick={handleSend} disabled={!canSend || isUploading} className={config.sendButton}>
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : variant === "workflow" ? <Play className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    </Button>
                </div>

                {fileInputRef && onFileInputChange && (
                    <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*,audio/*,video/*,application/pdf,.pdf,.txt,.md,.json,.csv,.html,.xml,text/*,application/json" className="hidden" />
                )}
            </div>
        </div>
    );
}
