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
  const logos = readFileSync(resolve(repo, "packages/theme/src/chain-logos/index.ts"), "utf8");

  assert.match(market, /cm-market-agent-canvas/);
  assert.match(market, /onOpen=\{\(\) => setLocation\(agentPageUrl\)\}/);
  assert.doesNotMatch(market, /<Link[\s\S]{0,220}<SharedAgentCard/);
  assert.match(card, /onOpen\?: \(\) => void/);
  assert.match(card, /role=\{onOpen \? "link" : undefined\}/);
  assert.match(card, /variant === "market"/);
  assert.match(card, /cm-agent-card__verified/);
  assert.match(card, /cm-agent-card__network/);
  assert.match(card, /VITE_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY/);
  assert.match(card, /chainLogoUrl/);
  assert.match(card, /!isMarketCard && apiEndpoint/);
  assert.doesNotMatch(market, /A2A Endpoint|Creator|Cloneable/);
  assert.match(logos, /img\.logo\.dev\/crypto/);
  assert.match(logos, /1329[\s\S]*symbol:\s*"sei"/);
  assert.match(logos, /25[\s\S]*symbol:\s*"cro"/);
  assert.match(logos, /solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/);
  assert.match(logos, /near:mainnet/);
  assert.match(logos, /sui:mainnet/);
  assert.doesNotMatch(logos, /data:image/);
  assert.match(logos, /params\.set\("fallback",\s*"404"\)/);
});

test("shared card and model primitives stay self-contained without internal card scroll", () => {
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/styles.ts"), "utf8");
  const shell = readFileSync(resolve(repo, "packages/theme/src/shell/styles.ts"), "utf8");
  const playground = read("src/pages/playground.tsx");
  const chips = read("src/components/capability-chips.tsx");

  assert.doesNotMatch(agents, /cm-agent-card--match-chat[\s\S]{0,180}overflow-y:\s*auto/);
  assert.match(agents, /cm-agent-card--market/);
  assert.doesNotMatch(agents, /cm-agent-card--market-full/);
  assert.doesNotMatch(agents, /cm-agent-card--market[\s\S]{0,180}display:\s*none/);
  assert.match(playground, /<CapabilityChips/);
  assert.doesNotMatch(playground, /<select/);
  assert.match(chips, /cm-playground__chip-icon/);
  assert.match(chips, /DropdownMenuTrigger/);
  assert.match(chips, /DropdownMenuContent/);
  assert.match(chips, /cm-playground__chip-menu-grid/);
  assert.match(chips, /selected === "all" \? label/);
  assert.match(chips, /function triggerClass/);
  assert.match(chips, /providerCategories/);
  assert.doesNotMatch(chips, /cm-playground__chip-label/);
  assert.doesNotMatch(chips, /DropdownMenuLabel/);
  assert.doesNotMatch(chips, /categoryClass\(selectedCat,\s*variant,\s*true\)/);
  assert.doesNotMatch(chips, /displayProviders|slice\(0,\s*11\)/);
  assert.match(shell, /\.cm-playground__chip-menu-grid\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(shell, /\.cm-playground__chip-menu \.cm-playground__chip\s*\{[\s\S]*width:\s*100%/);
});

test("mirror pane owns its responsive styles in the theme module", () => {
  const styles = read("src/styles/index.css");
  const pane = read("src/components/mirror-pane.tsx");
  const playground = read("src/pages/playground.tsx");
  const mirror = readFileSync(resolve(repo, "packages/theme/src/mirror/index.tsx"), "utf8");
  const shellIndex = readFileSync(resolve(repo, "packages/theme/src/shell/index.tsx"), "utf8");
  const shellStyles = readFileSync(resolve(repo, "packages/theme/src/shell/styles.ts"), "utf8");
  const generator = readFileSync(resolve(repo, "packages/theme/scripts/generate-css.ts"), "utf8");

  assert.equal(existsSync(resolve(repo, "packages/theme/src/mirror/styles.ts")), false);
  assert.doesNotMatch(styles, /\.cm-mirror-pane/);
  assert.match(pane, /MirrorPane\s+as\s+MirrorPaneShell/);
  assert.doesNotMatch(pane, /ComposeMirror/);
  assert.match(mirror, /export const mirrorStyles = \/\* css \*\//);
  assert.match(mirror, /\.cm-mirror-pane\s*\{/);
  assert.match(mirror, /container-name:\s*cm-mirror/);
  assert.match(mirror, /container-type:\s*size/);
  assert.match(mirror, /\.cm-mirror-pane__content\s*\{[\s\S]*height:\s*100%/);
  assert.match(mirror, /\.cm-mirror-pane__body > \.cm-mirror-pane__content:first-child:last-child\s*\{[\s\S]*grid-row:\s*1 \/ -1/);
  assert.match(mirror, /\.cm-mirror-pane__details,\s*\n\.cm-mirror-pane__custom-content\s*\{[\s\S]*grid-auto-rows:\s*minmax\(min-content,\s*1fr\)/);
  assert.match(mirror, /\.cm-mirror-pane__details,\s*\n\.cm-mirror-pane__custom-content\s*\{[\s\S]*height:\s*100%/);
  assert.match(mirror, /\.cm-mirror-pane__details,\s*\n\.cm-mirror-pane__custom-content\s*\{[\s\S]*align-content:\s*stretch/);
  assert.match(mirror, /--cm-mirror-section-min:\s*clamp/);
  assert.match(mirror, /--cm-mirror-flow-size:\s*clamp/);
  assert.match(mirror, /--cm-mirror-format-size:\s*clamp/);
  assert.match(mirror, /--cm-mirror-label-size:\s*clamp/);
  assert.match(mirror, /\.cm-mirror-pane__details\s*\{[\s\S]*grid-auto-rows:\s*minmax\(var\(--cm-mirror-section-min\),\s*1fr\)[\s\S]*align-content:\s*stretch/);
  assert.doesNotMatch(mirror, /\.cm-mirror-pane__details\s*\{[\s\S]*align-content:\s*space-between/);
  assert.match(mirror, /\.cm-mirror-pane__icon-label\s*\{[\s\S]*width:\s*var\(--cm-mirror-flow-size\)/);
  assert.match(mirror, /\.cm-mirror-pane__format-badge\s*\{[\s\S]*width:\s*var\(--cm-mirror-format-size\)/);
  assert.match(mirror, /\.cm-mirror-pane__icon-label--section\s*\{[\s\S]*width:\s*var\(--cm-mirror-section-icon-size\)/);
  assert.match(mirror, /\.cm-mirror-pane__details \.cm-mirror-pane__kv-grid,[\s\S]*grid-auto-rows:\s*minmax\(var\(--cm-mirror-cell-min\),\s*max-content\)[\s\S]*height:\s*100%[\s\S]*align-content:\s*center/);
  assert.match(mirror, /\.cm-mirror-pane__details \.cm-mirror-pane__kv-row,[\s\S]*height:\s*auto/);
  assert.doesNotMatch(mirror, /\.cm-mirror-pane__kv-row,\s*\n\.cm-mirror-pane__io-row,\s*\n\.cm-mirror-pane__pricing-header\s*\{[^}]*height:\s*100%/);
  assert.match(mirror, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mirror, /@container \(max-width:\s*28rem\)/);
  assert.match(mirror, /@container cm-mirror \(max-height:\s*44rem\)/);
  assert.match(mirror, /@container cm-mirror \(max-height:\s*34rem\)/);
  assert.doesNotMatch(mirror, /from "\.\.\/entity"/);
  assert.doesNotMatch(mirror, /<Card/);
  assert.match(mirror, /className="cm-mirror-pane__header"/);
  assert.match(mirror, /grid-template-columns:\s*var\(--cm-mirror-logo\) minmax\(0,\s*1fr\)/);
  assert.match(mirror, /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mirror, /cm-mirror-pane__metric-cell/);
  assert.match(mirror, /\.cm-mirror-pane__icon-label--section/);
  assert.match(mirror, /\.cm-mirror-pane__pricing-unit/);
  assert.match(mirror, /\.cm-mirror-pane__section--capability/);
  assert.match(mirror, /\.cm-mirror-pane__lane-grid/);
  assert.match(mirror, /\.cm-mirror-pane__format-badge/);
  assert.match(mirror, /\.cm-mirror-pane__option-grid/);
  assert.match(mirror, /\.cm-mirror-pane__option-grid\s*\{[\s\S]*display:\s*grid/);
  assert.match(mirror, /\.cm-mirror-pane__option-grid\s*\{[\s\S]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*4\.5rem\),\s*1fr\)\)/);
  assert.doesNotMatch(mirror, /\.cm-mirror-pane__option-grid\s*\{[\s\S]{0,220}flex-wrap/);
  assert.match(mirror, /\.cm-mirror-pane__section--custom/);
  assert.match(mirror, /export function MirrorPane/);
  assert.match(mirror, /export function MirrorSection/);
  assert.match(mirror, /export function MirrorRow/);
  assert.match(mirror, /export function MirrorPricing/);
  assert.match(pane, /title=\{activeTab === "details"/);
  assert.match(pane, /icon=\{activeTab === "details" \? <Cpu \/> : undefined\}/);
  assert.match(pane, /getOptionalModelPricingSections/);
  assert.match(pane, /optionalPricingSections\.length > 0/);
  assert.match(pane, /label=\{<span className="cm-mirror-pane__section-text">Capability<\/span>\}/);
  assert.match(pane, /cm-mirror-pane__lane-grid/);
  assert.match(pane, /iconLabel\("Input",\s*"input"\)/);
  assert.match(pane, /iconLabel\("Output",\s*"output"\)/);
  assert.match(pane, /iconLabel\("Price",\s*"price",\s*"section"\)/);
  assert.match(pane, /typeIcon\(value,\s*"cm-mirror-pane__type-icon"\)/);
  assert.match(pane, /typeIcon\(id,\s*"cm-mirror-pane__format-icon"\)/);
  assert.match(pane, /cm-mirror-pane__format-badge/);
  assert.doesNotMatch(pane, /<span>\{label\}<\/span>/);
  assert.match(pane, /label=\{<span className="cm-mirror-pane__section-text">Context<\/span>\}/);
  assert.match(pane, /<MirrorPricing key=\{`price-\$\{section\.header\}-\$\{index\}`\} unit=\{section\.unit\}>/);
  assert.match(pane, /role="radiogroup"/);
  assert.match(pane, /role="radio"/);
  assert.match(pane, /definition\.default \?\? definition\.options\[0\]/);
  assert.doesNotMatch(pane, /@\/components\/ui\/select|SelectTrigger|SelectContent|SelectItem/);
  assert.match(playground, /definition\.default !== undefined/);
  assert.match(playground, /definition\.options && definition\.options\.length > 0/);
  assert.match(pane, /lines=\{2\}/);
  assert.doesNotMatch(pane, /modelInfo\?\.modelId/);
  assert.doesNotMatch(pane, /<FieldValue value=\{entry\.value\} unit=\{section\.unit\}/);
  assert.match(mirror, /\.cm-mirror-pane__type-badge/);
  assert.doesNotMatch(mirror, /cm-mirror-pane__field-unit/);
  assert.match(shellIndex, /const maxWidth = Math\.min\(320,\s*Math\.max\(160,\s*window\.innerWidth - margin \* 2\)\)/);
  assert.match(shellStyles, /max-width:\s*min\(20rem,\s*calc\(100vw - 1rem\)\)/);
  assert.match(shellStyles, /overflow-wrap:\s*anywhere/);
  assert.match(generator, /mirrorStyles\.trim\(\)\.length === 0/);
});

test("launch recovery pages use content canvases instead of blind clipping", () => {
  const market = read("src/pages/market.tsx");
  const create = read("src/pages/create-agent.tsx");
  const assets = read("src/pages/my-assets.tsx");
  const styles = read("src/styles/index.css");
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/styles.ts"), "utf8");

  assert.match(market, /variant="market"/);
  assert.doesNotMatch(market, /cm-agent-card--market-full/);
  assert.match(market, /cm-control-rail cm-market-control-rail/);
  assert.match(market, /cm-market-control-rail--unified/);
  assert.match(market, /cm-market-search-fold/);
  assert.match(market, /cm-page-header__metric/);
  assert.doesNotMatch(market, /cm-control-rail cm-control-rail--compact/);
  assert.match(market, /cm-market-row-grid/);
  assert.match(styles, /\.cm-market-agent-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.cm-market-agent-grid\s*\{[\s\S]*grid-auto-rows:\s*1fr/);
  assert.match(styles, /\.cm-market-row-grid\s*\{[\s\S]*grid-auto-rows:\s*1fr/);
  assert.match(styles, /\.cm-market-control-rail--unified\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(styles, /\.cm-market-search-fold\[data-open="true"\]\s+\.cm-search--market\s*\{[\s\S]*width:\s*clamp\(13rem/);
  assert.match(styles, /\.cm-market-row-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.cm-market-row-grid\s*>\s*:nth-child\(3n \+ 1\)\s*\{[\s\S]*scroll-snap-align:\s*start/);
  assert.match(styles, /\.cm-market-agent-slot:nth-child\(3n \+ 1\)\s*\{[\s\S]*scroll-snap-align:\s*start/);
  assert.match(styles, /@container \(max-width: 64rem\)[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /@container \(max-width: 64rem\)[\s\S]*\.cm-market-agent-slot:nth-child\(2n \+ 1\)\s*\{[\s\S]*scroll-snap-align:\s*start/);
  assert.doesNotMatch(styles, /cm-agent-card--market-full/);
  assert.doesNotMatch(styles, /cm-agent-card(--|__)/);
  assert.match(agents, /\.cm-agent-card--market > \.cm-card__body\s*\{[\s\S]*height:\s*100%/);
  assert.match(agents, /\.cm-agent-card--market > \.cm-card__body\s*\{[\s\S]*overflow:\s*visible/);
  assert.match(agents, /\.cm-agent-card--match-chat\s*\{[\s\S]*container-name:\s*cm-agent-card[\s\S]*container-type:\s*size/);
  assert.match(agents, /\.cm-agent-card--match-chat > \.cm-card__body\s*\{[\s\S]*grid-template-rows:[\s\S]*minmax\(var\(--cm-agent-card-desc\),\s*0\.72fr\)/);
  assert.match(agents, /\.cm-agent-card--match-chat \.cm-card__metric\s*\{[\s\S]*max-height:\s*none/);
  assert.match(agents, /\.cm-agent-card--match-chat \.cm-agent-card__endpoint-row\s*\{[\s\S]*min-height:\s*var\(--cm-agent-card-section\)/);
  assert.match(agents, /\.cm-agent-card__identity-meta\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(agents, /\.cm-agent-card__model\s*\{[\s\S]*max-width:\s*100%/);
  assert.match(agents, /\.cm-agent-card__model\s*\{[\s\S]*max-height:\s*none/);
  assert.match(agents, /\.cm-agent-card__model-name\s*\{[\s\S]*text-overflow:\s*ellipsis/);

  assert.match(create, /cm-web-page__canvas cm-workspace-canvas--fade/);
  assert.match(create, /cm-create-builder__pair/);
  assert.doesNotMatch(create, /pb-20/);
  assert.doesNotMatch(create, /NetworkSelector/);
  assert.doesNotMatch(create, /overflow-y-auto max-h-\[100px\]/);

  assert.match(assets, /cm-web-page__canvas cm-workspace-canvas--fade/);
  assert.match(assets, /cm-control-rail/);
  assert.doesNotMatch(assets, /useAgentsByCreator/);
  assert.match(assets, /DirectoryAgent/);
  assert.match(assets, /params\.set\("creator", input\.creator\)/);
  assert.match(assets, /sdk\.fetch\(`\/agents/);
  assert.match(assets, /cm-market-agent-canvas/);
  assert.match(assets, /variant="market"/);
  assert.doesNotMatch(assets, /cm-agent-card--market-full/);
  assert.match(assets, /cm-market-control-rail--unified/);
  assert.match(assets, /cm-market-search-fold/);
  assert.match(assets, /cm-page-header__account/);
  assert.doesNotMatch(assets, /cm-control-rail cm-control-rail--compact/);
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
  assert.match(styles, /#000 1\.5%, #000 95%/);
  assert.doesNotMatch(styles, /clamp\(5\.(35|55)rem/);

  assert.match(agents, /cm-page-stack/);
  assert.match(agents, /cm-page-list cm-workspace-canvas--fade/);
  assert.match(models, /cm-page-stack/);
  assert.match(models, /cm-page-list cm-workspace-canvas--fade/);
  assert.match(registry, /cm-page-stack/);
  assert.match(registry, /cm-page-list cm-workspace-canvas--fade/);
  assert.match(assets, /cm-market-workspace/);
  assert.match(assets, /cm-market-tabs/);
  assert.match(assets, /cm-market-tab-panel cm-market-tab-panel--agents/);
  assert.match(assets, /cm-market-tab-panel cm-market-tab-panel--scroll/);
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

test("published theme sources use compact chrome and non-clipping agent cards", () => {
  const shell = readFileSync(resolve(repo, "packages/theme/src/shell/styles.ts"), "utf8");
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/styles.ts"), "utf8");

  assert.match(shell, /#000 1\.5%, #000 95%/);
  assert.doesNotMatch(shell, /clamp\(5\.(35|55)rem/);
  assert.match(agents, /\.cm-agent-card--match-chat,\s*\n\.cm-agent-card--asset\s*\{[\s\S]*height:\s*100%/);
  assert.match(agents, /\.cm-agent-card--match-chat\s*\{[\s\S]*container-type:\s*size/);
  assert.match(agents, /@container cm-agent-card \(max-height:\s*42rem\)/);
  assert.match(agents, /\.cm-agent-card--match-chat > \.cm-card__body\s*\{[\s\S]*align-content:\s*stretch/);
  assert.match(agents, /\.cm-agent-card__identity-meta\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(agents, /\.cm-agent-card__model\s*\{[\s\S]*max-width:\s*100%/);
  assert.match(agents, /\.cm-agent-card__model-name\s*\{[\s\S]*text-overflow:\s*ellipsis/);
});
