import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("market agents tab uses the paged Agents API without legacy agent scans", () => {
  const source = readFileSync(resolve(root, "src/pages/market.tsx"), "utf8");
  const agentsStart = source.indexOf("function AgentsTab");
  assert.ok(agentsStart > 0, "AgentsTab must exist");
  const agents = source.slice(agentsStart);

  assert.doesNotMatch(source, /@\/hooks\/catalog/);
  assert.doesNotMatch(agents, /useOnchainAgents/);
  assert.doesNotMatch(agents, /sdk\.directory\.agents\.list/);
  assert.match(agents, /useInfiniteQuery/);
  assert.match(source, /\/agents\?/);
  assert.match(agents, /cursor/);
  assert.match(agents, /q:/);
  assert.match(source, /params\.set\("sort", input\.sort\)/);
  assert.match(agents, /sort: q \? undefined : sort/);
  assert.doesNotMatch(agents, /sortedAgents/);
  assert.doesNotMatch(agents, /\.sort\(/);
});
