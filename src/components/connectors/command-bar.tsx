import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ShellCommandItem, ShellCommandOverlay, ShellCommandPanel } from "@compose-market/theme/shell";
import { useRegistryServers, useRegistrySearch, type RegistryServer, type ServerOrigin } from "@/hooks/use-registry";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Play } from "lucide-react";

interface ConnectorCommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (server: RegistryServer) => void;
  selectedIds?: Set<string>;
  origin?: "onchain" | "mcp" | "onchain,mcp";
}

function getOriginStyles(origin: ServerOrigin): { bg: string; text: string; label: string } {
  switch (origin) {
    case "onchain":
      return { bg: "hsl(142 70% 45% / 0.15)", text: "hsl(142 70% 55%)", label: "Onchain" };
    case "mcp":
      return { bg: "hsl(190 80% 48% / 0.15)", text: "hsl(190 80% 60%)", label: "MCPs" };
    default:
      return { bg: "hsl(215 15% 30% / 0.15)", text: "hsl(215 15% 60%)", label: String(origin) };
  }
}

export function ConnectorCommandBar({
  open,
  onOpenChange,
  onSelect,
  selectedIds = new Set(),
  origin = "onchain,mcp",
}: ConnectorCommandBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: defaultData, isLoading: isLoadingDefault } = useRegistryServers({
    origin,
  });

  const connectorSearchReady = searchQuery.trim().length >= 2;
  const { data: searchData, isLoading: isSearching } = useRegistrySearch(searchQuery, 50, {
    origin,
    enabled: open && connectorSearchReady,
  });

  const availableConnectors = useMemo(() => {
    return connectorSearchReady ? searchData?.servers ?? [] : defaultData?.servers ?? [];
  }, [defaultData, connectorSearchReady, searchData]);

  const isLoading = connectorSearchReady ? isSearching && availableConnectors.length === 0 : isLoadingDefault;

  // Group by origin
  const grouped = useMemo(() => {
    const groups = new Map<ServerOrigin, RegistryServer[]>();
    for (const p of availableConnectors) {
      const g = groups.get(p.origin) || [];
      g.push(p);
      groups.set(p.origin, g);
    }
    return Array.from(groups.entries());
  }, [availableConnectors]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Focus input when opened
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
          const target = flatList[selectedIndex];
          if (target && !selectedIds.has(target.registryId)) {
            onSelect(target);
            onOpenChange(false);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [flatList, selectedIndex, onSelect, onOpenChange, selectedIds]
  );

  if (!open) return null;

  return createPortal(
    <ShellCommandOverlay open={open} onClose={() => onOpenChange(false)}>
      <ShellCommandPanel onKeyDown={handleKeyDown}>
        <div className="cm-command-header">
          <input
            ref={inputRef}
            className="cm-command-input"
            placeholder="Search connectors by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="cm-command-list" ref={listRef}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : flatList.length === 0 ? (
            <div className="cm-command-empty">No connectors match "{searchQuery}"</div>
          ) : (
            grouped.map(([groupOrigin, originConnectors]) => {
              const styles = getOriginStyles(groupOrigin);
              return (
                <div key={groupOrigin}>
                  <div className="cm-command-group" style={{ color: styles.text }}>
                    {styles.label} Connectors ({originConnectors.length})
                  </div>
                  {originConnectors.map((connector) => {
                    const idx = flatList.indexOf(connector);
                    const isSelected = idx === selectedIndex;
                    const isAdded = selectedIds.has(connector.registryId);

                    return (
                      <ShellCommandItem
                        key={connector.registryId}
                        data-cmd-item
                        selected={isSelected}
                        current={isAdded}
                        onClick={() => {
                          if (!isAdded) {
                            onSelect(connector);
                            onOpenChange(false);
                          }
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{ opacity: isAdded ? 0.6 : 1 }}
                      >
                        <div className="flex flex-col min-w-0 flex-1 py-0.5">
                          <span className="cm-command-item__name font-mono text-xs truncate">
                            {connector.name || connector.slug}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[28rem] mt-0.5">
                            {connector.description || "No description available"}
                          </span>
                        </div>
                        <div className="cm-command-item__meta shrink-0">
                          {connector.origin === "onchain" && (
                            <Badge
                              variant="outline"
                              className="text-[8px] border-cyan-500/30 text-cyan-400 px-1 py-0"
                            >
                              <Play className="w-2 h-2 mr-0.5" /> Testable
                            </Badge>
                          )}
                          <span
                            className="cm-command-item__provider uppercase"
                            style={{ background: styles.bg, color: styles.text }}
                          >
                            {styles.label}
                          </span>
                          {isAdded && (
                            <span className="text-green-400 flex items-center text-[10px] font-mono shrink-0 ml-1">
                              <Check className="w-3.5 h-3.5 mr-0.5" /> Added
                            </span>
                          )}
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
            {flatList.length} connectors available
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
