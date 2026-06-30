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
  assert.match(card, /navigator\.clipboard\.writeText\(apiEndpoint\)/);
  assert.match(card, /title=\{apiEndpoint\}/);
  assert.match(card, /return value \? `\/agent\/\$\{value\.slice\(0,\s*5\)\}\.\.\.` : "Unavailable"/);
  assert.doesNotMatch(card, /API_BASE_URL\.replace\([\s\S]{0,120}\/agent\/\$\{value\.slice/);
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
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/agents.css"), "utf8");
  const agentCard = readFileSync(resolve(repo, "web/src/styles/agent-card.css"), "utf8");
  const shell = readFileSync(resolve(repo, "packages/theme/src/shell/shell.css"), "utf8");
  const playground = read("src/pages/playground.tsx");
  const chips = read("src/components/capability-chips.tsx");

  assert.doesNotMatch(agentCard, /cm-agent-card--match-chat[\s\S]{0,180}overflow-y:\s*auto/);
  assert.match(agentCard, /cm-agent-card--market/);
  assert.doesNotMatch(agentCard, /cm-agent-card--market-full/);
  assert.doesNotMatch(agentCard, /cm-agent-card--market[\s\S]{0,180}display:\s*none/);
  assert.match(playground, /<CapabilityChips/);
  assert.doesNotMatch(playground, /<select/);
  assert.match(chips, /cm-chip/);
  assert.match(chips, /cm-type-icon/);
  assert.doesNotMatch(chips, /cm-playground__chip-icon/);
  assert.match(chips, /DropdownMenuTrigger/);
  assert.match(chips, /DropdownMenuContent/);
  assert.match(chips, /cm-playground__chip-menu-grid/);
  assert.match(chips, /selected === "all" \? label/);
  assert.match(chips, /function triggerClass/);
  assert.match(chips, /familyCategories/);
  assert.doesNotMatch(chips, /cm-playground__chip-label/);
  assert.doesNotMatch(chips, /DropdownMenuLabel/);
  assert.doesNotMatch(chips, /categoryClass\(selectedCat,\s*variant,\s*true\)/);
  assert.doesNotMatch(chips, /displayProviders|slice\(0,\s*11\)/);
  assert.match(shell, /\.cm-chip,\s*\n\.cm-tool-chip/);
  assert.match(shell, /\.cm-type--text/);
  assert.match(shell, /\.cm-command-panel/);
  assert.match(shell, /\.cm-chat\s*\{/);
  assert.doesNotMatch(shell, /\.cm-playground__/);
});

test("mirror pane owns its responsive styles in the theme module", () => {
  const styles = read("src/styles/index.css");
  const pane = read("src/components/mirror-pane.tsx");
  const playground = read("src/pages/playground.tsx");
  const mirror = readFileSync(resolve(repo, "packages/theme/src/mirror/mirror.css"), "utf8");
  const mirrorIndex = readFileSync(resolve(repo, "packages/theme/src/mirror/index.tsx"), "utf8");
  const shellIndex = readFileSync(resolve(repo, "packages/theme/src/shell/index.tsx"), "utf8");
  const shellStyles = readFileSync(resolve(repo, "packages/theme/src/shell/shell.css"), "utf8");
  const generator = readFileSync(resolve(repo, "packages/theme/scripts/generate-css.ts"), "utf8");

  assert.equal(existsSync(resolve(repo, "packages/theme/src/mirror/styles.ts")), false);
  assert.doesNotMatch(styles, /\.cm-mirror-pane/);
  assert.match(pane, /MirrorPane\s+as\s+MirrorPaneShell/);
  assert.doesNotMatch(pane, /ComposeMirror/);
  assert.match(mirrorIndex, /export const mirrorStyles = /);
  assert.match(mirror, /\.cm-mirror-pane\s*\{/);
  assert.match(mirror, /container-name:\s*cm-mirror/);
  assert.match(mirror, /container-type:\s*inline-size/);
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
  assert.match(mirror, /--cm-mirror-unit:\s*clamp/);
  assert.match(mirror, /\.cm-mirror-pane__details \.cm-mirror-pane__kv-grid,[\s\S]*grid-auto-rows:\s*minmax\(0,\s*1fr\)[\s\S]*height:\s*100%[\s\S]*align-content:\s*center/);
  assert.match(mirror, /\.cm-mirror-pane__details \.cm-mirror-pane__kv-row,[\s\S]*grid-template-columns:\s*auto auto[\s\S]*justify-content:\s*center[\s\S]*height:\s*min\(var\(--cm-mirror-cell-max\),\s*100%\)/);
  assert.doesNotMatch(mirror, /\.cm-mirror-pane__details \.cm-mirror-pane__kv-row,[\s\S]*height:\s*auto/);
  assert.match(mirror, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mirror, /@container \(max-width:\s*28rem\)/);
  assert.doesNotMatch(mirror, /@container cm-mirror \(max-height:\s*44rem\)/);
  assert.doesNotMatch(mirror, /@container cm-mirror \(max-height:\s*34rem\)/);
  assert.doesNotMatch(mirror, /from "\.\.\/entity"/);
  assert.doesNotMatch(mirror, /<Card/);
  assert.match(mirrorIndex, /className="cm-mirror-pane__header"/);
  assert.match(mirror, /grid-template-columns:\s*var\(--cm-mirror-logo\) minmax\(0,\s*1fr\)/);
  assert.match(mirror, /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mirrorIndex, /cm-mirror-pane__metric-cell/);
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
  assert.match(mirrorIndex, /export function MirrorPane/);
  assert.match(mirrorIndex, /export function MirrorSection/);
  assert.match(mirrorIndex, /export function MirrorRow/);
  assert.match(mirrorIndex, /export function MirrorPricing/);
  assert.match(pane, /title=\{activeTab === "details"/);
  assert.match(pane, /icon=\{activeTab === "details" \? \(\(\) => \{/);
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
  const control = read("src/components/control.tsx");
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/agents.css"), "utf8");
  const agentCard = readFileSync(resolve(repo, "web/src/styles/agent-card.css"), "utf8");
  const marketTheme = readFileSync(resolve(repo, "packages/theme/src/market/market.css"), "utf8");
  const shellTheme = readFileSync(resolve(repo, "packages/theme/src/shell/shell.css"), "utf8");
  const cssIndex = readFileSync(resolve(repo, "packages/theme/src/css/index.ts"), "utf8");

  assert.match(market, /variant="market"/);
  assert.doesNotMatch(market, /cm-agent-card--market-full/);
  assert.match(market, /cm-control-rail cm-market-control-rail/);
  assert.match(market, /<SearchFold/);
  assert.match(control, /cm-control-search-fold/);
  assert.doesNotMatch(market, /cm-control-rail cm-control-rail--compact/);
  assert.match(market, /cm-market-row-grid/);
  assert.match(cssIndex, /@import '\.\/market\.css';/);
  assert.match(marketTheme, /\.cm-market-agent-grid,\s*\n\.cm-market-row-grid\s*\{[\s\S]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*var\(--cm-market-min/);
  assert.match(marketTheme, /\.cm-market-control-rail\s*\{[\s\S]*display:\s*flex/);
  assert.doesNotMatch(marketTheme, /cm-market-search-fold|cm-search--market/);
  assert.match(shellTheme, /\.cm-control-search-fold\[data-open="true"\]\s+\.cm-search--fold\s*\{[\s\S]*width:\s*clamp\(13rem/);
  assert.match(marketTheme, /scroll-snap-type:\s*y mandatory/);
  assert.match(marketTheme, /scroll-snap-stop:\s*always/);
  assert.doesNotMatch(styles, /^\.cm-market-agent-grid/m);
  assert.doesNotMatch(marketTheme, /\.cm-market[\s\S]{0,220}repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(styles, /nth-child\(/);
  assert.doesNotMatch(styles, /cm-agent-card--market-full/);
  assert.doesNotMatch(styles, /cm-agent-card(--|__)/);
  assert.match(marketTheme, /--cm-market-card-size:/);
  assert.match(marketTheme, /\.cm-market-agent-grid\s*\{[\s\S]*grid-auto-rows:\s*var\(--cm-market-card-size\)/);
  assert.match(marketTheme, /\.cm-market-agent-slot,\s*\n\.cm-market-row-grid > \*\s*\{[\s\S]*height:\s*var\(--cm-market-card-size\)/);
  assert.match(marketTheme, /\.cm-market-agent-slot,\s*\n\.cm-market-row-grid > \*\s*\{[\s\S]*contain-intrinsic-size:\s*var\(--cm-market-card-size\)/);
  assert.match(agentCard, /\.cm-agent-card--market > \.cm-card__body\s*\{[\s\S]*height:\s*100%/);
  assert.match(agentCard, /\.cm-agent-card--market > \.cm-card__body\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(agentCard, /\.cm-agent-card--match-chat\s*\{[\s\S]*container-name:\s*cm-agent-card[\s\S]*container-type:\s*inline-size/);
  assert.match(agentCard, /\.cm-agent-card--match-chat > \.cm-card__body\s*\{[\s\S]*grid-template-rows:[\s\S]*auto[\s\S]*auto[\s\S]*auto[\s\S]*auto[\s\S]*auto/);
  assert.match(agentCard, /\.cm-agent-card--match-chat > \.cm-card__body\s*\{[\s\S]*align-content:\s*stretch/);
  assert.doesNotMatch(agentCard, /--cm-agent-card-desc/);
  assert.match(agentCard, /\.cm-agent-card--match-chat \.cm-card__metric\s*\{[\s\S]*max-height:\s*var\(--cm-agent-card-metric\)/);
  assert.match(agentCard, /\.cm-agent-card--match-chat \.cm-card__tags-block\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*max-content\)[\s\S]*justify-content:\s*center/);
  assert.match(agentCard, /\.cm-agent-card--match-chat \.cm-agent-card__endpoint-row\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*max-content\) auto[\s\S]*justify-content:\s*center/);
  assert.match(agentCard, /\.cm-agent-card--match-chat \.cm-agent-card__creator\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*max-content\)[\s\S]*justify-content:\s*center/);
  assert.doesNotMatch(agentCard, /\.cm-agent-card--match-chat \.cm-card__tags-block\s*\{[\s\S]*width:\s*fit-content/);
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
  assert.match(assets, /fetch\(`\$\{AGENTS_URL\}\/agents/);
  assert.match(assets, /staleTime:\s*0/);
  assert.match(assets, /gcTime:\s*0/);
  assert.match(assets, /cm-market-agent-canvas/);
  assert.match(assets, /variant="market"/);
  assert.doesNotMatch(assets, /cm-agent-card--market-full/);
  assert.doesNotMatch(assets, /cm-market-control-rail--unified/);
  assert.match(assets, /<SearchFold/);
  assert.doesNotMatch(assets, /cm-control-rail cm-control-rail--compact/);
  assert.doesNotMatch(assets, /pb-20/);
});

test("fixed page shells keep whole-page canvases locked and move overflow into explicit lists", () => {
  const styles = read("src/styles/index.css");
  const shell = readFileSync(resolve(repo, "packages/theme/src/shell/shell.css"), "utf8");
  const agents = read("src/pages/agents.tsx");
  const models = read("src/pages/models.tsx");
  const registry = read("src/pages/registry.tsx");
  const assets = read("src/pages/my-assets.tsx");

  assert.match(styles, /\.cm-web-page__canvas\s*\{[\s\S]*overflow-y:\s*hidden/);
  assert.doesNotMatch(styles, /^\.cm-page-list\s*\{/m);
  assert.doesNotMatch(styles, /^\.cm-page-tab-panel\s*\{/m);
  assert.doesNotMatch(styles, /^\.cm-fold\s*\{/m);
  assert.match(shell, /\.cm-page-list\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(shell, /\.cm-page-tab-panel\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(shell, /\.cm-fold:not\(\[open\]\)\s*>\s*\.cm-fold__body\s*\{[\s\S]*display:\s*none/);
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

test("published theme sources keep generic primitives separate from product layouts", () => {
  const shell = readFileSync(resolve(repo, "packages/theme/src/shell/shell.css"), "utf8");
  const agents = readFileSync(resolve(repo, "packages/theme/src/agents/agents.css"), "utf8");
  const agentCard = readFileSync(resolve(repo, "web/src/styles/agent-card.css"), "utf8");
  const market = readFileSync(resolve(repo, "packages/theme/src/market/market.css"), "utf8");

  assert.match(shell, /#000 1\.5%, #000 95%/);
  assert.match(shell, /\.cm-shell-grid/);
  assert.match(shell, /\.cm-shell-split/);
  assert.match(shell, /\.cm-chip/);
  assert.match(shell, /\.cm-command-panel/);
  assert.doesNotMatch(shell, /\.cm-app-chrome/);
  assert.doesNotMatch(shell, /\.cm-playground__/);
  assert.doesNotMatch(shell, /clamp\(5\.(35|55)rem/);
  assert.match(market, /\.cm-page-header/);
  assert.match(market, /\.cm-market-agent-canvas/);
  assert.doesNotMatch(market, /\.cm-playground__/);
  assert.doesNotMatch(market, /\.cm-app-chrome/);
  assert.match(agentCard, /\.cm-agent-card--match-chat,\s*\n\.cm-agent-card--asset\s*\{[\s\S]*height:\s*100%/);
  assert.match(agentCard, /\.cm-agent-card--match-chat\s*\{[\s\S]*container-type:\s*inline-size/);
  assert.doesNotMatch(agentCard, /@container cm-agent-card \(max-height:\s*42rem\)/);
  assert.match(agentCard, /\.cm-agent-card--match-chat > \.cm-card__body\s*\{[\s\S]*align-content:\s*stretch/);
  assert.match(agents, /\.cm-agent-card__identity-meta\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(agents, /\.cm-agent-card__model\s*\{[\s\S]*max-width:\s*100%/);
  assert.match(agents, /\.cm-agent-card__model-name\s*\{[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(shell, /\.cm-control-search-fold/);
  assert.doesNotMatch(market, /cm-market-search-fold|cm-search--market/);
});
