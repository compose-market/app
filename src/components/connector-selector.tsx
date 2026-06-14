import { useState } from "react";
import { ShellModelBadge } from "@compose-market/theme/shell";
import { ConnectorCommandBar } from "@/components/connector-command-bar";
import { useRegistryServer, getOriginLabel, type RegistryServer } from "@/hooks/use-registry";
import { Loader2 } from "lucide-react";

interface ConnectorSelectorProps {
  value: string;
  onChange: (server: RegistryServer) => void;
  placeholder?: string;
  disabled?: boolean;
  selectedIds?: Set<string>;
  origin?: "onchain" | "mcp" | "onchain,mcp";
}

export function ConnectorSelector({
  value,
  onChange,
  placeholder = "Select connector...",
  disabled = false,
  selectedIds,
  origin,
}: ConnectorSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data: server, isLoading } = useRegistryServer(value ? value : null);

  const displayLabel = isLoading ? (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      Loading...
    </span>
  ) : server ? (
    server.name
  ) : (
    placeholder
  );

  return (
    <>
      <ShellModelBadge
        placeholder={!server}
        label={displayLabel}
        disabled={disabled || isLoading}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
      />
      <ConnectorCommandBar
        open={open}
        onOpenChange={setOpen}
        onSelect={onChange}
        selectedIds={selectedIds}
        origin={origin}
      />
    </>
  );
}
