import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_CONFIG,
  CHAIN_IDS,
  SUPPORTED_CHAIN_IDS,
  USDC_ADDRESSES,
} from "../src/lib/performance/chains-data";
import { CHAIN_OBJECTS, setChainRegistry } from "../src/lib/chains";
import type { FacilitatorChain } from "@compose-market/sdk/chains";

const mockChains: FacilitatorChain[] = [
  { name: "Avalanche Fuji", network: "eip155:43113", namespace: "eip155", shortName: "Fuji", isTestnet: true, explorer: "https://testnet.snowtrace.io", rpcUrl: "https://rpc.example", assetAddress: "0x5425890298aed601595a70AB815c96711a31Bc65", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Avalanche C-Chain", network: "eip155:43114", namespace: "eip155", shortName: "Avalanche", isTestnet: false, explorer: "https://snowtrace.io", rpcUrl: "https://rpc.example", assetAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Arbitrum Sepolia", network: "eip155:421614", namespace: "eip155", shortName: "Arb Sepolia", isTestnet: true, explorer: "https://sepolia.arbiscan.io", rpcUrl: "https://rpc.example", assetAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Arbitrum One", network: "eip155:42161", namespace: "eip155", shortName: "Arbitrum", isTestnet: false, explorer: "https://arbiscan.io", rpcUrl: "https://rpc.example", assetAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Arc Testnet", network: "eip155:5042002", namespace: "eip155", shortName: "Arc Testnet", isTestnet: true, explorer: "https://testnet.arcscan.app", rpcUrl: "https://rpc.example", assetAddress: "0x3600000000000000000000000000000000000000", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Arc", network: "eip155:5042", namespace: "eip155", shortName: "Arc", isTestnet: false, explorer: "https://arcscan.app", rpcUrl: "https://rpc.example", assetAddress: "0x3600000000000000000000000000000000000000", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Sei Testnet", network: "eip155:1328", namespace: "eip155", shortName: "Sei Testnet", isTestnet: true, explorer: "https://testnet.seiscan.io", rpcUrl: "https://rpc.example", assetAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
  { name: "Sei", network: "eip155:1329", namespace: "eip155", shortName: "Sei", isTestnet: false, explorer: "https://seiscan.io", rpcUrl: "https://rpc.example", assetAddress: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392", schemes: ["exact","upto","batch-settlement"], asset: "USDC", decimals: 6 },
];

test.before(() => {
  setChainRegistry(mockChains, "eip155:43113");
});

test("supported frontend chains exclude cronos entirely", () => {
  const chainValues = Object.values(CHAIN_IDS) as number[];
  assert.deepEqual(
    SUPPORTED_CHAIN_IDS,
    [
      CHAIN_IDS.avalancheFuji,
      CHAIN_IDS.avalanche,
      CHAIN_IDS.arbitrumTestnet,
      CHAIN_IDS.arbitrum,
      CHAIN_IDS.arcTestnet,
      CHAIN_IDS.arc,
      CHAIN_IDS.seiTestnet,
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

test("Arc and Sei use canonical USDC contracts", () => {
  assert.equal(USDC_ADDRESSES[CHAIN_IDS.arcTestnet], "0x3600000000000000000000000000000000000000");
  assert.equal(USDC_ADDRESSES[CHAIN_IDS.arc], "0x3600000000000000000000000000000000000000");
  assert.equal(USDC_ADDRESSES[CHAIN_IDS.seiTestnet], "0x4fCF1784B31630811181f670Aea7A7bEF803eaED");
  assert.equal(USDC_ADDRESSES[CHAIN_IDS.sei], "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392");
});
