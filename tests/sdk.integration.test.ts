import assert from "node:assert/strict";
import test from "node:test";

import { ComposeSDK } from "@compose-market/sdk";
import { resolveOperation } from "../src/lib/multimodal";
import type { CatalogModel } from "../src/lib/models";

test("web consumes @compose-market/sdk as a third-party integrator", async () => {
  const calls: Array<{ method: string; path: string }> = [];
  const sdk = new ComposeSDK({
    baseUrl: "https://api.example.test",
    fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      calls.push({ method: init?.method ?? "GET", path: `${url.pathname}${url.search}` });
      return new Response(JSON.stringify({ agents: [], total: 0, tags: [], categories: [] }), {
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
  assert.equal(typeof sdk.backpack.permissions.list, "function");
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
});

test("web inference routing is driven by SDK catalog operations", () => {
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

  assert.equal(resolveOperation(model)?.operation, "text-to-speech");
});
