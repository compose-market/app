/**
 * CommandBar — ⌘K Model Selection Palette
 *
 * Full-screen overlay with fuzzy search, provider grouping,
 * keyboard navigation, and inline model metadata.
 *
 * Uses useModels hook (no extra fetches), renders via portal.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ShellCommandItem, ShellCommandOverlay, ShellCommandPanel } from "@compose-market/theme/shell";
import { useModels } from "@/hooks/use-model";
import { formatModelTypeLabel, getPrimaryModelType, getDefaultModelPricingSections, getModelTypeValues, getFamilyLogoUrl } from "@/lib/models";
import type { CatalogModel } from "@/lib/models";
import { typeIcon } from "@compose-market/theme/icons/react";

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSelect: (modelId: string) => void;
  type?: string;
  family?: string;
}

function formatPrice(model: CatalogModel): string {
  const sections = getDefaultModelPricingSections(model);
  if (sections.length === 0) return "—";

  for (const section of sections) {
    for (const entry of section.entries) {
      const label = entry.label.toLowerCase();
      if (label.includes("input") || label.includes("prompt") || label.includes("cost") || label.includes("generation") || label.includes("megapixel") || label.includes("second")) {
        const val = parseFloat(entry.value);
        if (val === 0) return "FREE";
        if (Number.isFinite(val)) {
          if (val < 0.001) return `$${val.toFixed(6)}`;
          if (val < 1) return `$${val.toFixed(4)}`;
          return `$${val.toFixed(2)}`;
        }
      }
    }
  }
  return "—";
}

/** Map family names to unique color pairs (background + text) */
const FAMILY_COLORS: Record<string, { bg: string; text: string }> = {
  google: { bg: "hsl(205 85% 50% / 0.2)", text: "hsl(205 85% 65%)" },
  openai: { bg: "hsl(160 70% 42% / 0.2)", text: "hsl(160 70% 58%)" },
  anthropic: { bg: "hsl(25 90% 55% / 0.2)", text: "hsl(25 90% 68%)" },
  meta: { bg: "hsl(215 90% 55% / 0.2)", text: "hsl(215 90% 68%)" },
  mistral: { bg: "hsl(340 75% 55% / 0.2)", text: "hsl(340 75% 70%)" },
  cohere: { bg: "hsl(270 75% 58% / 0.2)", text: "hsl(270 75% 72%)" },
  perplexity: { bg: "hsl(175 70% 45% / 0.2)", text: "hsl(175 70% 60%)" },
  deepseek: { bg: "hsl(195 80% 48% / 0.2)", text: "hsl(195 80% 62%)" },
  stability: { bg: "hsl(280 65% 55% / 0.2)", text: "hsl(280 65% 70%)" },
  "black-forest-labs": { bg: "hsl(45 80% 48% / 0.2)", text: "hsl(45 80% 62%)" },
  together: { bg: "hsl(310 70% 55% / 0.2)", text: "hsl(310 70% 70%)" },
  replicate: { bg: "hsl(10 80% 55% / 0.2)", text: "hsl(10 80% 68%)" },
  huggingface: { bg: "hsl(42 85% 50% / 0.2)", text: "hsl(42 85% 65%)" },
  groq: { bg: "hsl(138 65% 48% / 0.2)", text: "hsl(138 65% 62%)" },
  xai: { bg: "hsl(230 70% 58% / 0.2)", text: "hsl(230 70% 72%)" },
};

function getFamilyColor(family: string): { bg: string; text: string } {
  const key = family.toLowerCase();
  if (FAMILY_COLORS[key]) return FAMILY_COLORS[key];
  // Deterministic hash for unknown families
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 360;
  return {
    bg: `hsl(${hash} 60% 50% / 0.2)`,
    text: `hsl(${hash} 60% 65%)`,
  };
}

export function CommandBar({ open, onOpenChange, value, onSelect, type, family }: CommandBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { models } = useModels({});

  // Apply external + search filters
  const filteredModels = useMemo(() => {
    let result = models;

    if (type && type !== "all") {
      result = result.filter((m: CatalogModel) => getModelTypeValues(m).includes(type));
    }
    if (family && family !== "all") {
      result = result.filter((m: CatalogModel) => (m.family || m.provider) === family);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m: CatalogModel) =>
          m.modelId.toLowerCase().includes(q) ||
          (m.name || "").toLowerCase().includes(q) ||
          (m.family || m.provider).toLowerCase().includes(q) ||
          getPrimaryModelType(m).toLowerCase().includes(q)
      );
    }
    return result;
  }, [models, type, family, searchQuery]);

  // Group by family
  const grouped = useMemo(() => {
    const groups = new Map<string, CatalogModel[]>();
    for (const m of filteredModels) {
      const fam = m.family || m.provider;
      const g = groups.get(fam) || [];
      g.push(m);
      groups.set(fam, g);
    }
    // Sort groups by size descending
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredModels]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => grouped.flatMap(([, models]) => models), [grouped]);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, type, family]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-cmd-item]");
    const item = items[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatList[selectedIndex]) {
            onSelect(flatList[selectedIndex].modelId);
            onOpenChange(false);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [flatList, selectedIndex, onSelect, onOpenChange]
  );

  if (!open) return null;

  return createPortal(
    <ShellCommandOverlay open={open} onClose={() => onOpenChange(false)}>
      <ShellCommandPanel onKeyDown={handleKeyDown}>
        <div className="cm-command-header">
          <input
            ref={inputRef}
            className="cm-command-input"
            placeholder="Search models by name, family, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="cm-command-list" ref={listRef}>
          {flatList.length === 0 ? (
            <div className="cm-command-empty">No models match "{searchQuery}"</div>
          ) : (
            grouped.map(([familyName, familyModels]) => {
              const fColor = getFamilyColor(familyName);
              return (
              <div key={familyName}>
                <div className="cm-command-group" style={{ color: fColor.text, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  {(() => {
                    const logoUrl = getFamilyLogoUrl(familyName);
                    if (logoUrl) {
                      return <img src={logoUrl} alt={familyName} className="cm-family-icon" style={{ width: "0.85rem", height: "0.85rem", borderRadius: "2px" }} />;
                    }
                    return null;
                  })()}
                  <span>{familyName} ({familyModels.length})</span>
                </div>
                {familyModels.map((model) => {
                  const idx = flatList.indexOf(model);
                  const modelType = getPrimaryModelType(model);
                  const isSelected = idx === selectedIndex;
                  const isCurrent = model.modelId === value;

                  return (
                    <ShellCommandItem
                      key={model.modelId}
                      data-cmd-item
                      selected={isSelected}
                      current={isCurrent}
                      onClick={() => {
                        onSelect(model.modelId);
                        onOpenChange(false);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <span className="cm-command-item__name truncate mr-2">
                          {model.name || model.modelId}
                        </span>
                        <span className="inline-flex sm:hidden text-cyan-400 shrink-0 select-none scale-90">
                          {typeIcon(modelType)}
                        </span>
                      </div>
                      <div className="cm-command-item__meta hidden sm:flex">
                        <span
                          className="cm-command-item__family"
                          style={{ background: fColor.bg, color: fColor.text }}
                        >{model.provider}</span>
                        <span className="cm-command-item__type">
                          {formatModelTypeLabel(modelType)}
                        </span>
                        <span className="cm-command-item__price">{formatPrice(model)}</span>
                      </div>
                    </ShellCommandItem>
                  );
                })}
              </div>
            );
            })
          )}
        </div>

        <div className="cm-command-footer">
          <span>
            {filteredModels.length} of {models.length} models
          </span>
          <div className="cm-command-footer__hints">
            <span className="cm-command-hint">
              <kbd>↑↓</kbd> navigate
            </span>
            <span className="cm-command-hint">
              <kbd>↵</kbd> select
            </span>
            <span className="cm-command-hint">
              <kbd>esc</kbd> close
            </span>
          </div>
        </div>
      </ShellCommandPanel>
    </ShellCommandOverlay>,
    document.body
  );
}
