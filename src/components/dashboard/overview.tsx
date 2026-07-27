import { DollarSign, Receipt, Coins, TrendingUp } from "lucide-react";
import type { Summary } from "@/lib/analytics";
import { formatUsd } from "@/lib/receipts";

export function OverviewCards({ summary }: { summary: Summary }) {
  const avgPerCall = summary.requestCount > 0 ? summary.totalUsd / summary.requestCount : 0;

  const cards: Array<{
    label: string;
    icon: typeof DollarSign;
    value: string;
    sub: string;
    tone?: "primary" | "accent";
  }> = [
    {
      label: "Total Spent",
      icon: DollarSign,
      value: formatUsd(summary.totalUsd),
      sub: `${summary.requestCount} requests`,
      tone: "primary",
    },
    {
      label: "Inference Cost",
      icon: Coins,
      value: formatUsd(summary.inferenceUsd),
      sub: "Model inference",
    },
    {
      label: "Platform Fees",
      icon: Receipt,
      value: formatUsd(summary.platformFeeUsd),
      sub: "Settled fees",
      tone: "accent",
    },
    {
      label: "Avg / Request",
      icon: TrendingUp,
      value: formatUsd(avgPerCall),
      sub: `${summary.modelUsage.length} models used`,
    },
  ];

  return (
    <div className="cm-overview-grid">
      {cards.map((card) => (
        <div key={card.label} className="cm-stat-card">
          <span className="cm-stat-card__label">
            <card.icon className="cm-stat-card__label-icon" />
            {card.label}
          </span>
          <span className="cm-stat-card__value" data-tone={card.tone}>
            {card.value}
          </span>
          <span className="cm-stat-card__sub">{card.sub}</span>
        </div>
      ))}
    </div>
  );
}
