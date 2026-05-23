import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseJsonResponse } from "../src/lib/multimodal";

const playgroundSource = readFileSync(new URL("../src/pages/playground.tsx", import.meta.url), "utf8");
const multimodalSource = readFileSync(new URL("../src/lib/multimodal.ts", import.meta.url), "utf8");
const streamSource = readFileSync(new URL("../src/hooks/use-stream.ts", import.meta.url), "utf8");

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("playground no longer uses the terminal multimodal runner or synthetic Running activity", () => {
  assert.equal(playgroundSource.includes("runInference"), false);
  assert.equal(playgroundSource.includes("inferenceMessage"), false);
  assert.equal(multimodalSource.includes("runInference"), false);
  assert.equal(multimodalSource.includes("inferenceMessage"), false);
  assert.equal(playgroundSource.includes("Running ${"), false);
});

test("playground restores explicit SDK streaming surfaces for native inference", () => {
  assert.match(playgroundSource, /streamer\.runResponses\(/);
  assert.match(playgroundSource, /stream:\s*true/);
  assert.match(playgroundSource, /sdk\.inference\.videos\.generate\(/);
  assert.match(playgroundSource, /streamer\.runVideo\(/);
  assert.match(playgroundSource, /sdk\.inference\.audio\.speech\(/);
  assert.match(playgroundSource, /sdk\.inference\.audio\.transcriptions\(/);
  assert.match(playgroundSource, /type:\s*outputType/);
  assert.doesNotMatch(playgroundSource, /responses\.create\(/);
  assert.doesNotMatch(playgroundSource, /images\.generate\(/);
  assert.doesNotMatch(playgroundSource, /images\.edit\(/);
  assert.doesNotMatch(playgroundSource, /waitUntilDone\(/);
});

test("inference stream helpers wait for real events before setting activity", () => {
  const chat = section(streamSource, "const runChat", "const runResponses");
  const responses = section(streamSource, "const runResponses", "const runVideo");
  const video = section(streamSource, "const runVideo", "return { runAgent");

  assert.doesNotMatch(chat, /setActivityPhase\("thinking",\s*"Thinking\.\.\."\)/);
  assert.doesNotMatch(responses, /setActivityPhase\("thinking",\s*"Thinking\.\.\."\)/);
  assert.doesNotMatch(video, /Video queued/);
});

test("video generation job responses are parsed as pollable video state", () => {
  const parsed = parseJsonResponse({
    id: "vid_test_123",
    object: "video.generation",
    status: "queued",
  });

  assert.equal(parsed.type, "video");
  assert.equal(parsed.success, true);
  assert.equal(parsed.jobId, "vid_test_123");
  assert.equal(parsed.polling, true);
  assert.match(parsed.content ?? "", /queued/);
});
