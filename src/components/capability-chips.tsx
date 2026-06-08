/**
 * CapabilityChips — compact type/provider dropdowns
 *
 * Keeps the current chip/badge treatment, but moves long option sets into
 * dropdown windows so the toolbar never becomes a horizontal scroll rail.
 */
import {
  ChevronDown,
  Cpu,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelCategory } from "@/lib/models";
import { typeClass, typeIcon, typeLabel } from "@compose-market/theme/icons/react";

interface CapabilityChipsProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
  typeCategories: ModelCategory[];
  selectedProvider: string;
  onProviderChange: (provider: string) => void;
  providerCategories: ModelCategory[];
}

function compactProviderLabel(label: string): string {
  if (label === "All Providers") return "All";
  // Capitalize first letter
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function providerIcon() {
  return <Cpu className="cm-playground__chip-icon" />;
}

function categoryClass(cat: ModelCategory, variant: "type" | "provider", selected: boolean): string {
  return [
    "cm-playground__chip",
    variant === "type" ? typeClass(cat.id) : "cm-playground__chip--provider",
    selected ? "cm-playground__chip--active" : "",
  ].filter(Boolean).join(" ");
}

function triggerClass(variant: "type" | "provider"): string {
  return [
    "cm-playground__chip",
    "cm-playground__chip-trigger",
    `cm-playground__chip-trigger--${variant}`,
  ].join(" ");
}

function chipLabel(cat: ModelCategory, variant: "type" | "provider"): string {
  return variant === "type" ? typeLabel(cat.label) : compactProviderLabel(cat.label);
}

function ChipContent({
  cat,
  variant,
  label,
}: {
  cat: ModelCategory;
  variant: "type" | "provider";
  label?: string;
}) {
  return (
    <>
      {variant === "type" ? typeIcon(cat.id) : providerIcon()}
      <span className="cm-playground__chip-text">{label ?? chipLabel(cat, variant)}</span>
      <span className="cm-playground__chip-count">{cat.count}</span>
    </>
  );
}

function FilterDropdown({
  label,
  selected,
  categories,
  variant,
  onChange,
}: {
  label: "Type" | "Provider";
  selected: string;
  categories: ModelCategory[];
  variant: "type" | "provider";
  onChange: (value: string) => void;
}) {
  const fallback: ModelCategory = {
    id: "all",
    label: variant === "type" ? "All Models" : "All Providers",
    count: 0,
  };
  const selectedCat = categories.find((cat) => cat.id === selected) ?? categories[0] ?? fallback;
  const triggerLabel = selected === "all" ? label : chipLabel(selectedCat, variant);

  return (
    <DropdownMenu>
      <div className="cm-playground__chip-dropdown">
        <DropdownMenuTrigger asChild>
          <button
            className={triggerClass(variant)}
            type="button"
            aria-label={`${label}: ${triggerLabel}`}
          >
            <ChipContent cat={selectedCat} variant={variant} label={triggerLabel} />
            <ChevronDown className="cm-playground__chip-chevron" />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        align="start"
        className="cm-playground__chip-menu"
        sideOffset={8}
      >
        <div className="cm-playground__chip-menu-grid">
          {categories.map((cat) => {
            const isActive = selected === cat.id;
            return (
              <DropdownMenuItem
                key={`${variant}-${cat.id}`}
                aria-selected={isActive}
                className={categoryClass(cat, variant, isActive)}
                onSelect={() => onChange(cat.id)}
              >
                <ChipContent cat={cat} variant={variant} />
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CapabilityChips({
  selectedType,
  onTypeChange,
  typeCategories,
  selectedProvider,
  onProviderChange,
  providerCategories,
}: CapabilityChipsProps) {
  return (
    <div className="cm-playground__chips">
      <FilterDropdown
        label="Type"
        selected={selectedType}
        categories={typeCategories}
        variant="type"
        onChange={onTypeChange}
      />
      <div className="cm-playground__divider" />
      <FilterDropdown
        label="Provider"
        selected={selectedProvider}
        categories={providerCategories}
        variant="provider"
        onChange={onProviderChange}
      />
    </div>
  );
}
