/**
 * Service Health Status Component
 * Shows connectivity status for backend services
 */
import { useServicesHealth } from "@/hooks/use-services";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function ServicesStatus() {
  const { data, isLoading, error } = useServicesHealth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="font-mono">Checking services...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Badge variant="destructive" className="text-xs font-mono">
        <XCircle className="w-3 h-3 mr-1" />
        Services Offline
      </Badge>
    );
  }

  const services = [
    { name: "Connector", status: data.connector },
    { name: "Sandbox", status: data.sandbox },
    { name: "Exporter", status: data.exporter },
  ];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {data.allHealthy ? (
              <Badge variant="outline" className="text-xs font-mono border-green-500/30 text-green-400 hover:bg-green-500/10">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Services Online
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs font-mono border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10">
                <XCircle className="w-3 h-3 mr-1" />
                Partial Outage
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-card border-sidebar-border">
          <div className="space-y-1 text-xs font-mono">
            {services.map((service) => (
              <div key={service.name} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{service.name}</span>
                {service.status.status === "ok" ? (
                  <span className="text-green-400">● Online</span>
                ) : (
                  <span className="text-red-400">● Offline</span>
                )}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact indicator for sidebar/topbar
 */
export function ServicesIndicator() {
  const { data, isLoading } = useServicesHealth();

  if (isLoading) {
    return <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" />;
  }

  if (!data || !data.allHealthy) {
    return <div className="w-2 h-2 rounded-full bg-yellow-500" title="Some services unavailable" />;
  }

  return <div className="w-2 h-2 rounded-full bg-green-500" title="All services online" />;
}

