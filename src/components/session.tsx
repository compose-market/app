"use client";

import { useState } from "react";
import { useSession } from "@/hooks/use-session";
import { useWalletAccount } from "@/components/connector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Zap, Clock, Wallet, Shield, X } from "lucide-react";

/**
 * Session Budget Setup Dialog
 * Allows users to set a spending limit for signature-free AI inference
 */
export function SessionBudgetDialog() {
  const { isConnected } = useWalletAccount();
  const { session, isCreating, error, createSession, budgetPresets } = useSession();
  const [selectedBudget, setSelectedBudget] = useState(budgetPresets[1].value); // Default $5
  const [duration, setDuration] = useState(24); // Default 24 hours
  const [open, setOpen] = useState(false);

  if (!isConnected) return null;

  const handleCreate = async () => {
    const budgetUSDC = selectedBudget / 1_000_000;
    const success = await createSession(budgetUSDC, duration);
    if (success) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/10 font-mono"
        >
          <Zap className="w-4 h-4 mr-2" />
          {session.isActive ? "Session Active" : "Enable Agent Mode"}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-sidebar-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-cyan-400 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Session Budget
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set a spending limit to skip wallet signatures for each AI call.
            One approval, unlimited inference within your budget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Budget Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground font-mono">
              Budget Limit (USDC)
            </label>
            <div className="grid grid-cols-5 gap-2">
              {budgetPresets.map((preset) => (
                <Button
                  key={preset.value}
                  variant={selectedBudget === preset.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBudget(preset.value)}
                  className={
                    selectedBudget === preset.value
                      ? "bg-cyan-500 text-black font-mono"
                      : "border-sidebar-border hover:border-cyan-500/50 font-mono"
                  }
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 font-mono">
              <Clock className="w-4 h-4" />
              Session Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 6, 12, 24].map((hours) => (
                <Button
                  key={hours}
                  variant={duration === hours ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDuration(hours)}
                  className={
                    duration === hours
                      ? "bg-cyan-500 text-black font-mono"
                      : "border-sidebar-border hover:border-cyan-500/50 font-mono"
                  }
                >
                  {hours}h
                </Button>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-sidebar-accent rounded-sm p-4 space-y-2 border border-sidebar-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono">Max Spend</span>
              <span className="font-mono text-cyan-400">
                ${(selectedBudget / 1_000_000).toFixed(2)} USDC
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono">Expires After</span>
              <span className="font-mono text-foreground">{duration} hours</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono">Signatures Required</span>
              <span className="font-mono text-fuchsia-400">1 (now)</span>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-sm p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-cyan-500 text-black hover:bg-cyan-400 font-mono font-bold"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
                Creating Session...
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4 mr-2" />
                Approve & Start Session
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Session Status Card
 * Shows current session budget usage and controls
 */
export function SessionStatusCard() {
  const { session, endSession } = useSession();

  if (!session.isActive) return null;

  const usagePercent = (session.budgetUsed / session.budgetLimit) * 100;
  const remainingUSDC = session.budgetRemaining / 1_000_000;
  const totalUSDC = session.budgetLimit / 1_000_000;

  const timeRemaining = session.expiresAt
    ? Math.max(0, session.expiresAt - Date.now())
    : 0;
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <Card className="glass-panel border-cyan-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Fast Mode Active
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={endSession}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <CardDescription className="text-xs font-mono">
          No signatures needed • {hoursRemaining}h {minutesRemaining}m remaining
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-muted-foreground">Budget Used</span>
            <span>
              ${(session.budgetUsed / 1_000_000).toFixed(4)} / ${totalUSDC.toFixed(2)}
            </span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400 font-mono">
            ${remainingUSDC.toFixed(4)} remaining
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Inline session indicator for TopBar
 */
export function SessionIndicator() {
  const { session } = useSession();

  if (!session.isActive) {
    return <SessionBudgetDialog />;
  }

  const remainingUSDC = session.budgetRemaining / 1_000_000;

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant="outline" 
        className="border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-mono text-xs"
      >
        <Zap className="w-3 h-3 mr-1" />
        ${remainingUSDC.toFixed(2)}
      </Badge>
      <SessionBudgetDialog />
    </div>
  );
}
