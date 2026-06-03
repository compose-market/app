import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const playgroundSource = readFileSync(new URL("../src/pages/playground.tsx", import.meta.url), "utf8");
const multimodalPath = new URL("../src/lib/multimodal.ts", import.meta.url);
const streamSource = readFileSync(new URL("../src/hooks/use-stream.ts", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("../src/components/chat.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../src/components/tool-timeline.tsx", import.meta.url), "utf8");

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

test("inference stream helpers wait for real events before setting activity", () => {
  const chat = section(streamSource, "const runChat", "const runResponses");
  const responses = section(streamSource, "const runResponses", "return { runAgent");

  assert.doesNotMatch(chat, /setActivityPhase\("thinking",\s*"Thinking\.\.\."\)/);
  assert.doesNotMatch(responses, /setActivityPhase\("thinking",\s*"Thinking\.\.\."\)/);
});

test("response stream adapter renders all typed output item classes", () => {
  assert.match(streamSource, /response\.output_item\.completed/);
  assert.match(streamSource, /output_image/);
  assert.match(streamSource, /output_audio/);
  assert.match(streamSource, /output_video/);
  assert.match(streamSource, /output_embedding/);
  assert.match(streamSource, /response\.output_video\.status/);
});

test("agent stream adapter renders child-agent progress breadcrumbs", () => {
  assert.match(streamSource, /case "child"/);
  assert.match(streamSource, /childMessage\(event\)/);
  assert.match(streamSource, /appendAssistantProgressEvent\(assistantId,\s*\{\s*id: crypto\.randomUUID\(\),\s*phase: "agent"/s);
  assert.match(streamSource, /event\.event === "tool-start"/);
  assert.match(streamSource, /event\.event === "done"/);
});

test("agent stream adapter renders safe trace breadcrumbs", () => {
  assert.match(streamSource, /case "trace"/);
  assert.match(streamSource, /traceMessage\(event\)/);
  assert.match(streamSource, /appendAssistantProgressEvent\(assistantId,\s*\{\s*id: crypto\.randomUUID\(\),\s*phase: "thinking"/s);
  assert.match(streamSource, /Trace \$\{label\}\$\{stage\}\$\{action\}\$\{message\}/);
});

test("tool badges collapse to target kind and expand to raw target metadata", () => {
  assert.match(streamSource, /targetKind = meta\.targetKind \?\? meta\.display\?\.kind/);
  assert.match(streamSource, /target = meta\.target \?\? meta\.display\?\.target/);
  assert.match(chatSource, /function ToolBadge/);
  assert.match(chatSource, /const label = tool\.targetKind \|\| tool\.displayName \|\| tool\.name/);
  assert.match(chatSource, /aria-expanded=\{open\}/);
  assert.match(chatSource, /raw:\{tool\.name\}/);
  assert.match(timelineSource, /targetKind: meta\.targetKind \?\? meta\.display\?\.kind/);
  assert.match(timelineSource, /raw:\{entry\.toolName\}/);
});

test("quality stream events stay separate from receipt and budget state", () => {
  const childCase = section(streamSource, 'case "child":', 'case "trace":');
  const traceCase = section(streamSource, 'case "trace":', 'case "error":');
  assert.doesNotMatch(childCase, /onReceipt|onBudget|receipt|budget/);
  assert.doesNotMatch(traceCase, /onReceipt|onBudget|receipt|budget/);
  assert.match(streamSource, /sdk\.events\.on\("receipt"/);
  assert.match(streamSource, /sdk\.events\.on\("budget"/);
});
