import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const playgroundSource = readFileSync(new URL("../src/pages/playground.tsx", import.meta.url), "utf8");
const agentSource = readFileSync(new URL("../src/pages/agent.tsx", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../src/pages/workflow.tsx", import.meta.url), "utf8");
const multimodalPath = new URL("../src/lib/multimodal.ts", import.meta.url);
const timelinePath = new URL("../src/components/tool-timeline.tsx", import.meta.url);
const blurPath = new URL("../src/components/blur.tsx", import.meta.url);
const streamSource = readFileSync(new URL("../src/hooks/use-stream.ts", import.meta.url), "utf8");
const chatHookSource = readFileSync(new URL("../src/hooks/use-chat.ts", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("../src/components/chat.tsx", import.meta.url), "utf8");
const outputSource = readFileSync(new URL("../src/components/output.tsx", import.meta.url), "utf8");
const receiptSource = readFileSync(new URL("../src/components/receipt-indicator.tsx", import.meta.url), "utf8");
const themeWorkflowsSource = readFileSync(new URL("../../packages/theme/src/workflows/index.tsx", import.meta.url), "utf8");

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("playground no longer uses the terminal multimodal runner or synthetic Running activity", () => {
  assert.equal(existsSync(multimodalPath), false);
  assert.equal(playgroundSource.includes("runInference"), false);
  assert.equal(playgroundSource.includes("inferenceMessage"), false);
  assert.equal(playgroundSource.includes("Running ${"), false);
});

test("playground uses one universal SDK response stream for native inference", () => {
  assert.match(playgroundSource, /streamer\.runResponses\(/);
  assert.match(playgroundSource, /stream:\s*true/);
  assert.doesNotMatch(playgroundSource, /modalities:/);
  assert.doesNotMatch(playgroundSource, /provider:\s*selectedModelInfo\.provider/);
  assert.doesNotMatch(playgroundSource, /sdk\.inference\.videos\.generate\(/);
  assert.doesNotMatch(playgroundSource, /streamer\.runVideo\(/);
  assert.doesNotMatch(playgroundSource, /sdk\.inference\.audio\.speech\(/);
  assert.doesNotMatch(playgroundSource, /sdk\.inference\.audio\.transcriptions\(/);
  assert.doesNotMatch(playgroundSource, /sdk\.inference\.embeddings\.create\(/);
  assert.doesNotMatch(playgroundSource, /responses\.create\(/);
  assert.doesNotMatch(playgroundSource, /images\.generate\(/);
  assert.doesNotMatch(playgroundSource, /images\.edit\(/);
  assert.doesNotMatch(playgroundSource, /waitUntilDone\(/);
});

test("web renders canonical stream trees instead of flat progress or timeline rows", () => {
  assert.equal(existsSync(timelinePath), false);
  assert.equal(existsSync(blurPath), false);
  assert.match(streamSource, /applyAssistantStreamEvent\(assistantId,\s*event\)/);
  assert.match(chatSource, /function StreamTreeView/);
  assert.match(chatSource, /function buildStreamRows/);
  assert.match(chatSource, /function StreamRowNode/);
  assert.match(chatSource, /StreamPocket/);
  assert.doesNotMatch(chatSource, /components\/blur|GenerationCanvas/);
  assert.doesNotMatch(streamSource, /traceMessage/);
  assert.doesNotMatch(streamSource, /appendAssistantProgressEvent/);
  assert.doesNotMatch(chatSource, /function StreamTreeNode/);
  assert.doesNotMatch(chatSource, /function ToolBadge/);
  assert.doesNotMatch(agentSource, /ToolTimeline/);
  assert.doesNotMatch(playgroundSource, /ToolTimeline/);
  assert.doesNotMatch(workflowSource, /ToolTimeline/);
});

test("web renders execution pockets only for agent and harness streams", () => {
  const streamViewSource = section(chatSource, "function StreamTreeView", "function DirectMedia");
  assert.match(streamViewSource, /streamKind\(stream\) === "model"/);
  assert.match(streamViewSource, /return null/);
  assert.match(streamViewSource, /Execution/);
  assert.match(streamViewSource, /Agent planned work/);
  assert.match(streamViewSource, /Conclave:/);
  assert.match(streamViewSource, /Agent used/);
  assert.match(streamViewSource, /Agent checked the catalog/);
  assert.match(streamViewSource, /streamClass/);
  assert.match(streamViewSource, /isDirectModel/);
  assert.match(streamViewSource, /node\.source === "agent"/);
  assert.match(streamViewSource, /node\.source === "harness"/);
  assert.doesNotMatch(streamViewSource, /title="Activity"/);
  assert.doesNotMatch(streamViewSource, /DirectModelDetails|Model stream|Model activity|Payment activity|Agent activity/);
  assert.doesNotMatch(streamViewSource, /Unattached events/);
  assert.doesNotMatch(streamViewSource, /Runtime trace/);
  assert.doesNotMatch(streamViewSource, /kind="debug"|status="info"/);
  assert.doesNotMatch(streamViewSource, /\{events\} events|events<\/span>/);
});

test("direct model stream frames stay on media and text surfaces, not stream pockets", () => {
  const artifactBlock = section(chatSource, "function ArtifactBlock", "function artifactTitle");
  const messageItem = section(chatSource, "function MessageItemInner", "export const MessageItem");
  const thinking = section(chatSource, "function Thinking", "type ViewNode");
  assert.match(artifactBlock, /partial/);
  assert.match(artifactBlock, /progress/);
  assert.match(artifactBlock, /Generating/);
  assert.match(artifactBlock, /SharedStreamMedia/);
  assert.match(messageItem, /hasStreamMedia/);
  assert.match(messageItem, /!hasStreamMedia/);
  assert.match(thinking, /streamKind\(stream\) !== "model"/);
  assert.match(thinking, /title="Thinking"/);
  assert.doesNotMatch(thinking, /kind=|status=/);
  assert.match(chatSource, /function thinkingText/);
  assert.match(themeWorkflowsSource, /cm-stream-media--partial/);
  assert.match(themeWorkflowsSource, /cm-stream-media--video/);
  assert.doesNotMatch(chatSource, /DirectModelDetails/);
});

test("stream payment rows and receipt badge render dollars instead of atomic units", () => {
  const streamSummarySource = section(chatSource, "function streamSummary", "function titleCase");
  assert.match(streamSummarySource, /paymentSummary/);
  assert.match(streamSummarySource, /formatDollars/);
  assert.match(streamSummarySource, /finalAmountWei/);
  assert.doesNotMatch(streamSummarySource, /return cleanLabel\(text\(node\.payload\?\.finalAmountWei\)/);
  assert.match(receiptSource, /formatReceiptUsd/);
  assert.match(receiptSource, /formatWeiUsd/);
  assert.match(receiptSource, /\$0\.000000/);
  assert.doesNotMatch(receiptSource, /0\.000000 USDC/);
});

test("debug stream events are not projected as thinking rows", () => {
  const dispatchBody = section(streamSource, "function dispatch", "function complete");
  assert.match(dispatchBody, /event\.kind === "debug"/);
  assert.doesNotMatch(dispatchBody, /phase:\s*"thinking"/);
  assert.doesNotMatch(dispatchBody, /Trace \$\{/);
});

test("artifact events still hydrate or render generated media", () => {
  const artifactBlock = section(chatSource, "function ArtifactBlock", "function artifactTitle");
  const mediaBranch = section(artifactBlock, "if (mediaKind)", "if (item.artifactType === \"embedding\")");
  assert.match(streamSource, /function artifactFromEvent/);
  assert.match(streamSource, /function hydrateArtifact/);
  assert.doesNotMatch(streamSource, /applyArtifact/);
  assert.doesNotMatch(streamSource, /imageUrl:\s*outputItemUrl/);
  assert.doesNotMatch(streamSource, /audioUrl:\s*outputItemUrl/);
  assert.doesNotMatch(streamSource, /videoUrl:\s*outputItemUrl/);
  assert.match(chatSource, /function ArtifactBlock/);
  assert.doesNotMatch(mediaBranch, /SharedStreamNode/);
  assert.doesNotMatch(artifactBlock, /SharedStreamArtifact/);
  assert.match(artifactBlock, /SharedStreamMedia/);
  assert.match(artifactBlock, /Download/);
  assert.match(artifactBlock, /function MediaPreview|MediaPreview/);
  assert.match(artifactBlock, /onOpen=\{\(\) => setExpanded\(item\)\}/);
  assert.match(outputSource, /SharedStreamMedia kind="image"/);
  assert.doesNotMatch(outputSource, /<audio|<video|<img/);
});

test("raw response media renders as one in-page previewable surface", () => {
  const artifactBlock = section(chatSource, "function ArtifactBlock", "function EmbeddingArtifact");
  const mediaPreview = section(chatSource, "function MediaPreview", "function EmbeddingArtifact");
  const mediaSource = themeWorkflowsSource.slice(themeWorkflowsSource.indexOf("export function StreamMedia"));
  assert.match(artifactBlock, /mediaKind === "audio" \? "w-full min-w-0"/);
  assert.match(artifactBlock, /mediaKind === "video" \? "w-full max-w-2xl"/);
  assert.match(mediaPreview, /DialogContent/);
  assert.match(mediaPreview, /Download/);
  assert.match(mediaSource, /<audio[^>]*controls[^>]*preload="metadata"[^>]*src=\{url\}/s);
  assert.match(mediaSource, /<video[^>]*controls[^>]*preload="metadata"[^>]*src=\{url\}/s);
  assert.doesNotMatch(mediaSource, /<source src=\{url\}/);
});

test("embedding and feature-extraction artifacts render as foldable vectors", () => {
  const artifactBlock = section(chatSource, "function ArtifactBlock", "function artifactTitle");
  const embeddingBlock = section(chatSource, "function EmbeddingBlock", "function shortId");
  const embeddingArtifact = section(chatSource, "function EmbeddingArtifact", "function embeddingShape");
  assert.match(artifactBlock, /item\.artifactType === "embedding"/);
  assert.match(chatSource, /function EmbeddingArtifact/);
  assert.match(chatSource, /function embeddingVector/);
  assert.match(chatSource, /Copy raw embedding/);
  assert.match(chatSource, /dimensions/);
  assert.match(streamSource, /embedding:\s*embedding\(payload\.embedding/);
  assert.match(streamSource, /view\.embedding/);
  assert.doesNotMatch(embeddingBlock, /kind="artifact"|status="completed"/);
  assert.doesNotMatch(embeddingArtifact, /kind="artifact"|status=\{item\.status\}/);
  assert.doesNotMatch(embeddingArtifact, /<StreamMeta values=\{\[status/);
});

test("plan review stays foldable and generated artifacts stay ordered on the message", () => {
  const planReview = section(chatSource, "function PlanReview", "function planSummary");
  assert.match(planReview, /<details className="cm-chat-plan mb-2" open=\{!decided\}>/);
  assert.doesNotMatch(planReview, /SharedStreamNode/);
  assert.match(planReview, /SharedPlanReview/);
  const messageBody = section(chatSource, "{message.proposal && (", "{hasDirectMedia && <DirectMedia message={message} />}");
  assert.ok(messageBody.indexOf("PlanReview") < messageBody.indexOf("StreamTreeView"));
  assert.ok(messageBody.indexOf("StreamTreeView") < messageBody.indexOf("LazyMarkdownRenderer"));
  assert.match(chatSource, /\{!!message\.artifacts\?\.length && <ArtifactBlock artifacts=\{message\.artifacts\} \/>\}/);
});

test("theme stream nodes keep raw kind and status out of visible chrome by default", () => {
  const nodeSource = section(themeWorkflowsSource, "export function StreamNode", "export interface StreamArtifactProps");
  assert.match(nodeSource, /data-kind=\{kind\}/);
  assert.match(nodeSource, /data-status=\{status\}/);
  assert.match(themeWorkflowsSource, /badges\?: React\.ReactNode/);
  assert.match(nodeSource, /\{badges\}/);
  assert.doesNotMatch(nodeSource, /cm-stream-node__kind/);
  assert.doesNotMatch(nodeSource, /cm-stream-node__status/);
});

test("chat scroll preserves manual inspection during live updates", () => {
  assert.match(chatHookSource, /stickToBottomRef\.current = true/);
  assert.match(chatHookSource, /addEventListener\("wheel", markUserScroll/);
  assert.match(chatHookSource, /addEventListener\("touchmove", markUserScroll/);
  assert.match(chatSource, /New messages/);
});

test("stream and page failures fold as canonical error nodes", () => {
  assert.match(chatHookSource, /failAssistant/);
  assert.match(streamSource, /chat\.failAssistant\(assistantId,\s*message\)/);
  assert.match(chatSource, /class MessageBoundary/);
  assert.match(chatSource, /kind="error"/);
  assert.doesNotMatch(streamSource, /content:\s*`Error:/);
  assert.doesNotMatch(agentSource, /content:\s*`Error:/);
  assert.doesNotMatch(playgroundSource, /content:\s*`Error:/);
  assert.doesNotMatch(workflowSource, /content:\s*`Error:/);
});

test("quality stream events stay separate from receipt and budget state", () => {
  const dispatchBody = section(streamSource, "function dispatch", "function complete");
  assert.doesNotMatch(dispatchBody, /onReceipt|onBudget/);
  assert.match(streamSource, /sdk\.events\.on\("receipt"/);
  assert.match(streamSource, /sdk\.events\.on\("budget"/);
});
