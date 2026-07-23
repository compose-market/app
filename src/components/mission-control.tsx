/**
 * Mission Control Side Panel
 *
 * Renders the full fractal activity tree + plan review in the side panel.
 * Uses rich server-side display data (target.name, target.details, target.summary)
 * to show human-readable information — never leaks internal JSON/protocol details.
 *
 * Hierarchy:
 *   Main Agent (depth 0)
 *   └── Tool / Memory (depth 1)
 *       ├── Tool actions (depth 2)
 *       └── Sub-Agent (depth 1, fractal — same structure recursively)
 *           └── ...up to depth 3
 */
import React, { useState, useEffect, useRef, Suspense, lazy, useMemo } from "react";
import {
    MissionControlPanel,
    MissionPocket,
    AgentNode,
    StreamNode,
    PlanGate,
    PlanTask,
    PlanActions,
    PlanVersionCarousel,
} from "@compose-market/theme";
import type { ActivityState, ActivityNode } from "@compose-market/sdk";
import type { Plan, Message } from "@/hooks/use-chat";

const LazyMarkdownRenderer = lazy(() =>
    import("@/lib/performance/markdown").then((module) => ({ default: module.MarkdownRenderer }))
);

export interface MissionControlSidePanelProps {
    activity?: ActivityState;
    plan?: Plan;
    messages: Message[];
    phase?: "idle" | "thinking" | "tool" | "streaming" | "error";
    phaseLabel?: string;
    agentLabel?: string;
    onPlanDecision?: (
        messageId: string,
        plan: Plan,
        decision: "approved" | "rejected" | "changes_requested",
        feedback?: string,
    ) => void;
    className?: string;
}

function shortId(value?: string): string {
    if (!value) return "";
    return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function cleanLabel(value?: string): string {
    if (!value) return "";
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\b(runtime|debug|info|source)\b:?/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function text(value: unknown): string | undefined {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
}

function truncate(value: string, max = 80): string {
    return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;
}

const GENERIC_WORDS = new Set(["model", "connector", "agent", "tool", "conclave", "search", "harness", "route", "swarm"]);

function isGenericWord(value?: string): boolean {
    return !value || GENERIC_WORDS.has(value.toLowerCase());
}

function isVisibleNode(node: ActivityNode): boolean {
    if (node.kind === "trace" || node.kind === "plan") return false;
    if (node.kind === "message" && !node.parentId) return false;
    return true;
}

function statusLabel(status: ActivityNode["status"]): string | undefined {
    if (status === "pending") return "Pending";
    if (status === "running") return "Running";
    if (status === "completed") return "Completed";
    if (status === "failed") return "Failed";
    if (status === "cancelled") return "Stopped";
    return undefined;
}

// =============================================================================
// Rich Title — digs into target.details for actual names, never shows generic kind words
// =============================================================================

function nodeTitle(node: ActivityNode): string {
    const target = node.target;
    const details = target?.details;
    const raw = node.raw as Record<string, unknown> | undefined;

    if (node.kind === "tool") {
        const kind = target?.kind;
        if (kind === "model") {
            const name = firstNonGeneric(target?.name, text(details?.model), text(details?.provider), node.name);
            return name ?? "Model call";
        }
        if (kind === "connector") {
            const name = firstNonGeneric(target?.name, text(details?.connector), node.name);
            return name ?? "Connector call";
        }
        if (kind === "agent") {
            const name = firstNonGeneric(target?.name, node.name);
            return name ?? "Agent search";
        }
        if (kind === "search") {
            const name = firstNonGeneric(target?.name, node.name);
            return name ?? "Search";
        }
        if (kind === "conclave") {
            return target?.target ?? "Conclave";
        }
        return firstNonGeneric(target?.name, node.name) ?? "Tool call";
    }

    if (node.kind === "agent") {
        const subId = text(details?.subId);
        const role = subId ? subId.split(":").pop() : undefined;
        const name = firstNonGeneric(role, target?.name, node.name, text(raw?.agentName));
        return name ?? "Agent";
    }

    if (node.kind === "thinking") return "Thinking";
    if (node.kind === "conclave") return "Conclave";
    if (node.kind === "route") return "Route";
    if (node.kind === "message") return "Message";
    if (node.kind === "error") return "Action failed";
    if (node.kind === "run") {
        if (node.status === "completed") return "Run completed";
        if (node.status === "cancelled") return "Run stopped";
        return "Run";
    }
    return firstNonGeneric(target?.name, node.name) ?? "Activity";
}

function firstNonGeneric(...values: Array<string | undefined>): string | undefined {
    for (const v of values) {
        if (v && !isGenericWord(v)) return cleanLabel(v);
    }
    return undefined;
}

// =============================================================================
// Summary — what the node is actually doing (human-readable)
// =============================================================================

function nodeSummary(node: ActivityNode): string | undefined {
    const payload = node.payload ?? {};
    const target = node.target;

    if (node.kind === "message") {
        return node.text ? truncate(cleanLabel(node.text) || "", 120) : undefined;
    }

    if (node.kind === "conclave") {
        const action = text(payload.action) ?? text(target?.details?.action);
        const key = text(payload.key) ?? target?.target;
        if (action && key) return `${action} ${key}`;
        return target?.summary ? cleanLabel(target.summary) : undefined;
    }

    const summary = node.text
        || target?.summary
        || text(payload.message)
        || text(payload.summary)
        || text(payload.error)
        || text(payload.reason);

    if (summary) return truncate(cleanLabel(summary) || "", 120);

    if (node.kind === "tool" && node.status === "running" && payload.input) {
        const inputStr = typeof payload.input === "string"
            ? payload.input
            : JSON.stringify(payload.input).slice(0, 120);
        return truncate(inputStr, 120);
    }

    if (node.kind === "tool" && node.status === "completed" && payload.output) {
        const outputStr = typeof payload.output === "string"
            ? payload.output
            : text(payload.message) ?? undefined;
        if (outputStr) return truncate(outputStr, 120);
    }

    return undefined;
}

// =============================================================================
// Summary Preview — shown in collapsed <summary> row (one-liner)
// =============================================================================

function nodeSummaryPreview(node: ActivityNode): string | undefined {
    const target = node.target;

    if (node.kind === "conclave") {
        const action = text(target?.details?.action) ?? text(node.payload?.action);
        const key = target?.target ?? text(node.payload?.key);
        if (action && key) return `${action} ${key}`;
        return target?.summary ? cleanLabel(target.summary) : undefined;
    }

    if (node.kind === "message" && node.text) {
        return truncate(cleanLabel(node.text) || "", 80);
    }

    if (target?.summary && !isGenericWord(target.summary)) {
        return truncate(cleanLabel(target.summary) || "", 80);
    }

    const payload = node.payload ?? {};
    if (node.kind === "tool" && payload.input) {
        const input = payload.input;
        const inputStr = typeof input === "string"
            ? input
            : text((input as Record<string, unknown>)?.query) ?? text((input as Record<string, unknown>)?.prompt) ?? JSON.stringify(input).slice(0, 80);
        return truncate(inputStr, 80);
    }

    return undefined;
}

// =============================================================================
// Metadata
// =============================================================================

function nodeMeta(node: ActivityNode): string | undefined {
    const status = statusLabel(node.status);
    const updates = node.events > 1 ? `${node.events} events` : undefined;
    return [status, updates].filter(Boolean).join(" \u00B7 ") || undefined;
}

// =============================================================================
// Grouping — collapse same-kind root nodes into a single collapsible parent
// =============================================================================

interface GroupedNode {
    kind: string;
    title: string;
    status: string;
    nodes: ActivityNode[];
}

function groupRoots(roots: ActivityNode[]): Array<ActivityNode | GroupedNode> {
    const buckets = new Map<string, ActivityNode[]>();
    const orderedKinds: string[] = [];

    for (const root of roots) {
        const key = root.kind;
        if (!buckets.has(key)) {
            buckets.set(key, []);
            orderedKinds.push(key);
        }
        buckets.get(key)!.push(root);
    }

    const result: Array<ActivityNode | GroupedNode> = [];
    for (const kind of orderedKinds) {
        const nodes = buckets.get(kind)!;
        if (nodes.length <= 1) {
            result.push(nodes[0]);
        } else {
            const hasRunning = nodes.some((n) => n.status === "running");
            const hasFailed = nodes.some((n) => n.status === "failed");
            result.push({
                kind,
                title: `${kindLabel(kind)} \u2014 ${nodes.length} actions`,
                status: hasRunning ? "running" : hasFailed ? "failed" : "completed",
                nodes,
            });
        }
    }
    return result;
}

function kindLabel(kind: string): string {
    const labels: Record<string, string> = {
        conclave: "Conclave",
        tool: "Tool calls",
        thinking: "Thinking",
        route: "Routes",
        run: "Runs",
        agent: "Agents",
        message: "Messages",
        error: "Errors",
    };
    return labels[kind] ?? kind;
}

// =============================================================================
// SwarmNode — recursive fractal renderer
// =============================================================================

interface SwarmNodeProps {
    node: ActivityNode;
    activity: ActivityState;
    depth: number;
    visited: Set<string>;
}

function SwarmNode({ node, activity, depth, visited }: SwarmNodeProps) {
    if (!isVisibleNode(node) || visited.has(node.id)) return null;
    visited.add(node.id);

    const children = node.children
        .map((id) => activity.nodes[id])
        .filter((child): child is ActivityNode => Boolean(child));

    const isAgent = node.kind === "agent" || node.kind === "thinking" || node.kind === "run";
    const isFailed = node.status === "failed";
    const isRunning = node.status === "running";
    const targetKind = node.target?.kind;
    const d = Math.min(depth, 3);
    const title = nodeTitle(node);
    const summary = nodeSummary(node);
    const preview = nodeSummaryPreview(node);
    const meta = nodeMeta(node);
    const details = node.target?.details;
    const modelName = text(details?.model) || text(details?.provider);

    const childElements = children.length > 0 ? (
        <>
            {children.map((child) => (
                <SwarmNode
                    key={child.id}
                    node={child}
                    activity={activity}
                    depth={depth + 1}
                    visited={visited}
                />
            ))}
        </>
    ) : null;

    if (isAgent) {
        return (
            <AgentNode
                title={title}
                status={node.status}
                depth={d}
                targetKind={targetKind}
                modelName={modelName}
                summary={summary}
                summaryPreview={preview}
                metadata={meta}
                defaultOpen={d === 0 || isRunning || isFailed}
            >
                {childElements}
            </AgentNode>
        );
    }

    return (
        <StreamNode
            title={title}
            kind={node.kind}
            status={node.status}
            depth={d}
            targetKind={targetKind}
            summary={summary}
            summaryPreview={preview}
            metadata={meta}
            defaultOpen={isFailed || (isRunning && d <= 1)}
        >
            {childElements}
        </StreamNode>
    );
}

// =============================================================================
// GroupedSwarmNode — renders a grouped parent with children inside
// =============================================================================

function GroupedSwarmNode({ group, activity }: { group: GroupedNode; activity: ActivityState }) {
    const visited = new Set<string>();
    const hasRunning = group.status === "running";
    const hasFailed = group.status === "failed";

    return (
        <StreamNode
            title={group.title}
            kind={group.kind}
            status={group.status}
            depth={0}
            defaultOpen={hasRunning || hasFailed}
        >
            {group.nodes.map((node) => (
                <SwarmNode
                    key={node.id}
                    node={node}
                    activity={activity}
                    depth={1}
                    visited={visited}
                />
            ))}
        </StreamNode>
    );
}

// =============================================================================
// Plan parsing
// =============================================================================

function parseTasksFromMarkdown(md?: string): Array<{ title: string; status: "pending" | "completed" }> {
    if (!md) return [];
    const tasks: Array<{ title: string; status: "pending" | "completed" }> = [];
    for (const line of md.split("\n")) {
        const match = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/);
        if (match) {
            tasks.push({
                title: match[2].trim(),
                status: match[1].toLowerCase() === "x" ? "completed" : "pending",
            });
        }
    }
    return tasks;
}

function planTasks(plan: Plan): Array<{ title: string; description?: string; status: "pending" | "running" | "completed" | "failed" }> {
    if (plan.tasks?.length) {
        return plan.tasks.map((task) => ({
            title: task.title,
            ...(task.error ? { description: task.error } : task.owner ? { description: task.owner } : {}),
            status: task.status === "done"
                ? "completed"
                : task.status === "doing"
                    ? "running"
                    : task.status === "failed" || task.status === "blocked"
                        ? "failed"
                        : "pending",
        }));
    }
    return parseTasksFromMarkdown(plan.markdown);
}

// =============================================================================
// Main Component
// =============================================================================

export function MissionControlSidePanel({
    activity,
    plan: initialPlan,
    messages,
    phase = "idle",
    phaseLabel,
    agentLabel,
    onPlanDecision,
    className,
}: MissionControlSidePanelProps) {
    const allProposals = useMemo(() => {
        return messages
            .map((m) => m.proposal)
            .filter((p): p is Plan => Boolean(p))
            .filter((p, idx, self) => self.findIndex((x) => x.proposalId === p.proposalId && x.version === p.version) === idx)
            .sort((a, b) => a.version - b.version);
    }, [messages]);

    const currentPlanIndex = allProposals.findIndex(
        (p) => p.version === (initialPlan?.version ?? 0),
    );

    const [activePlanIdx, setActivePlanIdx] = useState<number>(
        currentPlanIndex !== -1 ? currentPlanIndex : Math.max(0, allProposals.length - 1),
    );

    const prevProposalsLength = useRef(allProposals.length);
    useEffect(() => {
        if (allProposals.length > prevProposalsLength.current) {
            setActivePlanIdx(allProposals.length - 1);
        }
        prevProposalsLength.current = allProposals.length;
    }, [allProposals.length]);

    useEffect(() => {
        if (currentPlanIndex !== -1) {
            setActivePlanIdx(currentPlanIndex);
        }
    }, [currentPlanIndex]);

    const activePlan = allProposals[activePlanIdx] ?? initialPlan;
    const activePlanMessage = messages.find(
        (m) => m.proposal?.proposalId === activePlan?.proposalId && m.proposal?.version === activePlan?.version,
    );
    const activeMessageId = activePlanMessage?.id ?? "";

    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");

    if (!activity && !activePlan) return null;

    const visited = new Set<string>();
    const roots = activity
        ? activity.roots.map((id) => activity.nodes[id]).filter((n): n is ActivityNode => Boolean(n))
        : [];
    const orphanRoots = activity
        ? Object.values(activity.nodes).filter((n) => {
            if (visited.has(n.id) || !isVisibleNode(n)) return false;
            const parent = n.parentId ? activity.nodes[n.parentId] : undefined;
            return !parent || !isVisibleNode(parent);
        })
        : [];
    const allRoots = [...roots, ...orphanRoots];
    const groupedRoots = groupRoots(allRoots);

    const activeNodesCount = activity ? Object.values(activity.nodes).filter((n) => n.status === "running").length : 0;
    const completedNodesCount = activity ? Object.values(activity.nodes).filter((n) => n.status === "completed").length : 0;
    const totalNodes = activity ? Object.keys(activity.nodes).filter((id) => {
        const n = activity.nodes[id];
        return n && isVisibleNode(n);
    }).length : 0;

    const panelStatus = activeNodesCount > 0 ? "running" : completedNodesCount > 0 ? "completed" : phase === "error" ? "failed" : "running";
    const panelSummary = activeNodesCount > 0
        ? `${activeNodesCount} active task${activeNodesCount > 1 ? "s" : ""} executing`
        : completedNodesCount > 0
            ? `${completedNodesCount} task${completedNodesCount > 1 ? "s" : ""} completed`
            : phaseLabel || "Standing by";
    const panelMetadata = (
        <>
            {totalNodes > 0 && <span>{totalNodes} nodes</span>}
            {roots[0]?.runId && <span>run {shortId(roots[0].runId)}</span>}
        </>
    );

    const renderPlanSection = () => {
        if (!activePlan) return null;

        const decided = activePlan.decision || activePlan.state === "approved" || activePlan.state === "rejected" || activePlan.state === "changes_requested";
        const canAct = Boolean(onPlanDecision) && !activePlan.pending && !decided;
        const tasks = planTasks(activePlan);
        const versionMetadata = (
            <>
                <span>v{activePlan.version}</span>
                {activePlan.proposalId && <span>{shortId(activePlan.proposalId)}</span>}
                {activePlan.runId && <span>{shortId(activePlan.runId)}</span>}
            </>
        );

        return (
            <PlanGate
                title={decided ? "Plan Decided" : "Plan Review"}
                state={activePlan.decision || activePlan.state}
                subtitle={activePlan.error ? activePlan.error : decided ? undefined : "Review the proposed work plan and choose an out-of-band decision."}
                metadata={versionMetadata}
                actions={
                    canAct ? (
                        <PlanActions
                            onApprove={() => onPlanDecision?.(activeMessageId, activePlan, "approved")}
                            onReject={() => onPlanDecision?.(activeMessageId, activePlan, "rejected", feedbackText.trim() || undefined)}
                            onRequestChanges={() => {
                                if (!feedbackOpen) {
                                    setFeedbackOpen(true);
                                    return;
                                }
                                onPlanDecision?.(activeMessageId, activePlan, "changes_requested", feedbackText.trim() || undefined);
                            }}
                            disabled={activePlan.pending}
                            hasFeedbackInput={feedbackOpen}
                        />
                    ) : decided ? (
                        <PlanActions state={activePlan.decision || activePlan.state} />
                    ) : undefined
                }
            >
                {allProposals.length > 1 && (
                    <PlanVersionCarousel
                        currentVersion={activePlan.version}
                        totalVersions={allProposals.length}
                        onPrev={() => setActivePlanIdx((prev) => Math.max(0, prev - 1))}
                        onNext={() => setActivePlanIdx((prev) => Math.min(allProposals.length - 1, prev + 1))}
                    />
                )}
                {feedbackOpen && canAct && (
                    <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Provide specific guidelines or requests for this plan..."
                        className="cm-plan-feedback-input"
                        rows={3}
                    />
                )}
                {tasks.length > 0 ? (
                    <div className="cm-plan-task-list">
                        {tasks.map((task, idx) => (
                            <PlanTask
                                key={idx}
                                index={idx}
                                 title={task.title}
                                 description={task.description}
                                status={task.status}
                            />
                        ))}
                    </div>
                ) : (
                    <Suspense fallback={<p className="cm-plan-gate__fallback">{activePlan.markdown || "No checklist provided."}</p>}>
                        <LazyMarkdownRenderer content={activePlan.markdown || "No checklist provided."} />
                    </Suspense>
                )}
            </PlanGate>
        );
    };

    const renderActivitySection = () => {
        if (!activity || groupedRoots.length === 0) return null;

        return (
            <MissionPocket
                title="Agent Swarm Timeline"
                summary={activeNodesCount > 0 ? `${activeNodesCount} sub-tasks executing` : "Execution standby"}
                status={activeNodesCount > 0 ? "running" : "completed"}
                metadata={
                    <>
                        <span>{completedNodesCount} done</span>
                    </>
                }
            >
                {groupedRoots.map((item) => {
                    if ("nodes" in item) {
                        return <GroupedSwarmNode key={item.kind} group={item} activity={activity} />;
                    }
                    return (
                        <SwarmNode
                            key={item.id}
                            node={item}
                            activity={activity}
                            depth={0}
                            visited={visited}
                        />
                    );
                })}
            </MissionPocket>
        );
    };

    return (
        <MissionControlPanel
            title="Mission Control"
            status={panelStatus}
            summary={panelSummary}
            metadata={panelMetadata}
            className={className}
        >
            {renderPlanSection()}
            {renderActivitySection()}
        </MissionControlPanel>
    );
}
