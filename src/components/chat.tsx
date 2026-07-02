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
import React, { Suspense, lazy, useState, memo, useCallback, useEffect, useRef, useMemo } from "react";
import {
    StreamMedia as SharedStreamMedia,
    StreamNode as SharedStreamNode,
    StreamNotice as SharedStreamNotice,
    PlanGate as SharedPlanGate,
    PlanActions as SharedPlanActions,
    ActivityChip as SharedActivityChip,
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
    Square,
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
import {
    SlashCommandPopover,
    SelectedSlashCommandBadges,
    clearSlashCommandToken,
    isSelectableSlashCommandName,
    nextSelectedSlashCommands,
    slashCommandMatches,
    withoutSelectedSlashCommand,
} from "@/components/slash-commands";
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

// Inline Plan Gate — compact decision bar in chat.
// Shows title + state + action buttons only. No markdown body, no task list.
// Full plan content (markdown, tasks, version carousel) lives in side-panel Mission Control.

function planSummary(plan: Plan): string {
    const state = plan.decision || plan.state;
    if (state === "approved") return `Plan approved \u00B7 v${plan.version}`;
    if (state === "rejected") return `Plan rejected \u00B7 v${plan.version}`;
    if (state === "changes_requested") return `Plan changes requested \u00B7 v${plan.version}`;
    return `Plan proposed \u00B7 v${plan.version}`;
}

function InlinePlanGate({
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

    const actions = canAct ? (
        <SharedPlanActions
            onApprove={() => onPlanDecision?.(messageId, plan, "approved")}
            onReject={() => onPlanDecision?.(messageId, plan, "rejected", feedback.trim() || undefined)}
            onRequestChanges={() => {
                if (!feedbackOpen) {
                    setFeedbackOpen(true);
                    return;
                }
                onPlanDecision?.(messageId, plan, "changes_requested", feedback.trim());
            }}
            disabled={plan.pending}
            hasFeedbackInput={feedbackOpen}
        />
    ) : decided ? (
        <SharedPlanActions state={plan.decision || plan.state} />
    ) : undefined;

    return (
        <SharedPlanGate
            title={planSummary(plan)}
            state={plan.decision || plan.state}
            subtitle={plan.error ? plan.error : decided ? undefined : "Review full plan in Mission Control \u2192"}
            metadata={
                <>
                    <span>v{plan.version}</span>
                    {plan.proposalId && <span>{shortId(plan.proposalId)}</span>}
                </>
            }
            actions={actions}
            defaultOpen={!decided}
        >
            {feedbackOpen && canAct && (
                <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback for the revised plan"
                    className="cm-plan-feedback-input"
                    rows={3}
                />
            )}
        </SharedPlanGate>
    );
}

// Inline Activity Chip — compact summary that points to the side panel

function InlineActivityChip({
    activity,
    onFocusMissionControl,
}: {
    activity?: import("@compose-market/sdk").ActivityState;
    onFocusMissionControl?: () => void;
}) {
    if (!activity) return null;
    const nodes = Object.values(activity.nodes);
    const visible = nodes.filter((n) => {
        if (n.kind === "trace" || n.kind === "plan") return false;
        if (n.kind === "message" && !n.parentId) return false;
        return true;
    });
    if (visible.length === 0) return null;

    const running = visible.filter((n) => n.status === "running").length;
    const completed = visible.filter((n) => n.status === "completed").length;
    const failed = visible.filter((n) => n.status === "failed").length;
    const tools = visible.filter((n) => n.kind === "tool").length;
    const agents = visible.filter((n) => n.kind === "agent").length;

    const status = running > 0 ? "running" : failed > 0 ? "failed" : completed > 0 ? "completed" : "pending";
    const parts: string[] = [];
    if (tools > 0) parts.push(`${tools} tool${tools > 1 ? "s" : ""}`);
    if (agents > 0) parts.push(`${agents} agent${agents > 1 ? "s" : ""}`);
    if (running > 0) parts.push(`${running} running`);
    else if (completed > 0) parts.push(`${completed} done`);
    const summary = parts.join(" \u00B7 ") || `${visible.length} activities`;

    return (
        <SharedActivityChip
            status={status}
            summary={summary}
            metadata={`${visible.length} updates`}
            onClick={onFocusMissionControl}
        />
    );
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

function text(value: unknown): string | undefined {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
}

function ArtifactBlock({
    artifacts,
    onStopRealtime,
}: {
    artifacts: Artifact[];
    onStopRealtime?: () => void;
}) {
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
                    const live = mediaKind === "audio" && item.partial === true && Boolean(liveAudioBase64(item));
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
                            ) : live ? (
                                <LiveAudio item={item} onStopRealtime={onStopRealtime} />
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

// ActivityView was removed and refactored into the new MissionControl component

function numeric(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function liveAudioBase64(item: Artifact): string | undefined {
    const raw = item.raw ?? {};
    return text(raw.base64) ?? text(raw.data) ?? text(raw.delta) ?? text(raw.audio);
}

function audioSampleRate(item: Artifact): number {
    const raw = item.raw ?? {};
    return numeric(raw.sampleRate) ?? numeric(raw.sample_rate) ?? numeric(raw.sampleRateHz) ?? 48000;
}

function audioChannels(item: Artifact): number {
    const raw = item.raw ?? {};
    return numeric(raw.channels) ?? 2;
}

function pcm16(bytes: Uint8Array, channels: number, sampleRate: number, context: AudioContext): AudioBuffer | null {
    const width = 2 * channels;
    const frames = Math.floor(bytes.byteLength / width);
    if (frames <= 0) return null;
    const buffer = context.createBuffer(channels, frames, sampleRate);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let frame = 0; frame < frames; frame += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const offset = frame * width + channel * 2;
            buffer.getChannelData(channel)[frame] = view.getInt16(offset, true) / 32768;
        }
    }
    return buffer;
}

function b64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function LiveAudio({
    item,
    onStopRealtime,
}: {
    item: Artifact;
    onStopRealtime?: () => void;
}) {
    const contextRef = useRef<AudioContext | null>(null);
    const nextRef = useRef(0);
    const seenRef = useRef<Set<string>>(new Set());
    const base64 = liveAudioBase64(item);
    const sequence = numeric(item.raw?.sequenceIndex) ?? numeric(item.raw?.sequence_index) ?? item.outputIndex ?? 0;

    useEffect(() => {
        if (!base64 || typeof window === "undefined") return;
        const key = `${sequence}:${base64.length}:${base64.slice(0, 24)}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        if (seenRef.current.size > 256) {
            const [first] = seenRef.current;
            if (first) seenRef.current.delete(first);
        }

        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const context = contextRef.current ?? new Ctor({ latencyHint: "interactive" });
        contextRef.current = context;
        const sampleRate = audioSampleRate(item);
        const channels = audioChannels(item);
        const buffer = pcm16(b64(base64), channels, sampleRate, context);
        if (!buffer) return;

        void context.resume().catch(() => undefined);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const start = Math.max(context.currentTime + 0.01, nextRef.current || context.currentTime + 0.01);
        source.start(start);
        nextRef.current = start + buffer.duration;
    }, [base64, item, sequence]);

    useEffect(() => () => {
        void contextRef.current?.close().catch(() => undefined);
        contextRef.current = null;
    }, []);

    return (
        <div className="relative">
            <PendingMedia type="audio" status="Live audio" />
            {onStopRealtime && (
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-7 w-7 rounded-full border border-red-500/30 bg-black/50 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                    onClick={() => onStopRealtime()}
                    title="Stop realtime stream"
                    aria-label="Stop realtime stream"
                >
                    <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
            )}
        </div>
    );
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
        ? <ImageIcon />
        : type === "audio"
            ? <Music />
            : <Video />;
    const label = status || (type === "image" ? "Generating image" : type === "audio" ? "Generating audio" : "Generating video");
    return (
        <div className="cm-chat-pending-media" data-kind={type}>
            <div className="cm-chat-pending-media__wash" />
            <div className="cm-chat-pending-media__shine" />
            <div className="cm-chat-pending-media__content">
                <div className="cm-chat-pending-media__icon">
                    {icon}
                    <Loader2 className="cm-chat-pending-media__spinner" />
                </div>
                <span className="cm-chat-pending-media__label">{label}...</span>
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
            <div className="cm-chat__error-boundary">
                <SharedStreamNode title="Render error" kind="error" status="failed">
                    <SharedStreamNotice tone="error" title="Render error">
                        {this.state.error}
                    </SharedStreamNotice>
                </SharedStreamNode>
            </div>
        );
    }
}


// =============================================================================
// Chat Message Item
// =============================================================================

export interface MessageItemProps {
    message: Message;
    messages: Message[];
    variant?: "agent" | "workflow" | "playground";
    showActions?: boolean;
    onCopy?: (content: string) => void;
    onRetry?: (content: string) => void;
    onDelete?: (id: string) => void;
    onPlanDecision?: (messageId: string, plan: Plan, decision: NonNullable<Plan["decision"]>, feedback?: string) => void;
    onStopRealtime?: () => void;
    onFocusMissionControl?: () => void;
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
    messages,
    variant = "agent",
    showActions = true,
    onCopy,
    onRetry,
    onDelete,
    onPlanDecision,
    onStopRealtime,
    onFocusMissionControl,
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
                <InlinePlanGate
                    key={block.id}
                    messageId={message.id}
                    plan={message.proposal}
                    onPlanDecision={onPlanDecision}
                />
            );
        }
        if (block.type === "activity") {
            return <InlineActivityChip key={block.id} activity={message.activity} onFocusMissionControl={onFocusMissionControl} />;
        }
        if (block.type === "asset") {
            const artifact = message.artifacts?.find((item) => item.id === block.artifactId);
            return artifact ? <ArtifactBlock key={block.id} artifacts={[artifact]} onStopRealtime={onStopRealtime} /> : null;
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
                    <InlinePlanGate
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

                {!hasBlocks && !!message.artifacts?.length && <ArtifactBlock artifacts={message.artifacts} onStopRealtime={onStopRealtime} />}
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
    onSend: (selectedSlashCommands?: string[]) => boolean | void | Promise<boolean | void>;
    sending: boolean;
    continuous?: boolean;
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
    realtimeActive?: boolean;
    showMessageActions?: boolean;
    onCopyMessage?: (content: string) => void;
    onRetryMessage?: (content: string) => void;
    onDeleteMessage?: (id: string) => void;
    onPlanDecision?: (messageId: string, plan: Plan, decision: NonNullable<Plan["decision"]>, feedback?: string) => void;
    onClearChat?: () => void;
    onKnowledgeUpload?: () => void;
    onFocusMissionControl?: () => void;
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
    continuous = false,
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
    onFocusMissionControl,
    scrollContainerRef,
    messagesEndRef,
    height = "",
}: MultimodalCanvasProps) {
    const config = canvasVariantConfig[variant];
    const activeTools = activityState?.tools.filter((t) => t.status === "running") || [];
    const shouldShowActivity = status !== "idle" || Boolean(activityState && activityState.phase !== "idle");
    const nearBottomRef = useRef(true);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [showJump, setShowJump] = useState(false);
    const [selectedSlashCommands, setSelectedSlashCommands] = useState<string[]>([]);
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const slashMatches = useMemo(
        () => variant === "workflow" ? [] : slashCommandMatches(inputValue),
        [inputValue, variant],
    );

    useEffect(() => {
        setSlashSelectedIndex(0);
    }, [inputValue]);

    const canSend = (!sending || continuous) && (inputValue.trim() || attachedFiles.length > 0);
    const isUploading = attachedFiles.some(f => f.uploading);

    const focusTextarea = useCallback(() => {
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

    const handleSend = useCallback(async () => {
        if (!canSend || isUploading) return;
        const result = await onSend(selectedSlashCommands.length > 0 ? selectedSlashCommands : undefined);
        if (result !== false) {
            setSelectedSlashCommands([]);
        }
    }, [canSend, isUploading, onSend, selectedSlashCommands]);

    const selectSlashCommand = useCallback((cmd: { name: string }) => {
        if (isSelectableSlashCommandName(cmd.name)) {
            setSelectedSlashCommands((prev) => nextSelectedSlashCommands(prev, cmd.name));
            onInputChange(clearSlashCommandToken(inputValue));
            focusTextarea();
            return;
        }

        const nextInput = `/${cmd.name} `;
        onInputChange(nextInput);
        focusTextarea();
    }, [focusTextarea, inputValue, onInputChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (slashMatches.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                setSlashSelectedIndex((prev) => (prev + 1) % slashMatches.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                setSlashSelectedIndex((prev) => (prev - 1 + slashMatches.length) % slashMatches.length);
                return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                selectSlashCommand(slashMatches[slashSelectedIndex] ?? slashMatches[0]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onInputChange(inputValue.replace(/^\//, ""));
                return;
            }
        }

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    }, [handleSend, inputValue, onInputChange, selectSlashCommand, slashMatches, slashSelectedIndex]);

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
                                    messages={messages}
                                    variant={variant}
                                    showActions={showMessageActions}
                                    onCopy={onCopyMessage}
                                    onRetry={onRetryMessage}
                                    onDelete={onDeleteMessage}
                                    onPlanDecision={onPlanDecision}
                                    onStopRealtime={onStopRecording}
                                    onFocusMissionControl={onFocusMissionControl}
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
                                        "cm-chat__tool-chip",
                                        tool.status === "running" && "cm-chat__tool-chip--running",
                                        tool.status === "completed" && "cm-chat__tool-chip--completed",
                                        tool.status === "error" && "cm-chat__tool-chip--error",
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

                <SelectedSlashCommandBadges
                    selected={selectedSlashCommands}
                    onRemove={(name) => setSelectedSlashCommands((prev) => withoutSelectedSlashCommand(prev, name))}
                />

                <div className="cm-chat__composer-row">
                    {onClearChat && (
                        <Button variant="ghost" size="icon" onClick={onClearChat} disabled={sending && !continuous} className="cm-chat__icon-action shrink-0" title="Clear chat">
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    )}

                    {onFileSelect && (
                        <Button variant="ghost" size="icon" onClick={onFileSelect} disabled={(sending && !continuous) || isRecording} className="cm-chat__icon-action shrink-0 cursor-pointer" title="Attach file">
                            <Paperclip className="w-4 h-4" />
                        </Button>
                    )}

                    {onStartRecording && onStopRecording && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={isRecording ? onStopRecording : onStartRecording}
                            disabled={(sending && !continuous) || !recordingSupported}
                            className={cn("cm-chat__icon-action shrink-0 cursor-pointer transition-colors", isRecording && "text-red-500 hover:text-red-400 animate-pulse")}
                            title={isRecording ? "Stop microphone" : "Start microphone"}
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

                    <div className="relative flex-1">
                        {variant !== "workflow" && (
                            <SlashCommandPopover
                                input={inputValue}
                                selectedIndex={slashSelectedIndex}
                                onSelect={selectSlashCommand}
                                onHighlight={setSlashSelectedIndex}
                            />
                        )}
                        <Textarea
                            ref={textareaRef}
                            placeholder={placeholder || (variant === "workflow" ? "Enter workflow parameters or instruction..." : "Type your message or use / for commands...")}
                            value={inputValue}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            className={cn("resize-none w-full", variant === "workflow" && "font-mono text-sm")}
                            disabled={sending && !continuous}
                        />
                    </div>

                    <Button onClick={() => void handleSend()} disabled={!canSend || isUploading} className={cn("cm-chat__send", config.sendButton)}>
                        {sending && !continuous ? <Loader2 className="w-4 h-4 animate-spin" /> : variant === "workflow" ? <Play className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    </Button>
                </div>

                {fileInputRef && onFileInputChange && (
                    <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*,audio/*,video/*,application/pdf,.pdf,.txt,.md,.json,.csv,.html,.xml,text/*,application/json" className="hidden" />
                )}
            </div>
        </div>
    );
}
