import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ArrowUpDown, ArrowDown, ArrowUp, Check } from "lucide-react";
import type { ModelUsage } from "@/lib/analytics";
import { formatUsd } from "@/lib/receipts";
import { getFamilyLogoUrl, formatModelTypeLabel } from "@/lib/models";

type SortKey = "totalUsd" | "calls" | "lastUsed" | "totalTokens" | "type";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "totalUsd", label: "Cost" },
  { key: "calls", label: "Calls" },
  { key: "totalTokens", label: "Tokens" },
  { key: "lastUsed", label: "Recent" },
  { key: "type", label: "Type" },
];

function SortDropdown({
  sortKey,
  sortDir,
  onChange,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onChange: (key: SortKey, dir: SortDir) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Cost";

  return (
    <div className="cm-sort-dropdown" ref={ref}>
      <button
        type="button"
        className="cm-sort-dropdown__trigger"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
      >
        <span>{currentLabel}</span>
        <ArrowUpDown className="cm-sort-dropdown__icon" />
      </button>
      {open && (
        <div className="cm-sort-dropdown__menu" onClick={(e) => e.stopPropagation()}>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className="cm-sort-dropdown__option"
              data-selected={sortKey === option.key}
              onClick={() => {
                if (sortKey === option.key) {
                  onChange(option.key, sortDir === "desc" ? "asc" : "desc");
                } else {
                  onChange(option.key, "desc");
                }
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {sortKey === option.key ? (
                sortDir === "desc" ? (
                  <ArrowDown className="cm-sort-dropdown__option-dir" />
                ) : (
                  <ArrowUp className="cm-sort-dropdown__option-dir" />
                )
              ) : (
                <span className="cm-sort-dropdown__option-dir" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModelUsageTable({
  models,
  focused = false,
  dataBlock,
  onClick,
}: {
  models: ModelUsage[];
  focused?: boolean;
  dataBlock?: string;
  onClick?: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("totalUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSortChange = useCallback((key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  const sorted = useMemo(() => {
    const arr = [...models];
    arr.sort((a, b) => {
      let cmp: number;
      switch (sortKey) {
        case "calls":
          cmp = a.calls - b.calls;
          break;
        case "lastUsed":
          cmp = a.lastUsed - b.lastUsed;
          break;
        case "totalTokens":
          cmp = a.totalTokens - b.totalTokens;
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        default:
          cmp = a.totalUsd - b.totalUsd;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [models, sortKey, sortDir]);

  const visible = focused ? sorted : sorted.slice(0, 5);

  return (
    <div className="cm-block" data-block={dataBlock} data-focused={focused} onClick={onClick}>
      <div className="cm-block__header">
        <span className="cm-block__title">Model Usage</span>
        <div onClick={(e) => e.stopPropagation()}>
          <SortDropdown sortKey={sortKey} sortDir={sortDir} onChange={handleSortChange} />
        </div>
      </div>
      {models.length === 0 ? (
        <div className="cm-block__empty">No model usage recorded yet</div>
      ) : (
        <div className="cm-block__body">
          <table className="cm-usage-table">
            <thead>
              <tr>
                <th>Model</th>
                <th data-align="right">Cost</th>
                <th data-align="right">Calls</th>
                {focused && <th data-align="right">Tokens</th>}
                {focused && <th>Type</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((model) => {
                const logoUrl = getFamilyLogoUrl(model.family);
                return (
                  <tr key={model.subject}>
                    <td>
                      <span className="cm-usage-model">
                        {logoUrl && (
                          <img
                            src={logoUrl}
                            alt={model.family}
                            className="cm-usage-model__icon"
                          />
                        )}
                        <span className="cm-usage-model__name">
                          <span className="cm-usage-model__id">{model.modelId}</span>
                           <span className="cm-usage-model__provider">{model.family}</span>
                        </span>
                      </span>
                    </td>
                    <td data-align="right" className="cm-usage-cost">
                      {formatUsd(model.totalUsd)}
                    </td>
                    <td data-align="right">{model.calls}</td>
                    {focused && (
                      <td data-align="right">
                        {model.totalTokens > 0
                          ? model.totalTokens >= 1000
                            ? `${(model.totalTokens / 1000).toFixed(1)}k`
                            : String(model.totalTokens)
                          : "—"}
                      </td>
                    )}
                    {focused && (
                      <td>
                        <span className="cm-usage-modality" data-tone={model.type}>
                          {formatModelTypeLabel(model.type)}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
