import assert from "node:assert/strict";
import test from "node:test";

import { ComposeSDK } from "@compose-market/sdk";
import type { CatalogModel } from "../src/lib/models";

test("web consumes @compose-market/sdk as a third-party integrator", async () => {
  const calls: Array<{ host: string; method: string; path: string; headers: Headers }> = [];
  const sdk = new ComposeSDK({
    baseUrl: "https://api.example.test",
    channelsUrl: "https://services.example.test",
    defaultHeaders: {
      Authorization: "Bearer compose-test",
      "x-chain-id": "43113",
      "x-session-active": "true",
      "x-payment-intent-id": "intent-test",
    },
    fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      calls.push({
        host: url.host,
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        headers: new Headers(init?.headers),
      });
      const body = url.pathname.startsWith("/channels/")
        ? {
          code: "link-test",
          channel: "telegram",
          userAddress: "0x0000000000000000000000000000000000000001",
          agentWallet: "0x0000000000000000000000000000000000000002",
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          url: "https://t.me/compose_bot?start=link-test",
        }
        : { agents: [], total: 0, tags: [], categories: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(typeof sdk.models.pricing, "function");
  assert.equal(typeof sdk.x402.payments.prepare, "function");
  assert.equal(typeof sdk.x402.payments.meterModel, "function");
  assert.equal(typeof sdk.directory.agents.agentverse, "function");
  assert.equal(typeof sdk.system.health, "function");
  assert.equal(typeof sdk.local.link.create, "function");
  assert.equal(typeof sdk.permissions.list, "function");
  assert.equal(typeof sdk.accounts.connect, "function");
  assert.equal(typeof sdk.channels.link, "function");
  assert.equal(typeof sdk.dispenser.status, "function");
  assert.equal(typeof sdk.settlement.status, "function");
  assert.equal("metrics" in sdk, false);

  await sdk.directory.agents.agentverse({
    search: "research",
    tags: ["ai", "payments"],
    limit: 5,
    sort: "interactions",
    direction: "desc",
  });

  assert.equal(
    calls[0]?.path,
    "/api/agentverse/agents?search=research&tags=ai%2Cpayments&limit=5&sort=interactions&direction=desc",
  );
  assert.equal(calls[0]?.host, "api.example.test");

  await sdk.channels.link("telegram", {
    userAddress: "0x0000000000000000000000000000000000000001",
    agentWallet: "0x0000000000000000000000000000000000000002",
    agentName: "Echo",
  });

  const channelCall = calls.at(-1);
  assert.equal(channelCall?.host, "services.example.test");
  assert.equal(channelCall?.method, "POST");
  assert.equal(channelCall?.path, "/channels/telegram/link");
  assert.equal(channelCall?.headers.has("authorization"), false);
  assert.equal(channelCall?.headers.has("x-chain-id"), false);
  assert.equal(channelCall?.headers.has("x-session-active"), false);
  assert.equal(channelCall?.headers.has("x-payment-intent-id"), false);
});

test("web catalog models can carry API-owned operations without local routing", () => {
  const model: CatalogModel = {
    modelId: "misleading-model",
    provider: "openai",
    name: "Misleading Model",
    type: "text-generation",
    description: null,
    input: ["text"],
    output: ["audio"],
    contextWindow: null,
    pricing: null,
    operations: [{
      modality: "audio",
      operation: "text-to-speech",
      sourceTypes: ["speech"],
      input: ["text"],
      output: ["audio"],
      pricingUnits: [],
      streamable: false,
    }],
  };

  assert.equal(Array.isArray(model.operations), true);
  assert.equal((model.operations?.[0] as { operation?: string }).operation, "text-to-speech");
});
