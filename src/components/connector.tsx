"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useActiveWallet } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import type { SmartWalletOptions } from "thirdweb/wallets";
import { ChevronDown, LogOut, Copy, Check, ExternalLink, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { thirdwebClient, getChainObject, getUsdcAddress, isEvmNetwork, evmChainId } from "@/lib/chains";
import { useChain } from "@/contexts/Network";
import { useTotalBalance } from "@/hooks/use-multichain";
import { useSelectedUserAddress } from "@/hooks/use-address";
import { cn } from "@/lib/utils";
import { mpIdentify, mpReset } from "@/lib/mixpanel";
import type { EvmNetworkId } from "@compose-market/sdk/chains";

const wallets = [
  inAppWallet({
    auth: {
      options: [
        "email",
        "google",
        "github",
        "discord",
        "x",
        "farcaster",
        "passkey",
        "guest",
      ],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("walletConnect"),
  createWallet("io.rabby"),
  createWallet("me.rainbow"),
];

interface WalletConnectorProps {
  className?: string;
  compact?: boolean;
}

export function WalletConnector({ className, compact = false }: WalletConnectorProps) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { paymentNetwork, getChainByNetworkId, evmChains, defaultNetwork } = useChain();
  const {
    userAddress,
    evmAddress,
    solanaAddress,
    isEvm,
    isResolving: userAddressResolving,
  } = useSelectedUserAddress();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (account?.address) {
      mpIdentify(account.address);
    }
  }, [account?.address]);

  const fallbackEvmNetwork = useMemo((): EvmNetworkId | undefined => {
    if (isEvmNetwork(defaultNetwork)) return defaultNetwork;
    const first = evmChains.find((chain) => isEvmNetwork(chain.network));
    return first?.network as EvmNetworkId | undefined;
  }, [defaultNetwork, evmChains]);

  const thirdwebNetwork = isEvm ? paymentNetwork : fallbackEvmNetwork;
  const thirdwebChainIdValue = thirdwebNetwork && isEvmNetwork(thirdwebNetwork)
    ? evmChainId(thirdwebNetwork)
    : undefined;

  const connectChain = useMemo(() => {
    if (thirdwebChainIdValue == null) return undefined;
    return getChainObject(thirdwebChainIdValue);
  }, [thirdwebChainIdValue]);

  const chainInfo = getChainByNetworkId(paymentNetwork);
  const chainColor = chainInfo?.isTestnet ? "bg-red-400" : "bg-blue-400";

  const selectedPaymentToken = useMemo(() => {
    if (thirdwebChainIdValue == null) return undefined;
    const usdcAddress = getUsdcAddress(thirdwebChainIdValue);
    if (!usdcAddress) return undefined;
    return {
      address: usdcAddress,
      name: "USD Coin",
      symbol: "USDC",
      icon: "/tokens/usdc.svg",
    };
  }, [thirdwebChainIdValue]);

  const { formatted: totalBalance, isLoading: balanceLoading } = useTotalBalance({
    evmAddress,
    solanaAddress,
  }, {
    enabled: !!evmAddress,
    deferUntilIdle: !menuOpen,
  });

  if (!account) {
    if (!connectChain || !selectedPaymentToken) {
      return (
        <button
          type="button"
          disabled
          className={cn(
            "cm-hud-button cm-hud-wallet opacity-50 cursor-not-allowed",
            className
          )}
        >
          <Wallet className="cm-hud-icon cm-hud-wallet__icon" size={18} aria-hidden="true" />
          <span className="cm-hud-value">Loading...</span>
        </button>
      );
    }

    const dynamicAccountAbstraction: SmartWalletOptions = {
      chain: connectChain,
      sponsorGas: true,
    };

    return (
      <ConnectButton
        client={thirdwebClient}
        wallets={wallets}
        chain={connectChain}
        accountAbstraction={dynamicAccountAbstraction}
        connectButton={{
          label: "CONNECT",
          className: `
            !bg-cyan-500 !text-black
            !font-bold !tracking-wider
            !shadow-[0_0_15px_-3px_rgba(6,182,212,0.5)]
            hover:!bg-cyan-400
            !border-0 !rounded-full !min-h-[2.65rem]
            ${className || ""}
          `,
          style: {
            fontFamily: "var(--font-display), Orbitron, sans-serif",
            textTransform: "uppercase",
          },
        }}
        connectModal={{
          size: compact ? "compact" : "wide",
          title: "Access Compose.Market",
          showThirdwebBranding: false,
          welcomeScreen: {
            title: "Welcome to Compose.Market",
            subtitle: "Connect to access the AI Agent marketplace",
          },
          termsOfServiceUrl: "/terms",
          privacyPolicyUrl: "/privacy",
        }}
        detailsButton={{
          displayBalanceToken: {
            [thirdwebChainIdValue!]: selectedPaymentToken.address,
          },
          className: `
            !bg-cyan-500/10 !border-cyan-500/30
            !text-cyan-400 !font-mono
            hover:!bg-cyan-500/20
            !rounded-full
          `,
          style: {
            fontFamily: "var(--font-mono), Fira Code, monospace",
          },
        }}
        supportedTokens={{
          [thirdwebChainIdValue!]: [selectedPaymentToken],
        }}
        theme={{
          type: "dark",
          colors: {
            primaryButtonBg: "hsl(188 95% 43%)",
            primaryButtonText: "hsl(222 47% 3%)",
            accentButtonBg: "hsl(292 85% 55%)",
            accentButtonText: "hsl(0 0% 100%)",
            accentText: "hsl(188 95% 43%)",
            borderColor: "hsl(217 33% 15%)",
            separatorLine: "hsl(217 33% 15%)",
            modalBg: "hsl(222 40% 5%)",
            modalOverlayBg: "hsl(222 47% 3% / 0.8)",
            inputAutofillBg: "hsl(222 40% 6%)",
            secondaryButtonBg: "hsl(270 60% 20%)",
            secondaryButtonHoverBg: "hsl(270 60% 25%)",
            secondaryButtonText: "hsl(270 80% 90%)",
            connectedButtonBg: "hsl(222 40% 8%)",
            connectedButtonBgHover: "hsl(222 40% 12%)",
            secondaryText: "hsl(215 16% 47%)",
            primaryText: "hsl(210 40% 80%)",
            danger: "hsl(0 90% 50%)",
            success: "hsl(188 95% 43%)",
            selectedTextBg: "hsl(188 95% 43% / 0.2)",
            selectedTextColor: "hsl(188 95% 43%)",
            skeletonBg: "hsl(217 33% 15%)",
            tertiaryBg: "hsl(222 40% 6%)",
            tooltipBg: "hsl(222 40% 10%)",
            tooltipText: "hsl(210 40% 80%)",
            scrollbarBg: "hsl(217 33% 15%)",
            secondaryIconColor: "hsl(215 16% 47%)",
            secondaryIconHoverBg: "hsl(222 40% 12%)",
            secondaryIconHoverColor: "hsl(188 95% 43%)",
          },
          fontFamily: "var(--font-sans), Rajdhani, sans-serif",
        }}
      />
    );
  }

  const displayAddress = userAddress;
  const shortAddress = displayAddress
    ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
    : userAddressResolving ? "Resolving..." : "Unavailable";
  const accountLabel = isEvm ? "Smart account" : "Solana account";
  const selectedExplorerUrl = (() => {
    if (!displayAddress) return null;
    const explorer = chainInfo?.explorer?.replace(/\/$/, "") || "https://explorer.solana.com";
    if (isEvm) return `${explorer}/address/${displayAddress}`;
    const cluster = paymentNetwork === "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" ? "?cluster=devnet" : "";
    return `${explorer}/address/${displayAddress}${cluster}`;
  })();

  const handleCopy = async () => {
    if (!displayAddress) return;
    await navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 2_000);
  };

  const handleDisconnect = () => {
    mpReset();
    wallet?.disconnect();
  };

  return (
    <DropdownMenu onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Wallet ${shortAddress}`}
          className={cn(
            "cm-hud-button cm-hud-wallet",
            className
          )}
        >
          <Wallet className="cm-hud-icon cm-hud-wallet__icon" size={18} aria-hidden="true" />
          <span className="cm-hud-value">
            {balanceLoading ? "..." : `$${totalBalance}`}
          </span>
          <span className="cm-hud-address">{shortAddress}</span>
          <ChevronDown className="cm-hud-icon" size={13} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="cm-hud-menu w-64">
        <div className="px-3 py-3 border-b border-cyan-400/15">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("w-2.5 h-2.5 rounded-full", chainColor)} />
            <span className="font-mono text-sm font-medium">
              {chainInfo?.name || "Unknown Chain"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-mono">Total USDC</span>
            <span className="text-cyan-400 font-mono font-bold">
              ${balanceLoading ? "..." : totalBalance}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Aggregated across all chains
          </p>
        </div>

        <div className="px-3 py-2 border-b border-cyan-400/15">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{accountLabel}</p>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-foreground">{shortAddress}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                disabled={!displayAddress}
                className="p-1 text-muted-foreground hover:text-cyan-400 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {selectedExplorerUrl ? (
                <a
                  href={selectedExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-muted-foreground hover:text-cyan-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <DropdownMenuItem onClick={handleDisconnect} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useWalletAccount() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  return {
    isConnected: !!account,
    address: account?.address,
    account,
    wallet,
  };
}

export { useActiveAccount, useActiveWallet } from "thirdweb/react";
