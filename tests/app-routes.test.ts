import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStandalonePathname,
  isStandaloneAppRoute,
} from "../src/lib/utils";

test("normalizePathname strips query, hash, and trailing slashes", () => {
  assert.equal(normalizeStandalonePathname("/compose/?foo=bar#section"), "/compose");
  assert.equal(normalizeStandalonePathname("/"), "/");
  assert.equal(normalizeStandalonePathname("/connect-local///"), "/connect-local");
});

test("standalone routes stay outside the shared app layout", () => {
  assert.equal(isStandaloneAppRoute("/connect-local"), true);
  assert.equal(isStandaloneAppRoute("/connect-local/oauth/callback?code=1"), true);
  assert.equal(isStandaloneAppRoute("/install-local"), true);
  assert.equal(isStandaloneAppRoute("/compose"), false);
});
