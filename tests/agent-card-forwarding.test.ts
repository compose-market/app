import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("agent page forwards its loaded catalog card into the agent stream request", () => {
  const page = readFileSync(resolve(root, "src/pages/agent.tsx"), "utf8");
  const streamHook = readFileSync(resolve(root, "src/hooks/use-stream.ts"), "utf8");

  assert.match(page, /agentCard:\s*agent\.metadata/);
  assert.match(streamHook, /agentCard\?:/);
  assert.match(streamHook, /\.\.\.\(args\.agentCard\s*\?\s*\{\s*agentCard:\s*args\.agentCard\s*\}/);
});
