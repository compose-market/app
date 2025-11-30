import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletConnector, useWalletAccount } from "@/components/connector";
import { SessionIndicator } from "@/components/session";

export function TopBar() {
  const { isConnected } = useWalletAccount();

  return (
    <header className="h-16 border-b border-sidebar-border bg-background/80 backdrop-blur-md fixed top-0 right-0 left-64 z-40 flex items-center justify-between px-6">
      <div className="flex items-center w-1/3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search agents, workflows, or protocols..." 
            className="pl-10 bg-sidebar-accent/50 border-sidebar-border focus:border-primary focus:ring-primary/20 font-mono text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-primary hover:bg-primary/10">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full animate-ping" />
        </Button>

        {/* Session budget indicator (only when connected) */}
        {isConnected && <SessionIndicator />}

        <WalletConnector compact />
      </div>
    </header>
  );
}
