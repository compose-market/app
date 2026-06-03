/**
 * ModelBadge — Shows model name + capability tags (colored) + price
 * Capabilities shown as inline colored mini-tags (text, image, audio, etc.)
 */
import { ShellModelBadge } from "@compose-market/theme/shell";
import { getDefaultModelPricingSections } from "@/lib/models";
import type { CatalogModel } from "@/lib/models";

interface ModelBadgeProps {
  model: CatalogModel | null;
  onClick: () => void;
}

function formatBadgePrice(model: CatalogModel): string {
  const sections = getDefaultModelPricingSections(model);
  if (sections.length === 0) return "—";
  for (const section of sections) {
    for (const entry of section.entries) {
      const label = entry.label.toLowerCase();
      if (label.includes("input") || label.includes("prompt") || label.includes("cost") || label.includes("generation") || label.includes("megapixel") || label.includes("second")) {
        const val = parseFloat(entry.value);
        if (val === 0) return "FREE";
        if (Number.isFinite(val)) {
          if (val < 0.001) return `$${val.toFixed(5)}`;
          if (val < 1) return `$${val.toFixed(3)}`;
          return `$${val.toFixed(2)}`;
        }
      }
    }
  }
  return "—";
}

export function ModelBadge({ model, onClick }: ModelBadgeProps) {
  if (!model) {
    return (
      <ShellModelBadge
        label="Select model..."
        shortcut="⌘K"
        placeholder
        onClick={onClick}
      />
    );
  }

  const price = formatBadgePrice(model);

  return (
    <ShellModelBadge
      label={model.name || model.modelId}
      price={price}
      shortcut="⌘K"
      onClick={onClick}
      title={`${model.modelId} · ${model.provider}`}
    />
  );
}
