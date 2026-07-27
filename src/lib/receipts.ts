const MICRO = 1_000_000;

export function weiToUsd(wei: string | number | null | undefined): number {
  const n = typeof wei === "number" ? wei : Number(wei ?? "0");
  if (!Number.isFinite(n)) return 0;
  return n / MICRO;
}

export const atomicToUsd = weiToUsd;

export function formatUsd(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value > 0) return `$${value.toFixed(6)}`;
  return "$0.00";
}

export function formatWeiUsd(wei: string | number | null | undefined): string {
  return formatUsd(weiToUsd(wei));
}

export function parseModelSubject(subject: string | undefined): { provider: string; modelId: string } {
  if (!subject) return { provider: "unknown", modelId: "unknown" };
  const idx = subject.indexOf(":");
  if (idx < 0) return { provider: "unknown", modelId: subject };
  return { provider: subject.slice(0, idx), modelId: subject.slice(idx + 1) };
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function shortTx(hash: string | undefined): string | null {
  if (!hash) return null;
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function settlementTone(status: string | undefined): "violet" | "amber" | "emerald" | "danger" {
  switch (status) {
    case "settled": return "emerald";
    case "claimed": return "violet";
    case "queued": return "amber";
    case "failed": return "danger";
    default: return "amber";
  }
}
