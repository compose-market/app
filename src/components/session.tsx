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
          className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
        >
          <Zap className="w-4 h-4 mr-2" />
          {session.isActive ? "Session Active" : "Enable Fast Mode"}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-primary flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Session Budget
          </DialogTitle>
          <DialogDescription>
            Set a spending limit to skip wallet signatures for each AI call.
            One approval, unlimited inference within your budget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Budget Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
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
                      ? "bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50"
                  }
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
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
                      ? "bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50"
                  }
                >
                  {hours}h
                </Button>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Max Spend</span>
              <span className="font-mono text-primary">
                ${(selectedBudget / 1_000_000).toFixed(2)} USDC
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expires After</span>
              <span className="font-mono">{duration} hours</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Signatures Required</span>
              <span className="font-mono text-accent">1 (now)</span>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
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
    <Card className="glass-panel border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
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
        <CardDescription className="text-xs">
          No signatures needed • {hoursRemaining}h {minutesRemaining}m remaining
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Budget Used</span>
            <span className="font-mono">
              ${(session.budgetUsed / 1_000_000).toFixed(4)} / ${totalUSDC.toFixed(2)}
            </span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
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
        className="border-primary/50 bg-primary/10 text-primary font-mono text-xs"
      >
        <Zap className="w-3 h-3 mr-1" />
        ${remainingUSDC.toFixed(2)}
      </Badge>
      <SessionBudgetDialog />
    </div>
  );
}

