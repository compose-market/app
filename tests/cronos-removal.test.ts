import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const WEB_ROOT = "/Users/jabyl/Downloads/compose-market/web";

test("frontend cronos implementation file is removed", () => {
  assert.equal(existsSync(`${WEB_ROOT}/src/lib/cronos/aa.ts`), false);
});

test("frontend package no longer depends on the cronos facilitator client", () => {
  const packageJson = JSON.parse(readFileSync(`${WEB_ROOT}/package.json`, "utf8")) as {
    dependencies?: Record<string, string>;
  };

  assert.equal(Boolean(packageJson.dependencies?.["@crypto.com/facilitator-client"]), false);
});

test("frontend dispenser helpers no longer reference cronos chain ids or labels", () => {
  const dispenserHookSource = readFileSync(`${WEB_ROOT}/src/hooks/use-dispenser.ts`, "utf8");
  const dispenserComponentSource = readFileSync(`${WEB_ROOT}/src/components/dispenser.tsx`, "utf8");

  assert.equal(/cronos/i.test(dispenserHookSource), false);
  assert.equal(/\b338\b/u.test(dispenserHookSource), false);
  assert.equal(/cronos/i.test(dispenserComponentSource), false);
  assert.equal(/\b338\b/u.test(dispenserComponentSource), false);
});
