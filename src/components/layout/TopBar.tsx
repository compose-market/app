import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletConnector, useWalletAccount } from "@/components/connector";
import { SessionIndicator } from "@/components/session";

export function TopBar() {
  const { isConnected } = useWalletAccount();

  return (
    <header className="h-16 border-b border-sidebar-border bg-background/80 backdrop-blur-md fixed top-0 right-0 left-64 z-40 flex items-center justify-between px-6">
      {/* Search Bar */}
      <div className="flex items-center w-1/3">
        <div className="relative w-full max-w-md flex items-center bg-sidebar-accent border border-sidebar-border rounded-sm p-1">
          <Search className="w-4 h-4 text-muted-foreground ml-2" />
          <Input 
            type="text"
            placeholder="Search agents, workflows, or protocols..." 
            className="bg-transparent border-none text-sm text-foreground focus:ring-0 placeholder:text-muted-foreground font-mono w-full"
          />
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-cyan-400 hover:bg-cyan-400/10">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-fuchsia-500 rounded-full animate-ping" />
        </Button>

        {/* Session budget indicator (only when connected) */}
        {isConnected && <SessionIndicator />}

        <WalletConnector compact />
      </div>
    </header>
  );
}
