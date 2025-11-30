import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, ShoppingCart, PlusCircle, Layers, Settings, Box, Activity } from "lucide-react";
import manowarLogo from "@assets/cyberpunk_manowar_logo.png";

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/market", icon: ShoppingCart, label: "Marketplace" },
    { href: "/compose", icon: Layers, label: "Compose" },
    { href: "/create-agent", icon: PlusCircle, label: "Create Agent" },
    { href: "/my-assets", icon: Box, label: "My Assets" },
  ];

  return (
    <div className="w-64 h-screen border-r border-sidebar-border bg-sidebar flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <img src={manowarLogo} alt="Manowar" className="w-10 h-10 rounded-full ring-2 ring-primary animate-pulse" />
        <div>
          <h1 className="font-display text-xl font-bold tracking-wider text-foreground">MANOWAR</h1>
          <p className="text-xs text-muted-foreground font-mono">COMPOSE.MARKET</p>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <a
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                location === link.href
                  ? "bg-sidebar-accent text-primary shadow-[0_0_15px_-3px_hsl(var(--primary)/0.3)]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white"
              )}
            >
              <link.icon className={cn("w-5 h-5", location === link.href ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              <span className="font-sans tracking-wide">{link.label}</span>
              
              {/* Active Indicator */}
              {location === link.href && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_2px_hsl(var(--primary))]" />
              )}
            </a>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/20">
        <div className="glass-panel p-3 rounded-lg border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-mono">NETWORK</span>
            <span className="text-xs text-primary font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
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
