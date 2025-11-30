"use client";

import { ConnectButton, useActiveAccount, useActiveWallet } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { thirdwebClient, paymentChain, paymentToken, accountAbstraction } from "@/lib/thirdweb";
import manowarLogo from "@assets/cyberpunk_manowar_logo.png";
import agentIcon from "@assets/3d_agent_icon.png";

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
 * Brand-aligned wallet connector for Manowar
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
          !bg-primary !text-primary-foreground 
          !font-bold !tracking-wide 
          !shadow-[0_0_15px_-3px_hsl(160_100%_50%/0.5)]
          hover:!bg-primary/90
          !border-0 !rounded-md
          ${className || ""}
        `,
        style: {
          fontFamily: "var(--font-display), Orbitron, sans-serif",
          textTransform: "uppercase",
        },
      }}
      connectModal={{
        size: compact ? "compact" : "wide",
        title: "Access Manowar",
        titleIcon: manowarLogo,
        showThirdwebBranding: false,
        welcomeScreen: {
          title: "Welcome to Manowar",
          subtitle: "Connect to access the AI Agent marketplace",
          img: {
            src: agentIcon,
            width: 150,
            height: 150,
          },
        },
        termsOfServiceUrl: "/terms",
        privacyPolicyUrl: "/privacy",
      }}
      detailsButton={{
        displayBalanceToken: {
          [paymentChain.id]: paymentToken.address,
        },
        className: `
          !bg-primary/10 !border-primary/30 
          !text-primary !font-mono
          hover:!bg-primary/20
        `,
        style: {
          fontFamily: "var(--font-mono), Fira Code, monospace",
        },
      }}
      supportedTokens={{
        [paymentChain.id]: [paymentToken],
      }}
      theme={{
        colors: {
          // Manowar brand colors
          primaryButtonBg: "hsl(160 100% 50%)", // Cyber green
          primaryButtonText: "hsl(240 20% 5%)", // Dark bg
          accentButtonBg: "hsl(320 90% 60%)", // Hot pink accent
          accentButtonText: "hsl(0 0% 100%)",
          accentText: "hsl(160 100% 50%)",
          borderColor: "hsl(240 20% 15%)",
          separatorLine: "hsl(240 20% 15%)",
          modalBg: "hsl(240 15% 6%)",
          inputAutofillBg: "hsl(240 15% 8%)",
          secondaryButtonBg: "hsl(270 60% 20%)",
          secondaryButtonHoverBg: "hsl(270 60% 25%)",
          secondaryButtonText: "hsl(270 80% 90%)",
          connectedButtonBg: "hsl(240 15% 10%)",
          connectedButtonBgHover: "hsl(240 15% 15%)",
          secondaryText: "hsl(240 10% 50%)",
          primaryText: "hsl(180 100% 90%)",
          danger: "hsl(0 90% 50%)",
          success: "hsl(160 100% 50%)",
          selectedTextBg: "hsl(160 100% 50% / 0.2)",
          selectedTextColor: "hsl(160 100% 50%)",
          skeletonBg: "hsl(240 10% 15%)",
          tertiaryBg: "hsl(240 15% 8%)",
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

