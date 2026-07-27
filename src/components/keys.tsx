/**
 * API Keys — key management UI for the /keys page.
 *
 * Lists all keys (session + API), supports creating new API keys
 * with custom name/budget/duration, and revoking keys. Uses sdk.keys.*
 * which only requires the unsigned x-session-user-address header for
 * list/create, and any key JWT for revoke.
 */

import { useState, useCallback } from "react";
import { Check, Copy, Key, Plus, RefreshCw, Trash2, Zap, Clock } from "lucide-react";
import { useKeys, type KeyRecord } from "@/hooks/use-keys";
import { useWalletAccount } from "@/components/connector";
import { useChain } from "@/contexts/Network";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatWeiUsd, timeAgo } from "@/lib/receipts";

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function budgetPercent(key: KeyRecord): number {
  const limit = Number(key.budgetLimit || "0");
  if (limit <= 0) return 0;
  const used = Number(key.budgetUsed || "0");
  return Math.min(100, Math.round((used / limit) * 100));
}

function budgetTone(key: KeyRecord): "ok" | "low" | "depleted" {
  const remaining = Number(key.budgetRemaining || "0");
  const limit = Number(key.budgetLimit || "1");
  const pct = remaining / limit;
  if (pct <= 0) return "depleted";
  if (pct < 0.15) return "low";
  return "ok";
}

function keyStatus(key: KeyRecord): "active" | "expired" | "revoked" {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt <= Date.now()) return "expired";
  return "active";
}

export function ApiKeysPanel() {
  const { keys, activeKeys, isLoading, isRefetching, forceRefresh, revokeKey, isRevoking } = useKeys();
  const { isConnected } = useWalletAccount();
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const handleCopy = useCallback(async (keyId: string) => {
    await navigator.clipboard.writeText(`inference-${keyId.slice(0, 8)}***`);
    setCopiedKeyId(keyId);
    toast.success("Key ID copied");
    setTimeout(() => setCopiedKeyId(null), 2000);
  }, []);

  const handleRevoke = useCallback(async (keyId: string) => {
    try {
      await revokeKey(keyId);
      toast.success("Key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  }, [revokeKey]);

  if (!isConnected) {
    return (
      <div className="cm-keys-page">
        <KeysHeader onRefresh={() => void forceRefresh()} isRefetching={isRefetching} onCreate={() => setCreateOpen(true)} />
        <div className="cm-dashboard__empty">
          <Key className="cm-dashboard__empty-icon" />
          <span className="cm-dashboard__empty-title">Connect your wallet</span>
          <span className="cm-dashboard__empty-text">
            Connect your wallet to manage your API keys for external tools.
          </span>
        </div>
      </div>
    );
  }

  if (isLoading && keys.length === 0) {
    return (
      <div className="cm-keys-page">
        <KeysHeader onRefresh={() => void forceRefresh()} isRefetching={isRefetching} onCreate={() => setCreateOpen(true)} />
        <div className="cm-dashboard__empty">
          <Key className="cm-dashboard__empty-icon animate-pulse" />
          <span className="cm-dashboard__empty-text">Loading keys…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-keys-page">
      <KeysHeader
        onRefresh={() => void forceRefresh()}
        isRefetching={isRefetching}
        onCreate={() => setCreateOpen(true)}
        activeCount={activeKeys.length}
      />

      {keys.length === 0 ? (
        <div className="cm-dashboard__empty">
          <Key className="cm-dashboard__empty-icon" />
          <span className="cm-dashboard__empty-title">No API keys yet</span>
          <span className="cm-dashboard__empty-text">
            Create an API key to use compose.market's models from external tools like Cursor, OpenCode, or any OpenAI-compatible client.
          </span>
          <Button onClick={() => setCreateOpen(true)} className="cm-shell-button cm-shell-button--primary" style={{ marginTop: "0.5rem" }}>
            <Plus className="w-4 h-4" />
            Create Key
          </Button>
        </div>
      ) : (
        <div className="cm-keys-list">
          {keys.map((key) => {
            const status = keyStatus(key);
            const tone = budgetTone(key);
            const pct = budgetPercent(key);
            return (
              <div key={key.keyId} className="cm-key-card" data-status={status}>
                <div className="cm-key-card__icon" data-purpose={key.purpose}>
                  {key.purpose === "session" ? <Zap className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                </div>
                <div className="cm-key-card__body">
                  <div className="cm-key-card__top">
                    <span className="cm-key-card__name">{key.name || "Unnamed Key"}</span>
                    <span className="cm-key-card__purpose" data-purpose={key.purpose}>
                      {key.purpose}
                    </span>
                    <span className="cm-key-card__id">inference-{key.keyId.slice(0, 8)}***</span>
                  </div>
                  <div className="cm-key-card__meta">
                    <span className="cm-key-card__budget">
                      {formatWeiUsd(key.budgetRemaining)} / {formatWeiUsd(key.budgetLimit)}
                      <span className="cm-key-card__budget-bar">
                        <span
                          className="cm-key-card__budget-fill"
                          data-tone={tone === "ok" ? undefined : tone}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </span>
                    <span className="cm-key-card__status" data-status={status}>
                      {status === "active" && (
                        <>
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeRemaining(key.expiresAt)}
                        </>
                      )}
                      {status === "expired" && "Expired"}
                      {status === "revoked" && "Revoked"}
                    </span>
                    <span>Created {timeAgo(key.createdAt)}</span>
                    {key.lastUsedAt && <span>Last used {timeAgo(key.lastUsedAt)}</span>}
                  </div>
                </div>
                <div className="cm-key-card__actions">
                  <button
                    className="cm-key-card__action"
                    onClick={() => void handleCopy(key.keyId)}
                    title="Copy key ID"
                    aria-label="Copy key ID"
                  >
                    {copiedKeyId === key.keyId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {status === "active" && (
                    <button
                      className="cm-key-card__action"
                      data-action="revoke"
                      onClick={() => void handleRevoke(key.keyId)}
                      disabled={isRevoking}
                      title="Revoke key"
                      aria-label="Revoke key"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function KeysHeader({
  onRefresh,
  isRefetching,
  onCreate,
  activeCount,
}: {
  onRefresh: () => void;
  isRefetching: boolean;
  onCreate: () => void;
  activeCount?: number;
}) {
  return (
    <div className="cm-keys-header">
      <div className="cm-keys-header__title">
        <Key className="cm-keys-header__title-icon" />
        <span>API Keys</span>
        {activeCount !== undefined && activeCount > 0 && (
          <span className="cm-stat-card__sub" style={{ fontSize: "0.65rem" }}>
            {activeCount} active
          </span>
        )}
      </div>
      <div className="cm-keys-header__actions">
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isRefetching}
          className="cm-shell-button cm-shell-button--ghost cm-shell-button--icon"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={onCreate} className="cm-shell-button cm-shell-button--primary" size="sm">
          <Plus className="w-4 h-4" />
          New Key
        </Button>
      </div>
    </div>
  );
}

const BUDGET_PRESETS = [
  { label: "$1", value: "1" },
  { label: "$10", value: "10" },
  { label: "$50", value: "50" },
  { label: "$100", value: "100" },
];

const DURATION_PRESETS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

function CreateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { createKey, isCreating, createdToken, createdKeyId, clearCreatedToken, createError, budgetPresets } = useKeys();
  const { paymentNetwork, getChainByNetworkId } = useChain();
  const currentChain = getChainByNetworkId(paymentNetwork);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("10");
  const [duration, setDuration] = useState(24);
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    await createKey({
      name: name.trim(),
      budgetUsd: budget,
      durationHours: duration,
      network: paymentNetwork,
    });
  }, [createKey, name, budget, duration, paymentNetwork]);

  const handleCopyToken = useCallback(async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
    toast.success("API key copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [createdToken]);

  const handleClose = useCallback((next: boolean) => {
    onOpenChange(next);
    if (!next) {
      clearCreatedToken();
      setName("");
      setCopied(false);
    }
  }, [onOpenChange, clearCreatedToken]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="cm-dialog-panel max-w-md border-violet-500/30 bg-background/95 p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-violet-300 flex items-center gap-2 text-base">
            <Key className="h-5 w-5" />
            {createdToken ? "Key Created" : "Create API Key"}
          </DialogTitle>
        </DialogHeader>

        {createdToken ? (
          <div className="cm-created-token">
            <span className="cm-created-token__warning">
              Save this key now. You won't be able to see it again.
            </span>
            <code className="cm-created-token__value">{createdToken}</code>
            <div className="cm-created-token__usage">
              Usage: <code>Authorization: Bearer {createdToken.slice(0, 20)}...</code>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
              <Button onClick={() => void handleCopyToken()} className="cm-shell-button cm-shell-button--primary" size="sm" style={{ flex: 1 }}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Key"}
              </Button>
              <Button onClick={() => handleClose(false)} className="cm-shell-button cm-shell-button--secondary" size="sm">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div className="cm-create-key__field">
              <label className="cm-create-key__label">Key Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Cursor, OpenCode, Production"
                className="cm-shell-input"
              />
            </div>

            <div className="cm-create-key__field">
              <label className="cm-create-key__label">Budget (USDC)</label>
              <div className="cm-create-key__choices">
                {BUDGET_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className="cm-create-key__choice"
                    data-active={budget === preset.value}
                    onClick={() => setBudget(preset.value)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cm-create-key__field">
              <label className="cm-create-key__label">Duration</label>
              <div className="cm-create-key__choices">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.hours}
                    className="cm-create-key__choice"
                    data-active={duration === preset.hours}
                    onClick={() => setDuration(preset.hours)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cm-create-key__summary">
              <div className="cm-create-key__summary-row">
                <span>Max Spend</span>
                <strong>${budget}.00 USDC</strong>
              </div>
              <div className="cm-create-key__summary-row">
                <span>Expires After</span>
                <strong>{duration >= 24 ? `${Math.floor(duration / 24)}d` : `${duration}h`}</strong>
              </div>
              <div className="cm-create-key__summary-row">
                <span>Chain</span>
                <strong>{currentChain?.name || paymentNetwork}</strong>
              </div>
            </div>

            {createError && (
              <div className="cm-create-key__summary" style={{ borderColor: "hsl(0 72% 51% / 0.3)", background: "hsl(0 72% 51% / 0.05)" }}>
                <span style={{ color: "hsl(0 72% 55%)", fontSize: "0.66rem" }}>{createError}</span>
              </div>
            )}

            <Button
              onClick={() => void handleCreate()}
              disabled={isCreating || !name.trim()}
              className="cm-shell-button cm-shell-button--primary"
              style={{ width: "100%" }}
            >
              {isCreating ? "Creating..." : "Create Key"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
