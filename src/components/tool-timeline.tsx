"use client";

/**
 * ToolTimeline — horizontal strip of tool-call lifecycle events.
 * Subscribes to sdk.events.toolCallStart + toolCallEnd; fires uniformly
 * across chat / responses / agent / workflow stream sources.
 */

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Cpu, GitBranch, Layers, Loader2, Plug, Route, Search, Wrench, XCircle } from "lucide-react";
import { sdk } from "@/lib/sdk";

type ToolStatus = "running" | "success" | "failed";

interface ToolTimelineEntry {
    id: string;
    toolName: string;
    displayName?: string;
    targetKind?: string;
    target?: string;
    source: "chat" | "responses" | "agent" | "workflow";
    summary?: string;
    status: ToolStatus;
    error?: string;
    startedAt: number;
}

const MAX_VISIBLE = 8;

export function ToolTimeline({ className }: { className?: string }) {
    const [entries, setEntries] = useState<ToolTimelineEntry[]>([]);
    const [open, setOpen] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const upsert = (id: string, mutate: (e: ToolTimelineEntry) => ToolTimelineEntry) => {
            setEntries((prev) => {
                const idx = prev.findIndex((e) => e.id === id);
                if (idx === -1) return prev;
                const next = prev.slice();
                next[idx] = mutate(prev[idx]);
                return next;
            });
        };

        const unsubStart = sdk.events.on("toolCallStart", (event) => {
            setEntries((prev) => {
                if (prev.some((e) => e.id === event.toolCallId)) return prev;
                const meta = event as typeof event & {
                    displayName?: string;
                    targetKind?: string;
                    target?: string;
                    display?: { kind?: string; target?: string };
                };
                const entry: ToolTimelineEntry = {
                    id: event.toolCallId,
                    toolName: event.toolName,
                    displayName: meta.displayName,
                    targetKind: meta.targetKind ?? meta.display?.kind,
                    target: meta.target ?? meta.display?.target,
                    source: event.source,
                    summary: event.summary,
                    status: "running",
                    startedAt: Date.now(),
                };
                return [entry, ...prev].slice(0, MAX_VISIBLE);
            });
        });

        const unsubEnd = sdk.events.on("toolCallEnd", (event) => {
            const meta = event as typeof event & {
                displayName?: string;
                targetKind?: string;
                target?: string;
                display?: { kind?: string; target?: string };
            };
            upsert(event.toolCallId, (existing) => ({
                ...existing,
                status: event.failed ? "failed" : "success",
                error: event.error,
                displayName: meta.displayName || existing.displayName,
                targetKind: meta.targetKind ?? meta.display?.kind ?? existing.targetKind,
                target: meta.target ?? meta.display?.target ?? existing.target,
                summary: event.summary ?? existing.summary,
            }));
        });

        return () => {
            unsubStart();
            unsubEnd();
        };
    }, []);

    if (entries.length === 0) return null;

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
            {entries.map((entry) => {
                const icon = entry.status === "running"
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : entry.status === "failed"
                        ? <XCircle className="h-3 w-3 text-red-400" />
                        : <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
                const borderClass = entry.status === "running"
                    ? "border-cyan-500/30 bg-cyan-500/5 text-cyan-300"
                    : entry.status === "failed"
                        ? "border-red-500/30 bg-red-500/5 text-red-300"
                        : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300";
                const title = entry.error
                    ? `${entry.displayName || entry.toolName} (${entry.source}) — ${entry.error}`
                    : entry.summary
                        ? `${entry.displayName || entry.toolName} (${entry.source}) — ${entry.summary}`
                        : `${entry.displayName || entry.toolName} (${entry.source})`;
                const expanded = open[entry.id] === true;
                const label = entry.targetKind || entry.displayName || entry.toolName;
                const target = entry.target || entry.displayName;
                const badgeIcon = kindIcon(entry.targetKind);
                return (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => setOpen((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                        className={`inline-flex min-h-6 max-w-full items-center gap-1 rounded-sm border px-1.5 py-0.5 text-left text-[10px] font-mono ${borderClass}`}
                        title={title}
                        aria-expanded={expanded}
                    >
                        {badgeIcon}
                        {icon}
                        <span className="truncate">{label}</span>
                        {expanded && (
                            <span className="ml-1 inline-flex min-w-0 max-w-[16rem] items-center gap-1 border-l border-current/20 pl-1.5 opacity-80">
                                {target && <span className="truncate">{target}</span>}
                                <span className="shrink-0 opacity-60">raw:{entry.toolName}</span>
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function kindIcon(kind?: string) {
    const className = "h-2.5 w-2.5 shrink-0 opacity-70";
    switch (kind) {
        case "model": return <Cpu className={className} aria-hidden="true" />;
        case "connector": return <Plug className={className} aria-hidden="true" />;
        case "agent": return <Bot className={className} aria-hidden="true" />;
        case "search": return <Search className={className} aria-hidden="true" />;
        case "harness": return <GitBranch className={className} aria-hidden="true" />;
        case "conclave": return <Layers className={className} aria-hidden="true" />;
        case "route": return <Route className={className} aria-hidden="true" />;
        default: return <Wrench className={className} aria-hidden="true" />;
    }
}
