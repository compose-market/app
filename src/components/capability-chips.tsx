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
import { type ModelCategory, getFamilyLogoUrl } from "@/lib/models";
import { typeClass, typeIcon, typeLabel } from "@compose-market/theme/icons/react";

interface CapabilityChipsProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
  typeCategories: ModelCategory[];
  selectedFamily: string;
  onFamilyChange: (family: string) => void;
  familyCategories: ModelCategory[];
}

function compactFamilyLabel(label: string): string {
  if (label === "All Families") return "All";
  // Capitalize first letter
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function familyIcon(familyId: string) {
  const logoUrl = getFamilyLogoUrl(familyId);
  if (logoUrl) {
    return <img src={logoUrl} alt={familyId} className="cm-family-icon" />;
  }
  return <Cpu className="cm-type-icon" />;
}

function categoryClass(cat: ModelCategory, variant: "type" | "family", selected: boolean): string {
  return [
    "cm-chip",
    "cm-playground__chip-option",
    variant === "type" ? typeClass(cat.id) : "cm-playground__chip--family",
    selected ? "cm-chip--active" : "",
  ].filter(Boolean).join(" ");
}

function triggerClass(variant: "type" | "family"): string {
  return [
    "cm-chip",
    "cm-playground__chip-trigger",
    `cm-playground__chip-trigger--${variant}`,
  ].join(" ");
}

function chipLabel(cat: ModelCategory, variant: "type" | "family"): string {
  return variant === "type" ? typeLabel(cat.label) : compactFamilyLabel(cat.label);
}

function ChipContent({
  cat,
  variant,
  label,
}: {
  cat: ModelCategory;
  variant: "type" | "family";
  label?: string;
}) {
  return (
    <>
      {variant === "type" ? typeIcon(cat.id) : familyIcon(cat.id)}
      <span className="cm-chip__text">{label ?? chipLabel(cat, variant)}</span>
      <span className="cm-chip__count">{cat.count}</span>
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
  label: "Type" | "Family";
  selected: string;
  categories: ModelCategory[];
  variant: "type" | "family";
  onChange: (value: string) => void;
}) {
  const fallback: ModelCategory = {
    id: "all",
    label: variant === "type" ? "All Models" : "All Families",
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
                data-active={isActive ? "true" : undefined}
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
  selectedFamily,
  onFamilyChange,
  familyCategories,
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
        label="Family"
        selected={selectedFamily}
        categories={familyCategories}
        variant="family"
        onChange={onFamilyChange}
      />
    </div>
  );
}
