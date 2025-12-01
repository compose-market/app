"use client";

import { ConnectButton, useActiveAccount, useActiveWallet } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { thirdwebClient, paymentChain, paymentToken, accountAbstraction } from "@/lib/thirdweb";

// Configure all supported authentication methods
const wallets = [
  // In-app wallet with social/email/passkey auth (creates embedded wallet)
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
  // External wallets
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

/**
 * Brand-aligned wallet connector for Compose.Market
 * Supports: Email, Google, GitHub, X, Discord, Farcaster, Passkey, Guest + External wallets
 * Uses ERC-4337 for gas sponsorship
 */
export function WalletConnector({ className, compact = false }: WalletConnectorProps) {
  return (
    <ConnectButton
      client={thirdwebClient}
      wallets={wallets}
      chain={paymentChain}
      accountAbstraction={accountAbstraction}
      connectButton={{
        label: "CONNECT",
        className: `
          !bg-cyan-500 !text-black 
          !font-bold !tracking-wider 
          !shadow-[0_0_15px_-3px_rgba(6,182,212,0.5)]
          hover:!bg-cyan-400
          !border-0 !rounded-sm
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
          [paymentChain.id]: paymentToken.address,
        },
        className: `
          !bg-cyan-500/10 !border-cyan-500/30 
          !text-cyan-400 !font-mono
          hover:!bg-cyan-500/20
          !rounded-sm
        `,
        style: {
          fontFamily: "var(--font-mono), Fira Code, monospace",
        },
      }}
      supportedTokens={{
        [paymentChain.id]: [paymentToken],
      }}
      theme={{
        type: "dark",
        colors: {
          // Compose.Market brand colors - Cyan primary, Fuchsia accent
          primaryButtonBg: "hsl(188 95% 43%)", // Cyan
          primaryButtonText: "hsl(222 47% 3%)", // Dark bg
          accentButtonBg: "hsl(292 85% 55%)", // Fuchsia accent
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

// Hook to get connected account info
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

// Re-export for convenience
export { useActiveAccount, useActiveWallet } from "thirdweb/react";
