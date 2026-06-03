import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("root route redirects to market and home page is removed from app graph", () => {
  const app = read("src/App.tsx");
  const layout = read("src/components/layout/Layout.tsx");

  assert.equal(existsSync(resolve(root, "src/pages/home.tsx")), false);
  assert.doesNotMatch(app, /@\/pages\/home/);
  assert.match(app, /<Redirect\s+to="\/market"\s+replace\s*\/>/);
  assert.doesNotMatch(layout, /label:\s*"Home"/);
});

test("network selector lives in the nav utility, not the top HUD or overflow", () => {
  const layout = read("src/components/layout/Layout.tsx");
  const selectorUses = layout.match(/<NetworkSelector/g) || [];

  assert.equal(selectorUses.length, 1);
  assert.match(layout, /cm-app-chrome__navutility[\s\S]*<NetworkSelector/);
  assert.doesNotMatch(layout, /cm-app-chrome__hud-item[\s\S]{0,140}<NetworkSelector/);
  assert.doesNotMatch(layout, /cm-app-chrome__hud-popover-title">Network/);
});

test("market agent cards use root open handlers without nested links", () => {
  const market = read("src/pages/market.tsx");
  const card = read("src/components/agent-card.tsx");

  assert.match(market, /cm-market-agent-canvas/);
  assert.match(market, /onOpen=\{\(\) => setLocation\(agentPageUrl\)\}/);
  assert.doesNotMatch(market, /<Link[\s\S]{0,220}<SharedAgentCard/);
  assert.match(card, /onOpen\?: \(\) => void/);
  assert.match(card, /role=\{onOpen \? "link" : undefined\}/);
});

test("shared card and model primitives stay self-contained without internal card scroll", () => {
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/styles.ts"), "utf8");
  const playground = read("src/pages/playground.tsx");
  const chips = read("src/components/capability-chips.tsx");

  assert.doesNotMatch(agents, /cm-agent-card--match-chat[\s\S]{0,180}overflow-y:\s*auto/);
  assert.match(agents, /cm-agent-card--market-full/);
  assert.doesNotMatch(agents, /cm-agent-card--market[\s\S]{0,180}display:\s*none/);
  assert.match(playground, /<CapabilityChips/);
  assert.doesNotMatch(playground, /<select/);
  assert.match(chips, /cm-playground__chip-icon/);
});

test("launch recovery pages use content canvases instead of blind clipping", () => {
  const market = read("src/pages/market.tsx");
  const create = read("src/pages/create-agent.tsx");
  const assets = read("src/pages/my-assets.tsx");
  const styles = read("src/styles/index.css");

  assert.match(market, /cm-agent-card--market-full/);
  assert.doesNotMatch(market, /className="cm-agent-card--market"/);
  assert.match(market, /cm-control-rail cm-market-control-rail/);
  assert.match(styles, /--cm-market-card-height:\s*clamp\(26rem/);

  assert.match(create, /cm-web-page__canvas cm-workspace-canvas--fade/);
  assert.match(create, /cm-create-builder__pair/);
  assert.doesNotMatch(create, /pb-20/);
  assert.doesNotMatch(create, /NetworkSelector/);
  assert.doesNotMatch(create, /overflow-y-auto max-h-\[100px\]/);

  assert.match(assets, /cm-web-page__canvas cm-workspace-canvas--fade/);
  assert.match(assets, /cm-control-rail/);
  assert.doesNotMatch(assets, /pb-20/);
});

test("fixed page shells keep whole-page canvases locked and move overflow into explicit lists", () => {
  const styles = read("src/styles/index.css");
  const agents = read("src/pages/agents.tsx");
  const models = read("src/pages/models.tsx");
  const registry = read("src/pages/registry.tsx");
  const assets = read("src/pages/my-assets.tsx");

  assert.match(styles, /\.cm-web-page__canvas\s*\{[\s\S]*overflow-y:\s*hidden/);
  assert.match(styles, /\.cm-page-list\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.cm-page-tab-panel\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.cm-fold:not\(\[open\]\)\s*>\s*\.cm-fold__body\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /#000 1\.6%, #000 98\.4%/);

  assert.match(agents, /cm-page-stack/);
  assert.match(agents, /cm-page-list cm-workspace-canvas--fade/);
  assert.match(models, /cm-page-stack/);
  assert.match(models, /cm-page-list cm-workspace-canvas--fade/);
  assert.match(registry, /cm-page-stack/);
  assert.match(registry, /cm-page-list cm-workspace-canvas--fade/);
  assert.match(assets, /cm-page-stack cm-page-stack--simple/);
  assert.match(assets, /cm-page-tabs/);
  assert.match(assets, /cm-page-tab-panel/);
});

test("backpack rows and binary controls use high-contrast theme primitives", () => {
  const backpack = read("src/components/backpack.tsx");
  const sw = read("src/components/ui/switch.tsx");
  const checkbox = read("src/components/ui/checkbox.tsx");

  assert.match(backpack, /cm-setting-row/);
  assert.doesNotMatch(backpack, /bg-zinc|border-zinc|text-zinc/);
  assert.match(sw, /cm-switch/);
  assert.match(checkbox, /cm-checkbox/);
});
