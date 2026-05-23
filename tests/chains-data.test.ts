import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_CONFIG,
  CHAIN_IDS,
  SUPPORTED_CHAIN_IDS,
  USDC_ADDRESSES,
} from "../src/lib/performance/chains-data";

test("supported frontend chains exclude cronos entirely", () => {
  const chainValues = Object.values(CHAIN_IDS) as number[];
  assert.deepEqual(
    SUPPORTED_CHAIN_IDS,
    [CHAIN_IDS.avalancheFuji, CHAIN_IDS.arbitrumTestnet],
  );
  assert.equal(chainValues.includes(338), false);
  assert.equal(chainValues.includes(25), false);
});

test("frontend chain metadata and USDC addresses stay aligned after cronos removal", () => {
  for (const chainId of SUPPORTED_CHAIN_IDS) {
    assert.ok(CHAIN_CONFIG[chainId]);
    assert.ok(USDC_ADDRESSES[chainId]);
  }
});
