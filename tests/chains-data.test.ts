import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_CONFIG,
  CHAIN_IDS,
  SUPPORTED_CHAIN_IDS,
  USDC_ADDRESSES,
} from "../src/lib/performance/chains-data";
import { CHAIN_OBJECTS, getExplorerTxUrl, setChainRegistry } from "../src/lib/chains";
import type { FacilitatorChain } from "@compose-market/sdk/chains";

const mockChains: Array<FacilitatorChain & { explorerQuery?: string }> = [
  { name: "Avalanche C-Chain", network: "eip155:43114", namespace: "eip155", shortName: "Avalanche", isTestnet: false, explorer: "https://snowtrace.io", rpcUrl: "https://rpc.example", assetAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Arc Testnet", network: "eip155:5042002", namespace: "eip155", shortName: "Arc Testnet", isTestnet: true, explorer: "https://testnet.arcscan.app", rpcUrl: "https://rpc.example", assetAddress: "0x3600000000000000000000000000000000000000", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Sei", network: "eip155:1329", namespace: "eip155", shortName: "Sei", isTestnet: false, explorer: "https://seiscan.io", rpcUrl: "https://rpc.example", assetAddress: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Solana Devnet", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", namespace: "solana", shortName: "Solana Devnet", isTestnet: true, explorer: "https://explorer.solana.com", explorerQuery: "cluster=devnet", rpcUrl: "https://api.devnet.solana.com", assetAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
];

test.before(() => {
  setChainRegistry(mockChains, "eip155:5042002");
});

test("supported frontend chains exclude cronos entirely", () => {
  const chainValues = Object.values(CHAIN_IDS) as number[];
  assert.deepEqual(
    SUPPORTED_CHAIN_IDS,
    [
      CHAIN_IDS.avalanche,
      CHAIN_IDS.arcTestnet,
      CHAIN_IDS.sei,
    ],
  );
  assert.equal(chainValues.includes(338), false);
  assert.equal(chainValues.includes(25), false);
});

test("frontend chain metadata and USDC addresses stay aligned after cronos removal", () => {
  for (const chainId of SUPPORTED_CHAIN_IDS) {
    assert.ok(CHAIN_CONFIG[chainId]);
    assert.ok(USDC_ADDRESSES[chainId]);
    assert.ok(CHAIN_OBJECTS[chainId as keyof typeof CHAIN_OBJECTS]);
  }
});

test("supported Arc and Sei networks use canonical USDC contracts", () => {
  assert.equal(USDC_ADDRESSES[CHAIN_IDS.arcTestnet], "0x3600000000000000000000000000000000000000");
  assert.equal(USDC_ADDRESSES[CHAIN_IDS.sei], "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392");
});

test("Solana devnet explorer links preserve the cluster query", () => {
  assert.equal(
    getExplorerTxUrl("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "signature"),
    "https://explorer.solana.com/tx/signature?cluster=devnet",
  );
});
