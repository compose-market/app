import { Copy, Cpu, DollarSign, ExternalLink, Globe, Package, Zap, ArrowRightLeft, Check, CheckCircle2, Eye, Layers, Shield, Star } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  ComposeAgentCard as ThemeAgentCard,
  ComposeAgentCardSkeleton as ThemeAgentCardSkeleton,
  type ComposeAgentBadge as AgentBadge,
  type ComposeAgentMetric as AgentMetric,
  type ComposeAgentTag as AgentTag,
} from "@compose-market/theme/agents";
import { ShellButton } from "@compose-market/theme/shell";
import { useLocation } from "wouter";
import { usePostHog } from "@posthog/react";
import { getIpfsUrl } from "@/lib/pinata";
import type { OnchainAgent } from "@/hooks/use-onchain";
import { useIsExternalWarped } from "@/hooks/use-warp";
import {
  AGENT_REGISTRIES,
  formatInteractions,
  getReadmeExcerpt,
  type Agent,
} from "@/lib/agents";
import { CHAIN_CONFIG } from "@/lib/performance/chains-data";
import { getContractAddress } from "@/lib/contracts";
import { API_BASE_URL } from "@/lib/sdk";

export interface AgentCardProps {
  agent: OnchainAgent;
  onCopyEndpoint?: () => void;
  onOpen?: () => void;
  className?: string;
}

export interface DiscoveryAgent extends Agent {
  price?: string;
  units?: string;
  cloneable?: boolean;
  isClone?: boolean;
  isWarped?: boolean;
  walletAddress?: string;
}

export interface DiscoveryAgentCardProps {
  agent: DiscoveryAgent;
  onSelect: (agent: Agent) => void;
  className?: string;
}

function initials(value: string): string {
  return value
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function resolveAvatarUrl(agent: OnchainAgent): string | null {
  const image = agent.metadata?.image;
  if (!image || image === "none") {
    return null;
  }
  if (image.startsWith("ipfs://")) {
    return getIpfsUrl(image.replace("ipfs://", ""));
  }
  return image.startsWith("https://") ? image : null;
}

function badge(agent: OnchainAgent): string {
  const chainId = chain(agent);
  const chainInfo = conf(chainId);
  if (chainInfo) {
    return chainInfo.name;
  }
  return typeof chainId === "number" ? `Chain ${chainId}` : "Unknown Chain";
}

function buildBadges(agent: OnchainAgent): AgentBadge[] {
  const badges: AgentBadge[] = [
    {
      label: "Verified",
      tone: "green",
    },
    {
      label: "Manowar",
      tone: "warning",
      icon: <Zap size={12} />,
    },
    {
      label: badge(agent),
      tone: "cyan",
      icon: <Globe size={12} />,
    },
  ];

  if (agent.cloneable) {
    badges.splice(1, 0, {
      label: "Cloneable",
      tone: "fuchsia",
    });
  }

  return badges;
}

function chain(agent: OnchainAgent): number | undefined {
  const value = agent.metadata?.chain;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function conf(chainId: number | undefined): (typeof CHAIN_CONFIG)[number] | undefined {
  return typeof chainId === "number" && Object.prototype.hasOwnProperty.call(CHAIN_CONFIG, chainId)
    ? CHAIN_CONFIG[chainId]
    : undefined;
}

function short(value: string | undefined, head = 5, tail = 5): string {
  return value && value.length > head + tail + 3
    ? `${value.slice(0, head)}...${value.slice(-tail)}`
    : value || "Unknown";
}

function route(value: string | undefined): string {
  return value ? `${API_BASE_URL.replace(/^https?:\/\//, "")}/agent/${value.slice(0, 5)}...` : "Unavailable";
}

function token(agent: OnchainAgent, chainId: number | undefined): string | null {
  const chainInfo = conf(chainId);
  if (!chainInfo || agent.id <= 0 || typeof chainId !== "number") {
    return null;
  }
  try {
    return `${chainInfo.explorer}/token/${getContractAddress("AgentFactory", chainId)}?a=${agent.id}`;
  } catch {
    return null;
  }
}

function buildMetrics(agent: OnchainAgent): AgentMetric[] {
  const licenses = agent.licenses === 0 ? "∞" : `${agent.licensesAvailable}/${agent.licenses}`;

  return [
    {
      label: "License Price",
      value: agent.licensePriceFormatted,
      icon: <DollarSign size={16} />,
      tone: "green",
    },
    {
      label: "Licenses",
      value: licenses,
      icon: <Package size={16} />,
      tone: "cyan",
    },
    {
      label: "Creator Fee",
      value: `${agent.creatorFee ?? agent.metadata?.creatorFee ?? 1}%`,
      icon: <DollarSign size={16} />,
      tone: "green",
    },
  ];
}

function buildTags(agent: OnchainAgent): AgentTag[] {
  const plugins = agent.metadata?.plugins || [];
  if (plugins.length === 0) {
    return [{ label: "No tools", title: "No tools registered" }];
  }
  return plugins.map((plugin) => ({
    label: plugin.name || plugin.registryId,
    title: plugin.origin || plugin.registryId,
  }));
}

export function AgentCard({ agent, onCopyEndpoint, onOpen, className }: AgentCardProps) {
  const name = agent.metadata?.name || (agent.walletAddress ? short(agent.walletAddress) : `Agent ${agent.id}`);
  const address = agent.walletAddress ? short(agent.walletAddress) : null;
  const model = agent.metadata?.model || "Unknown";
  const chainId = chain(agent);
  const chainInfo = conf(chainId);
  const tokenUrl = token(agent, chainId);
  const avatarUrl = resolveAvatarUrl(agent);
  const apiEndpoint = agent.walletAddress ? `${API_BASE_URL}/agent/${agent.walletAddress}` : null;

  const stop = (event: MouseEvent | KeyboardEvent): void => {
    event.stopPropagation();
  };

  const handleCopyEndpoint = async (): Promise<void> => {
    if (!apiEndpoint) {
      return;
    }
    await navigator.clipboard.writeText(apiEndpoint);
    onCopyEndpoint?.();
  };

  return (
    <ThemeAgentCard
      interactive
      className={className}
      role={onOpen ? "link" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open ${name}` : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
        }
      } : undefined}
      avatarAlt={name}
      avatarFallback={initials(name)}
      avatarSrc={avatarUrl}
      title={(
        <span className="cm-agent-card__identity">
          <span className="cm-agent-card__identity-head">
            <span className="cm-agent-card__identity-name">{name}</span>
            {address ? <span className="cm-agent-card__identity-address">{address}</span> : null}
          </span>
          <span className="cm-agent-card__model" title={model}>
            <Cpu size={11} />
            <span className="cm-agent-card__model-name">{model}</span>
          </span>
        </span>
      )}
      description={agent.metadata?.description || "No description available"}
      badges={buildBadges(agent)}
      metrics={buildMetrics(agent)}
      tagsTitle={`Tools (${agent.metadata?.plugins?.length || 0})`}
      tags={buildTags(agent)}
      headerAction={tokenUrl ? (
        <ShellButton
          tone="ghost"
          size="sm"
          iconOnly
          onClick={(event) => {
            event.stopPropagation();
            window.open(tokenUrl, "_blank");
          }}
          aria-label="View on Explorer"
          title="View on Explorer"
        >
          <ExternalLink size={16} />
        </ShellButton>
      ) : undefined}
      footer={apiEndpoint ? (
        <div className="cm-agent-card__footer-stack">
          <div className="cm-agent-card__endpoint">
            <div className="cm-agent-card__endpoint-label">A2A Endpoint</div>
            <div
              role="button"
              tabIndex={0}
              className="cm-agent-card__endpoint-row"
              onClick={(event) => {
                stop(event);
                void handleCopyEndpoint();
              }}
              onKeyDown={(event) => {
                stop(event);
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void handleCopyEndpoint();
                }
              }}
              title={apiEndpoint}
            >
              <code className="cm-agent-card__endpoint-code">{route(agent.walletAddress)}</code>
              <ShellButton
                tone="ghost"
                size="sm"
                iconOnly
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCopyEndpoint();
                }}
                aria-label="Copy endpoint"
              >
                <Copy size={14} />
              </ShellButton>
            </div>
          </div>
          <div className="cm-agent-card__creator">
            <div className="cm-agent-card__creator-label">Creator</div>
            {chainInfo?.explorer && agent.creator ? (
              <a
                href={`${chainInfo.explorer}/address/${agent.creator}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cm-agent-card__creator-value"
                onClick={(event) => event.stopPropagation()}
              >
                {short(agent.creator)}
              </a>
            ) : (
              <span className="cm-agent-card__creator-value">{short(agent.creator)}</span>
            )}
          </div>
        </div>
      ) : null}
    />
  );
}

function discoveryBadges(
  agent: DiscoveryAgent,
  registry: string,
  warped: boolean | undefined,
): AgentBadge[] {
  const badges: AgentBadge[] = [
    {
      label: registry,
      tone: agent.registry === "manowar" ? "cyan" : "fuchsia",
      icon: agent.registry === "manowar" ? <Globe size={12} /> : undefined,
    },
  ];

  if (agent.registry === "manowar") {
    badges.push({ label: "On-chain", tone: "cyan", icon: <Zap size={12} /> });
  }
  if (warped) {
    badges.push({ label: "Warped", tone: "fuchsia", icon: <ArrowRightLeft size={12} /> });
  }
  if (agent.verified) {
    badges.push({ label: "Verified", tone: "green", icon: <Shield size={12} /> });
  }
  if (agent.featured) {
    badges.push({ label: "Featured", tone: "warning", icon: <Star size={12} /> });
  }
  if (agent.cloneable) {
    badges.push({ label: "Cloneable", tone: "fuchsia" });
  }
  if (agent.isClone) {
    badges.push({ label: "Clone", tone: "warning" });
  }
  badges.push({ label: agent.category, tone: "neutral" });
  if (agent.type === "hosted") {
    badges.push({ label: "Hosted", tone: "cyan" });
  }
  return badges;
}

function discoveryMetrics(agent: DiscoveryAgent): AgentMetric[] {
  if (agent.registry === "manowar" && agent.price) {
    return [
      {
        label: "License Price",
        value: agent.price,
        icon: <Zap size={16} />,
        tone: "green",
      },
      {
        label: "Units",
        value: `${agent.units || "0"} units`,
        icon: <Layers size={16} />,
        tone: "cyan",
      },
    ];
  }

  return [
    {
      label: "Uses",
      value: formatInteractions(agent.totalInteractions),
      icon: <Zap size={16} />,
      tone: "green",
    },
    {
      label: "Rating",
      value: agent.rating.toFixed(1),
      icon: <Star size={16} />,
      tone: "warning",
    },
  ];
}

export function DiscoveryAgentCard({ agent, onSelect, className }: DiscoveryAgentCardProps) {
  const [, setLocation] = useLocation();
  const posthog = usePostHog();
  const isManowar = agent.registry === "manowar";
  const registryInfo = AGENT_REGISTRIES[agent.registry];
  const externalRegistry = !isManowar ? agent.registry : null;
  const externalAddress = !isManowar ? agent.address : null;
  const { data: externalWarpData } = useIsExternalWarped(externalRegistry, externalAddress);
  const warped = isManowar ? agent.isWarped : externalWarpData?.isWarped;
  const excerpt = agent.description || (agent.readme ? getReadmeExcerpt(agent.readme, 100) : "");
  const registry = registryInfo?.name || agent.registry;

  const handleWarp = () => {
    posthog?.capture("agent_warp_initiated", {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_registry: agent.registry,
    });
    sessionStorage.setItem("warpAgent", JSON.stringify(agent));
    setLocation("/create-agent?warp=true");
  };

  const handleViewEndpoint = () => {
    if (agent.walletAddress) {
      setLocation(`/agent/${agent.walletAddress}`);
    }
  };

  return (
    <ThemeAgentCard
      interactive
      className={className}
      avatarAlt={agent.name}
      avatarFallback={initials(agent.name)}
      avatarSrc={agent.avatarUrl}
      title={(
        <span className="cm-agent-card__identity">
          <span className="cm-agent-card__identity-head">
            <span className="cm-agent-card__identity-name">{agent.name}</span>
          </span>
          <span className="cm-agent-card__identity-address">{registry}</span>
        </span>
      )}
      description={excerpt}
      badges={discoveryBadges(agent, registry, warped)}
      metrics={discoveryMetrics(agent)}
      tagsTitle="Tags"
      tags={(agent.tags || []).slice(0, 6).map((tag) => ({ label: tag }))}
      headerAction={agent.externalUrl ? (
        <ShellButton
          tone="ghost"
          size="sm"
          iconOnly
          onClick={() => window.open(agent.externalUrl, "_blank")}
          aria-label="Open external profile"
          title="Open external profile"
        >
          <ExternalLink size={16} />
        </ShellButton>
      ) : undefined}
      footer={(
        <div className="cm-agent-card__action-stack">
          <ShellButton tone={isManowar ? "secondary" : "primary"} size="sm" onClick={() => onSelect(agent)}>
            <Check size={14} />
            Select
          </ShellButton>
          {!isManowar && !externalWarpData?.isWarped ? (
            <ShellButton tone="secondary" size="sm" onClick={handleWarp}>
              <ArrowRightLeft size={14} />
              Warp
            </ShellButton>
          ) : null}
          {!isManowar && externalWarpData?.isWarped ? (
            <ShellButton tone="secondary" size="sm" disabled>
              <CheckCircle2 size={14} />
              Warped
            </ShellButton>
          ) : null}
          {isManowar ? (
            <ShellButton tone="secondary" size="sm" onClick={handleViewEndpoint}>
              <Eye size={14} />
              View
            </ShellButton>
          ) : null}
        </div>
      )}
    />
  );
}

export function AgentCardSkeleton() {
  return <ThemeAgentCardSkeleton />;
}
