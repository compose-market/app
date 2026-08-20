import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  modelRequiresImageAttachment,
  submissionHasImageAttachment,
} from "../src/lib/models.ts";
import { addAtomicAmounts } from "../src/lib/receipts.ts";

test("model guard identifies image-only edit operations from catalog fields", () => {
  assert.equal(modelRequiresImageAttachment({ input: ["text"], operations: [], requiresImageInput: true }), true);
  assert.equal(modelRequiresImageAttachment({ input: ["text"], operations: [], capabilities: { requiresImageInput: true } }), true);
  assert.equal(modelRequiresImageAttachment({
    input: ["text"],
    operations: [],
    params: { source_image: { type: "string", required: true, is_image: true } },
  }), true);
  assert.equal(modelRequiresImageAttachment({
    input: ["image", "text"],
    operations: [
      { operation: "image-to-image", input: ["image", "text"], output: ["image"] },
      { operation: "text-to-image", input: ["text"], output: ["image"] },
    ],
    params: { image_urls: { type: "array", required: true, minItems: 0 } },
  }), false);
  assert.equal(modelRequiresImageAttachment({
    input: ["text", "image"],
    operations: [{ operation: "image-to-image", input: ["image", "text"], output: ["image"] }],
  }), true);
  assert.equal(modelRequiresImageAttachment({
    input: ["text", "image"],
    operations: [
      { operation: "image-to-image", input: ["image", "text"], output: ["image"] },
      { operation: "text-to-image", input: ["text"], output: ["image"] },
    ],
  }), false);
  assert.equal(modelRequiresImageAttachment({ input: ["text"], operations: ["image-to-image"] }), false);
  assert.equal(modelRequiresImageAttachment({
    input: ["image", "text"],
    operations: [{ operation: "vision-chat", input: ["image", "text"], output: ["text"] }],
    params: { image: { type: "string", required: true }, question: { type: "string", required: true } },
  }), true);
});

test("submission image detection accepts response content and universal attachments", () => {
  assert.equal(submissionHasImageAttachment({ input: [{ content: [{ type: "input_image", image_url: "https://example.com/a.png" }] }] }), true);
  assert.equal(submissionHasImageAttachment({ attachments: [{ type: "image", url: "ipfs://image" }] }), true);
  assert.equal(submissionHasImageAttachment({ input: "draw a cat" }), false);
});

test("receipt atomic arithmetic does not lose precision", () => {
  assert.equal(addAtomicAmounts("9007199254740993", "9"), "9007199254741002");
});

test("shared response submission enforces the guard and playground serializes attachments once", () => {
  const stream = readFileSync(new URL("../src/hooks/use-stream.ts", import.meta.url), "utf8");
  const playground = readFileSync(new URL("../src/pages/playground.tsx", import.meta.url), "utf8");
  const modelCard = readFileSync(new URL("../src/components/models/card.tsx", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../src/components/chat.tsx", import.meta.url), "utf8");
  assert.match(stream, /modelRequiresImageAttachment\(card\)/);
  assert.match(stream, /image_attachment_required/);
  assert.doesNotMatch(playground, /\{ attachments \}/);
  assert.doesNotMatch(playground, /\.map\(toAttachment\)/);
  assert.match(modelCard, /min=\{definition\.minimum\}/);
  assert.match(modelCard, /max=\{definition\.maximum\}/);
  assert.match(chat, /role="alert"/);
  assert.match(chat, />Image required</);
  assert.match(chat, /Upload image/);
  assert.match(chat, /aria-describedby=\{imageRequirementMissing/);
  assert.doesNotMatch(chat, /Source image <span/);
});
