import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import {
  MissionPocket,
  AgentNode,
  PlanTask,
  PlanActions,
  PlanVersionCarousel,
  StreamNode,
  StreamNotice,
  PlanReview as SharedPlanReview,
} from "@compose-market/theme";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ActivityState, ActivityNode, ActivityKind } from "@compose-market/sdk";
import type { Plan, Message } from "@/hooks/use-chat";

const LazyMarkdownRenderer = lazy(() =>
  import("@/lib/performance/markdown").then((module) => ({ default: module.MarkdownRenderer }))
);

export interface MissionControlProps {
  messageId: string;
  messages: Message[];
  activity?: ActivityState;
  plan?: Plan;
  nodeId?: string;
  onPlanDecision?: (
    messageId: string,
    plan: Plan,
    decision: "approved" | "rejected" | "changes_requested",
    feedback?: string
  ) => void;
  onStopRealtime?: () => void;
}

// Helper to shorten long IDs
function shortId(value?: string): string {
  if (!value) return "";
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

// Clean labels for display
function cleanLabel(value?: string): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b(runtime|debug|info|source)\b:?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Map ActivityNode status to theme status
function mapStatus(status: string): "pending" | "running" | "completed" | "failed" {
  if (status === "pending") return "pending";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "pending";
}

// Check if node is visible/relevant for swarm timeline
function isVisibleNode(node: ActivityNode): boolean {
  if (node.kind === "trace" || node.kind === "plan") return false;
  if (node.kind === "message" && !node.parentId) return false;
  return true;
}

export function MissionControl({
  messageId,
  messages,
  activity,
  plan: initialPlan,
  nodeId,
  onPlanDecision,
}: MissionControlProps) {
  // --- Plan Version Carousel State ---
  // Collect all proposals in the entire conversation history that belong to the same flow/proposalId
  const allProposals = messages
    .map((m) => m.proposal)
    .filter((p): p is Plan => Boolean(p))
    .filter(
      (p, idx, self) =>
        self.findIndex((x) => x.proposalId === p.proposalId && x.version === p.version) === idx
    )
    .sort((a, b) => a.version - b.version);

  const currentPlanIndex = allProposals.findIndex(
    (p) => p.version === (initialPlan?.version ?? 0)
  );

  const [activePlanIdx, setActivePlanIdx] = useState<number>(
    currentPlanIndex !== -1 ? currentPlanIndex : allProposals.length - 1
  );

  // Sync active plan index to the latest version when a new one is proposed
  const prevProposalsLength = useRef(allProposals.length);
  useEffect(() => {
    if (allProposals.length > prevProposalsLength.current) {
      setActivePlanIdx(allProposals.length - 1);
    }
    prevProposalsLength.current = allProposals.length;
  }, [allProposals.length]);

  // Sync active plan index to the current plan index whenever it changes from initial state
  useEffect(() => {
    if (currentPlanIndex !== -1) {
      setActivePlanIdx(currentPlanIndex);
    }
  }, [currentPlanIndex]);

  const activePlan = allProposals[activePlanIdx] ?? initialPlan;

  // Find the exact message ID that contains this active plan version to make decisions on the correct message
  const activePlanMessage = messages.find(
    (m) =>
      m.proposal?.proposalId === activePlan?.proposalId &&
      m.proposal?.version === activePlan?.version
  );
  const activeMessageId = activePlanMessage?.id ?? messageId;

  // Plan Feedback Textarea State
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  if (!activity && !activePlan) return null;

  // Render Plan Review Section
  const renderPlanSection = () => {
    if (!activePlan) return null;

    const decided =
      activePlan.decision ||
      activePlan.state === "approved" ||
      activePlan.state === "rejected" ||
      activePlan.state === "changes_requested";

    const canAct = Boolean(onPlanDecision) && !activePlan.pending && !decided;
    const versionMetadata = (
      <>
        <span>v{activePlan.version}</span>
        {activePlan.proposalId && <span>{shortId(activePlan.proposalId)}</span>}
        {activePlan.runId && <span>{shortId(activePlan.runId)}</span>}
      </>
    );

    // Simple parser for parsing markdown checkboxes [ ] or [x] into structured PlanTasks
    const parseTasksFromMarkdown = (md?: string): Array<{ title: string; status: "pending" | "running" | "completed" | "failed" }> => {
      if (!md) return [];
      const lines = md.split("\n");
      const tasks: Array<{ title: string; status: "pending" | "running" | "completed" | "failed" }> = [];
      
      for (const line of lines) {
        const match = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/);
        if (match) {
          const checked = match[1].toLowerCase() === "x";
          tasks.push({
            title: match[2].trim(),
            status: checked ? "completed" : "pending",
          });
        }
      }
      return tasks;
    };

    const tasks = parseTasksFromMarkdown(activePlan.markdown);

    return (
      <details className="cm-chat-plan mb-3 w-full" open={!decided}>
        <summary className="cm-stream-node__summary-row border border-accent/15 rounded-lg bg-card/10 hover:bg-card/25 cursor-pointer">
          <span className="cm-stream-node__marker bg-emerald-400 shadow-emerald-400" />
          <span className="cm-stream-node__title font-bold text-emerald-400">
            {decided ? `Plan Decided: ${activePlan.decision?.replace("_", " ") || activePlan.state}` : "Review Proposed Plan"}
          </span>
          <span className="cm-stream-node__metadata">{versionMetadata}</span>
        </summary>

        <div className="mt-2 w-full">
          <PlanVersionCarousel
            currentVersion={activePlan.version}
            totalVersions={allProposals.length}
            onPrev={() => setActivePlanIdx((prev) => Math.max(0, prev - 1))}
            onNext={() => setActivePlanIdx((prev) => Math.min(allProposals.length - 1, prev + 1))}
          />

          <MissionPocket
            title={`Proposed Work Plan (v${activePlan.version})`}
            summary={activePlan.error ? activePlan.error : activePlan.reason || "Review the step checklist below."}
            status={decided ? "completed" : "running"}
            metadata={versionMetadata}
          >
            {/* Task list section */}
            {tasks.length > 0 ? (
              <div className="flex flex-col gap-2 mt-2">
                {tasks.map((task, idx) => (
                  <PlanTask
                    key={idx}
                    index={idx}
                    title={task.title}
                    status={task.status}
                  />
                ))}
              </div>
            ) : (
              <div className="cm-plan-review__body text-xs text-muted-foreground mt-2 border-t border-border/10 pt-2">
                <Suspense fallback={<p className="whitespace-pre-wrap">{activePlan.markdown}</p>}>
                  <LazyMarkdownRenderer content={activePlan.markdown || "No checklist provided."} />
                </Suspense>
              </div>
            )}

            {/* Actions / HITL Gates */}
            {canAct && (
              <div className="mt-3 flex flex-col gap-2 border-t border-border/10 pt-3">
                {feedbackOpen && (
                  <Textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Provide specific guidelines or requests for this plan..."
                    className="min-h-16 w-full resize-none border-amber-500/30 bg-background/40 text-xs"
                  />
                )}
                <PlanActions
                  state={undefined}
                  hasFeedbackInput={feedbackOpen}
                  disabled={activePlan.pending}
                  onApprove={() => onPlanDecision?.(activeMessageId, activePlan, "approved")}
                  onReject={() => onPlanDecision?.(activeMessageId, activePlan, "rejected")}
                  onRequestChanges={() => {
                    if (!feedbackOpen) {
                      setFeedbackOpen(true);
                      return;
                    }
                    onPlanDecision?.(activeMessageId, activePlan, "changes_requested", feedbackText.trim() || undefined);
                  }}
                />
              </div>
            )}

            {decided && (
              <div className="mt-2 border-t border-border/10 pt-2 flex justify-end">
                <PlanActions state={activePlan.decision || activePlan.state} onApprove={() => {}} onReject={() => {}} onRequestChanges={() => {}} />
              </div>
            )}
          </MissionPocket>
        </div>
      </details>
    );
  };

  // Render Real-time Activity Timeline Swarm Section
  const renderActivitySection = () => {
    if (!activity) return null;

    // Get the tree nodes
    const roots = nodeId
      ? [activity.nodes[nodeId]].filter(Boolean)
      : activity.roots.map((id) => activity.nodes[id]).filter(Boolean);

    // Fractal Swarm Recursive Node Renderer (Maximum depth-3 Cap)
    const renderSwarmNode = (node: ActivityNode, depth: number = 0) => {
      if (!isVisibleNode(node)) return null;

      const childrenNodes = node.children
        .map((childId) => activity.nodes[childId])
        .filter(Boolean);

      const status = mapStatus(node.status);
      const isFailed = status === "failed";
      const isRunning = status === "running";
      const isAgent = node.kind === "agent" || node.kind === "thinking" || node.kind === "run";

      // Build titles & descriptors
      const nodeName = cleanLabel(node.target?.name || node.name || node.target?.target);
      let title = nodeName || node.text || "Execution Unit";
      if (node.kind === "thinking") title = "Analyzing & Thinking";
      else if (node.kind === "error") title = "Action Failed";

      const summaryText = node.text || node.target?.summary || (node.payload?.message as string) || (node.payload?.error as string);

      // Tool kind badges
      const toolType = node.target?.kind || (node.kind === "tool" ? "tool" : null);

      if (isAgent) {
        return (
          <AgentNode
            key={node.id}
            title={title}
            status={status}
            depth={Math.min(depth, 3)}
            modelName={node.target?.details?.model as string || node.target?.details?.provider as string}
            summary={summaryText && cleanLabel(summaryText)}
            defaultOpen={depth === 0 || isRunning || isFailed}
          >
            {childrenNodes.length > 0 && (
              <div className="cm-stream-node__children">
                {childrenNodes.map((child) => renderSwarmNode(child, depth + 1))}
              </div>
            )}
          </AgentNode>
        );
      }

      // Renders standard actions/tools in the swarm
      return (
        <StreamNode
          key={node.id}
          title={
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium truncate">{title}</span>
              {toolType && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/15 text-accent font-bold truncate">
                  {toolType}
                </span>
              )}
            </span>
          }
          kind={node.kind}
          status={status}
          summary={summaryText && cleanLabel(summaryText)}
          defaultOpen={isFailed || isRunning}
          depth={Math.min(depth, 3)}
        >
          {childrenNodes.length > 0 && (
            <div className="cm-stream-node__children">
              {childrenNodes.map((child) => renderSwarmNode(child, depth + 1))}
            </div>
          )}
        </StreamNode>
      );
    };

    const activeNodesCount = Object.values(activity.nodes).filter(n => n.status === "running").length;
    const completedNodesCount = Object.values(activity.nodes).filter(n => n.status === "completed").length;

    return (
      <MissionPocket
        title="Mission Control Room"
        summary={activeNodesCount > 0 ? `${activeNodesCount} sub-tasks executing...` : "Warm execution standby."}
        status={activeNodesCount > 0 ? "running" : "completed"}
        metadata={
          <>
            <span>{completedNodesCount} tasks completed</span>
            {roots[0]?.runId && <span>run {shortId(roots[0].runId)}</span>}
          </>
        }
      >
        <div className="flex flex-col gap-2 mt-1">
          {roots.map((root) => renderSwarmNode(root, 0))}
        </div>
      </MissionPocket>
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-full">
      {renderPlanSection()}
      {renderActivitySection()}
    </div>
  );
}
