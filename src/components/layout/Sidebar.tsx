import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, ShoppingCart, PlusCircle, Layers, Box, Activity, Shield } from "lucide-react";
import { ComposeLogo } from "@/components/brand/Logo";

export function Sidebar() {
  const [location] = useLocation();

  const moduleLinks = [
    { href: "/", icon: Home, label: "HOME" },
    { href: "/market", icon: Box, label: "MARKET" },
    { href: "/compose", icon: Layers, label: "COMPOSE" },
    { href: "/create-agent", icon: PlusCircle, label: "CREATE AGENT" },
  ];

  const networkLinks = [
    { href: "/my-assets", icon: Activity, label: "MY ASSETS" },
  ];

  return (
    <div className="w-64 h-screen border-r border-sidebar-border bg-sidebar/90 backdrop-blur-md flex flex-col fixed left-0 top-0 z-50">
      {/* Logo Header */}
      <div className="p-6 border-b border-sidebar-border flex items-center gap-3">
        <ComposeLogo className="w-10 h-10 text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
        <div>
          <h1 className="font-display font-black text-xl tracking-tighter text-foreground leading-none">
            COMPOSE<br/>
            <span className="text-cyan-400">.MARKET</span>
          </h1>
          <p className="font-mono text-[8px] text-fuchsia-500 tracking-widest mt-1">POWERED BY MANOWAR</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
        <div className="px-4 mb-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">Modules</div>
        {moduleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all border-l-2 group",
              location === link.href
                ? "border-cyan-400 bg-cyan-950/30 text-cyan-400"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            )}
          >
            <link.icon className={cn(
              "w-4 h-4",
              location === link.href 
                ? "text-cyan-400 drop-shadow-[0_0_10px_cyan]" 
                : "group-hover:text-cyan-400"
            )} />
            <span className="font-mono tracking-wider">{link.label}</span>
            {location === link.href && (
              <div className="ml-auto w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            )}
          </Link>
        ))}

        <div className="px-4 mt-6 mb-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">Network</div>
        {networkLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all border-l-2 group",
              location === link.href
                ? "border-cyan-400 bg-cyan-950/30 text-cyan-400"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            )}
          >
            <link.icon className={cn(
              "w-4 h-4",
              location === link.href 
                ? "text-cyan-400 drop-shadow-[0_0_10px_cyan]" 
                : "group-hover:text-cyan-400"
            )} />
            <span className="font-mono tracking-wider">{link.label}</span>
            {location === link.href && (
              <div className="ml-auto w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            )}
          </Link>
        ))}
      </nav>

      {/* Network Status Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="glass-panel p-3 rounded-sm border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-mono">NETWORK</span>
            <span className="text-xs text-cyan-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              AVAX FUJI
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">GAS</span>
            <span className="text-xs font-mono text-foreground">28 nAVAX</span>
          </div>
        </div>
      </div>
    </div>
  );
}
