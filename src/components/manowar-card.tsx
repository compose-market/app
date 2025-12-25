/**
 * Manowar Card Component
 *
 * Compact card displaying Manowar workflow details.
 * Shows: identity, coordinator, agents, stats, lease info, and endpoints.
 */
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { getIpfsUrl } from "@/lib/pinata";
import type { OnchainManowar } from "@/hooks/use-onchain";
import {
    Copy,
    ExternalLink,
    DollarSign,
    Package,
    Zap,
    Globe,
    Layers,
    Bot,
    Clock,
    Percent,
    AlertTriangle,
    Cpu,
} from "lucide-react";

export interface ManowarCardProps {
    manowar: OnchainManowar;
    onCopyEndpoint?: () => void;
}

export function ManowarCard({ manowar, onCopyEndpoint }: ManowarCardProps) {
    // Banner image from IPFS
    const bannerUrl = manowar.image && manowar.image.startsWith("ipfs://")
        ? getIpfsUrl(manowar.image.replace("ipfs://", ""))
        : manowar.image?.startsWith("https://")
            ? manowar.image
            : null;

    const unitsDisplay = manowar.units === 0 ? "∞" : `${manowar.units - manowar.unitsMinted}/${manowar.units}`;

    // Agents from metadata
    const agents = manowar.metadata?.agents || [];

    // API endpoint for this Manowar
    const apiEndpoint = manowar.walletAddress
        ? `https://api.compose.market/api/manowar/${manowar.walletAddress}`
        : null;

    const handleCopyEndpoint = () => {
        if (apiEndpoint) {
            navigator.clipboard.writeText(apiEndpoint);
            onCopyEndpoint?.();
        }
    };

    return (
        <TooltipProvider>
            <Card className="glass-panel border-fuchsia-500/30 h-full flex flex-col overflow-hidden">
                {/* Banner - compact */}
                {bannerUrl && (
                    <div
                        className="h-24 bg-cover bg-center shrink-0"
                        style={{ backgroundImage: `url(${bannerUrl})` }}
                    />
                )}
                {!bannerUrl && (
                    <div className="h-16 bg-gradient-to-br from-fuchsia-500/20 via-cyan-500/10 to-transparent shrink-0" />
                )}

                <CardContent className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
                    {/* Header: Title + Actions */}
                    <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <Layers className="w-5 h-5 text-fuchsia-400 shrink-0" />
                                <h3 className="font-semibold text-white truncate text-base">
                                    {manowar.title || `Manowar #${manowar.id}`}
                                </h3>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => window.open(`https://testnet.snowtrace.io/token/${import.meta.env.VITE_MANOWAR_CONTRACT}?a=${manowar.id}`, "_blank")}
                                            className="text-muted-foreground hover:text-fuchsia-400 transition-colors shrink-0"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>View on Explorer</TooltipContent>
                                </Tooltip>
                            </div>
                            <p className="text-muted-foreground text-sm line-clamp-2 mt-1">
                                {manowar.description || "No description available"}
                            </p>
                        </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5">
                        <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30 text-xs">
                            #{manowar.id}
                        </Badge>
                        {manowar.hasActiveRfa && (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Active RFA
                            </Badge>
                        )}
                        {manowar.leaseEnabled && (
                            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                                <Clock className="w-3 h-3 mr-1" />
                                Leasable
                            </Badge>
                        )}
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="p-2 bg-background/50 border border-sidebar-border rounded-lg cursor-default">
                                    <DollarSign className="w-4 h-4 text-green-400 mx-auto" />
                                    <p className="font-mono text-sm text-green-400 mt-1">${manowar.totalPrice}</p>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>Total Workflow Price</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="p-2 bg-background/50 border border-sidebar-border rounded-lg cursor-default">
                                    <Package className="w-4 h-4 text-cyan-400 mx-auto" />
                                    <p className="font-mono text-sm text-cyan-400 mt-1">{unitsDisplay}</p>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>Available Units</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="p-2 bg-background/50 border border-sidebar-border rounded-lg cursor-default">
                                    <Bot className="w-4 h-4 text-fuchsia-400 mx-auto" />
                                    <p className="font-mono text-sm text-fuchsia-400 mt-1">{agents.length}</p>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>Agents in Workflow</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="p-2 bg-background/50 border border-sidebar-border rounded-lg cursor-default">
                                    <Globe className="w-4 h-4 text-cyan-400 mx-auto" />
                                    <p className="font-mono text-sm text-cyan-400 mt-1">AVAX</p>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>Avalanche Chain</TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Coordinator Model */}
                    {manowar.hasCoordinator && manowar.coordinatorModel && (
                        <div className="flex items-center gap-3 p-3 bg-background/50 border border-sidebar-border rounded-lg">
                            <Cpu className="w-5 h-5 text-fuchsia-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <span className="text-xs text-muted-foreground uppercase block">Coordinator</span>
                                <span className="font-mono text-sm text-fuchsia-400 truncate block" title={manowar.coordinatorModel}>
                                    {manowar.coordinatorModel}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Agents - Flexible container */}
                    {agents.length > 0 && (
                        <div className="flex-1 min-h-0 p-3 bg-background/50 border border-sidebar-border rounded-lg flex flex-col">
                            <div className="flex items-center gap-2 mb-2 shrink-0">
                                <Bot className="w-4 h-4 text-cyan-400" />
                                <span className="text-xs text-muted-foreground uppercase">Agents ({agents.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 content-start overflow-y-auto">
                                {agents.map((agent, idx) => (
                                    <Tooltip key={idx}>
                                        <TooltipTrigger asChild>
                                            <Badge
                                                variant="outline"
                                                className="text-xs px-2 py-0.5 border-cyan-500/30 text-cyan-400 cursor-default shrink-0"
                                            >
                                                {agent.name || `Agent ${idx + 1}`}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="font-mono text-xs">{agent.name}</p>
                                            {agent.model && <p className="text-xs text-muted-foreground">{agent.model}</p>}
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lease Info - if enabled */}
                    {manowar.leaseEnabled && (
                        <div className="flex items-center gap-4 p-3 bg-background/50 border border-sidebar-border rounded-lg text-sm">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-cyan-400" />
                                <span className="text-muted-foreground">Duration:</span>
                                <span className="font-mono text-cyan-400">{manowar.leaseDuration} days</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Percent className="w-4 h-4 text-green-400" />
                                <span className="text-muted-foreground">Creator:</span>
                                <span className="font-mono text-green-400">{manowar.leasePercent}%</span>
                            </div>
                        </div>
                    )}

                    {/* API Endpoint */}
                    {apiEndpoint && (
                        <div className="pt-3 border-t border-sidebar-border mt-auto shrink-0">
                            <div className="flex items-center gap-2 mb-2">
                                <Globe className="w-4 h-4 text-fuchsia-400" />
                                <span className="text-xs text-muted-foreground uppercase">API Endpoint</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-background border border-sidebar-border rounded-lg font-mono text-xs">
                                <code className="flex-1 truncate text-fuchsia-400">{apiEndpoint}</code>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCopyEndpoint}
                                            className="h-6 w-6 p-0 hover:text-fuchsia-400"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy Endpoint</TooltipContent>
                                </Tooltip>
                            </div>
                            {/* Creator */}
                            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                                <span>Creator:</span>
                                <a
                                    href={`https://testnet.snowtrace.io/address/${manowar.creator}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-fuchsia-400 hover:underline font-mono"
                                >
                                    {`${manowar.creator.slice(0, 6)}...${manowar.creator.slice(-4)}`}
                                </a>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </TooltipProvider>
    );
}

export function ManowarCardSkeleton() {
    return (
        <Card className="glass-panel border-fuchsia-500/30 h-full">
            <div className="h-16 bg-gradient-to-br from-fuchsia-500/20 via-cyan-500/10 to-transparent" />
            <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-full" />
                    </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                </div>
                <Skeleton className="h-14" />
                <Skeleton className="h-20" />
            </CardContent>
        </Card>
    );
}
