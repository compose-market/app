import assert from "node:assert/strict";
import test from "node:test";

import { parseUsdcBudgetInput } from "../../packages/theme/dist/session/index.js";

test("parseUsdcBudgetInput converts arbitrary USDC input into 6-decimal minor units", () => {
  assert.equal(parseUsdcBudgetInput("1"), 1_000_000n);
  assert.equal(parseUsdcBudgetInput("12.345678"), 12_345_678n);
  assert.equal(parseUsdcBudgetInput("0.000001"), 1n);
  assert.equal(parseUsdcBudgetInput(" 2,500.5 "), 2_500_500_000n);
});

test("parseUsdcBudgetInput rejects empty, negative, and over-precision values", () => {
  assert.equal(parseUsdcBudgetInput(""), null);
  assert.equal(parseUsdcBudgetInput("0"), null);
  assert.equal(parseUsdcBudgetInput("-1"), null);
  assert.equal(parseUsdcBudgetInput("1.0000001"), null);
  assert.equal(parseUsdcBudgetInput("abc"), null);
});
