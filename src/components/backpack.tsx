/**
 * Backpack Component
 * 
 * User's personal permission and account management popup.
 * Two tabs:
 * - Permissions: Toggle browser permissions (filesystem, camera, mic, etc.)
 * - Connected Accounts: Connect/disconnect external OAuth providers
 */

import { useState, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
    Backpack,
    FolderOpen,
    Camera,
    Mic,
    MapPin,
    Clipboard,
    Bell,
    Link2,
    Shield,
    Check,
    Loader2,
    ExternalLink,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface Permission {
    type: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    granted: boolean;
}

interface OAuthProvider {
    id: string;
    name: string;
    logo: string;  // Real logo URL from provider
    color: string; // Brand color
    authUrl: string; // OAuth authorization URL
    scopes: string[];
}

// =============================================================================
// Permission Definitions
// =============================================================================

const PERMISSION_TYPES: Omit<Permission, "granted">[] = [
    {
        type: "filesystem",
        label: "File System",
        description: "Access files and folders on your device",
        icon: <FolderOpen className="w-4 h-4" />,
    },
    {
        type: "camera",
        label: "Camera",
        description: "Use your camera for photos and video",
        icon: <Camera className="w-4 h-4" />,
    },
    {
        type: "microphone",
        label: "Microphone",
        description: "Record audio with your microphone",
        icon: <Mic className="w-4 h-4" />,
    },
    {
        type: "geolocation",
        label: "Location",
        description: "Access your current location",
        icon: <MapPin className="w-4 h-4" />,
    },
    {
        type: "clipboard",
        label: "Clipboard",
        description: "Read and write to your clipboard",
        icon: <Clipboard className="w-4 h-4" />,
    },
    {
        type: "notifications",
        label: "Notifications",
        description: "Send you desktop notifications",
        icon: <Bell className="w-4 h-4" />,
    },
];

// =============================================================================
// OAuth Provider Definitions with Real APIs
// =============================================================================

const OAUTH_PROVIDERS: OAuthProvider[] = [
    {
        id: "google",
        name: "Google",
        logo: "https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png",
        color: "#4285F4",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        scopes: ["email", "profile", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/drive.readonly"],
    },
    {
        id: "notion",
        name: "Notion",
        logo: "https://www.notion.so/images/favicon.ico",
        color: "#000000",
        authUrl: "https://api.notion.com/v1/oauth/authorize",
        scopes: ["read_content", "update_content", "insert_content"],
    },
    {
        id: "twitter",
        name: "X (Twitter)",
        logo: "https://abs.twimg.com/favicons/twitter.3.ico",
        color: "#000000",
        authUrl: "https://twitter.com/i/oauth2/authorize",
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    },
    {
        id: "github",
        name: "GitHub",
        logo: "https://github.githubassets.com/favicons/favicon.svg",
        color: "#24292F",
        authUrl: "https://github.com/login/oauth/authorize",
        scopes: ["read:user", "user:email", "repo"],
    },
    {
        id: "discord",
        name: "Discord",
        logo: "https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a69f118df70ad7828d4_icon_clyde_blurple_RGB.svg",
        color: "#5865F2",
        authUrl: "https://discord.com/oauth2/authorize",
        scopes: ["identify", "email", "guilds"],
    },
    {
        id: "slack",
        name: "Slack",
        logo: "https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png",
        color: "#4A154B",
        authUrl: "https://slack.com/oauth/v2/authorize",
        scopes: ["channels:read", "chat:write", "users:read"],
    },
    {
        id: "linkedin",
        name: "LinkedIn",
        logo: "https://static.licdn.com/sc/h/akt4ae504epesldzj74dzred8",
        color: "#0A66C2",
        authUrl: "https://www.linkedin.com/oauth/v2/authorization",
        scopes: ["r_liteprofile", "r_emailaddress"],
    },
    {
        id: "spotify",
        name: "Spotify",
        logo: "https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png",
        color: "#1DB954",
        authUrl: "https://accounts.spotify.com/authorize",
        scopes: ["user-read-email", "user-read-private", "playlist-read-private"],
    },
];

// OAuth Client IDs (would be in env in production)
const OAUTH_CLIENT_IDS: Record<string, string> = {
    google: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
    notion: import.meta.env.VITE_NOTION_CLIENT_ID || "",
    twitter: import.meta.env.VITE_TWITTER_CLIENT_ID || "",
    github: import.meta.env.VITE_GITHUB_CLIENT_ID || "",
    discord: import.meta.env.VITE_DISCORD_CLIENT_ID || "",
    slack: import.meta.env.VITE_SLACK_CLIENT_ID || "",
    linkedin: import.meta.env.VITE_LINKEDIN_CLIENT_ID || "",
    spotify: import.meta.env.VITE_SPOTIFY_CLIENT_ID || "",
};

// =============================================================================
// Component
// =============================================================================

interface BackpackDialogProps {
    userId?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    showTrigger?: boolean;
}

export function BackpackDialog({
    userId,
    open,
    onOpenChange,
    showTrigger = true
}: BackpackDialogProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("permissions");
    const [loadingPermission, setLoadingPermission] = useState<string | null>(null);
    const [loadingAccount, setLoadingAccount] = useState<string | null>(null);

    // Permission states (from sessionStorage)
    const [permissions, setPermissions] = useState<Record<string, boolean>>(() => {
        const stored: Record<string, boolean> = {};
        PERMISSION_TYPES.forEach(p => {
            stored[p.type] = sessionStorage.getItem(`consent_${p.type}`) === "granted";
        });
        return stored;
    });

    // Account states (from localStorage for persistence)
    const [accounts, setAccounts] = useState<Record<string, { connected: boolean; username?: string }>>(() => {
        const stored: Record<string, { connected: boolean; username?: string }> = {};
        OAUTH_PROVIDERS.forEach(p => {
            const data = localStorage.getItem(`oauth_${p.id}`);
            stored[p.id] = data ? JSON.parse(data) : { connected: false };
        });
        return stored;
    });

    const handleOpen = open !== undefined ? open : isOpen;
    const handleOpenChange = onOpenChange || setIsOpen;

    // ==========================================================================
    // Permission Handlers
    // ==========================================================================

    const requestPermission = useCallback(async (type: string) => {
        setLoadingPermission(type);

        try {
            let granted = false;

            switch (type) {
                case "filesystem":
                    if ("showDirectoryPicker" in window) {
                        await (window as any).showDirectoryPicker();
                        granted = true;
                    } else {
                        throw new Error("File System Access API not supported");
                    }
                    break;

                case "camera":
                    await navigator.mediaDevices.getUserMedia({ video: true });
                    granted = true;
                    break;

                case "microphone":
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                    granted = true;
                    break;

                case "geolocation":
                    await new Promise<void>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(() => resolve(), reject);
                    });
                    granted = true;
                    break;

                case "clipboard":
                    await navigator.clipboard.readText();
                    granted = true;
                    break;

                case "notifications":
                    const result = await Notification.requestPermission();
                    granted = result === "granted";
                    break;
            }

            if (granted) {
                sessionStorage.setItem(`consent_${type}`, "granted");
                setPermissions(prev => ({ ...prev, [type]: true }));
                toast({ title: "Permission Granted", description: `${type} access enabled.` });
            }
        } catch (err) {
            toast({
                title: "Permission Denied",
                description: `Could not get ${type} access.`,
                variant: "destructive"
            });
        } finally {
            setLoadingPermission(null);
        }
    }, [toast]);

    const revokePermission = useCallback((type: string) => {
        sessionStorage.removeItem(`consent_${type}`);
        setPermissions(prev => ({ ...prev, [type]: false }));
        toast({ title: "Permission Revoked", description: `${type} access disabled.` });
    }, [toast]);

    // ==========================================================================
    // OAuth Handlers - Real OAuth Flow
    // ==========================================================================

    const connectAccount = useCallback(async (provider: OAuthProvider) => {
        setLoadingAccount(provider.id);

        const clientId = OAUTH_CLIENT_IDS[provider.id];
        if (!clientId) {
            toast({
                title: "Configuration Missing",
                description: `${provider.name} OAuth is not configured yet.`,
                variant: "destructive"
            });
            setLoadingAccount(null);
            return;
        }

        // Build OAuth URL with proper parameters
        const redirectUri = `${window.location.origin}/oauth/callback`;
        const state = btoa(JSON.stringify({ provider: provider.id, timestamp: Date.now() }));

        // Store state for verification
        sessionStorage.setItem("oauth_state", state);

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: provider.scopes.join(" "),
            state,
        });

        // Provider-specific params
        if (provider.id === "google") {
            params.set("access_type", "offline");
            params.set("prompt", "consent");
        } else if (provider.id === "twitter") {
            params.set("code_challenge_method", "plain");
            params.set("code_challenge", "challenge"); // In production, use PKCE
        } else if (provider.id === "discord") {
            params.set("permissions", "0");
        }

        // Open OAuth popup
        const authUrl = `${provider.authUrl}?${params.toString()}`;
        const popup = window.open(authUrl, `${provider.name} Login`, "width=600,height=700");

        // Listen for popup close / callback
        const checkPopup = setInterval(() => {
            if (popup?.closed) {
                clearInterval(checkPopup);
                setLoadingAccount(null);

                // Check if OAuth was successful (callback would have stored token)
                const tokenData = localStorage.getItem(`oauth_${provider.id}`);
                if (tokenData) {
                    const data = JSON.parse(tokenData);
                    if (data.connected) {
                        setAccounts(prev => ({ ...prev, [provider.id]: data }));
                        toast({ title: "Connected", description: `${provider.name} account connected successfully.` });
                    }
                }
            }
        }, 500);

        // Cleanup after 5 minutes
        setTimeout(() => {
            clearInterval(checkPopup);
            setLoadingAccount(null);
        }, 300000);

    }, [toast]);

    const disconnectAccount = useCallback((providerId: string) => {
        localStorage.removeItem(`oauth_${providerId}`);
        setAccounts(prev => ({
            ...prev,
            [providerId]: { connected: false }
        }));
        const provider = OAUTH_PROVIDERS.find(p => p.id === providerId);
        toast({ title: "Disconnected", description: `${provider?.name || providerId} account disconnected.` });
    }, [toast]);

    // ==========================================================================
    // Render
    // ==========================================================================

    const grantedPermissionsCount = Object.values(permissions).filter(Boolean).length;
    const connectedAccountsCount = Object.values(accounts).filter(a => a.connected).length;

    return (
        <Dialog open={handleOpen} onOpenChange={handleOpenChange}>
            {showTrigger && (
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Backpack className="w-4 h-4" />
                        Backpack
                    </Button>
                </DialogTrigger>
            )}

            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Backpack className="w-5 h-5 text-fuchsia-400" />
                        Your Backpack
                    </DialogTitle>
                    <DialogDescription>
                        Manage permissions and connected accounts for AI agents.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="permissions" className="gap-2">
                            <Shield className="w-4 h-4" />
                            Permissions
                            {grantedPermissionsCount > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                                    {grantedPermissionsCount}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="accounts" className="gap-2">
                            <Link2 className="w-4 h-4" />
                            Accounts
                            {connectedAccountsCount > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                                    {connectedAccountsCount}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* Permissions Tab */}
                    <TabsContent value="permissions" className="flex-1 overflow-y-auto mt-4 space-y-3">
                        {PERMISSION_TYPES.map(perm => (
                            <div key={perm.type} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-md bg-zinc-800 text-zinc-400">
                                        {perm.icon}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-zinc-200">{perm.label}</div>
                                        <div className="text-xs text-zinc-500">{perm.description}</div>
                                    </div>
                                </div>

                                {loadingPermission === perm.type ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                                ) : (
                                    <Switch
                                        checked={permissions[perm.type]}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                requestPermission(perm.type);
                                            } else {
                                                revokePermission(perm.type);
                                            }
                                        }}
                                    />
                                )}
                            </div>
                        ))}
                    </TabsContent>

                    {/* Connected Accounts Tab */}
                    <TabsContent value="accounts" className="flex-1 overflow-y-auto mt-4 space-y-3">
                        {OAUTH_PROVIDERS.map(provider => {
                            const account = accounts[provider.id];
                            const isConnected = account?.connected;
                            const isLoading = loadingAccount === provider.id;

                            return (
                                <div
                                    key={provider.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                                            style={{ backgroundColor: `${provider.color}15` }}
                                        >
                                            <img
                                                src={provider.logo}
                                                alt={provider.name}
                                                className="w-6 h-6 object-contain"
                                                onError={(e) => {
                                                    // Fallback to first letter if logo fails
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-zinc-200">{provider.name}</div>
                                            <div className="text-xs text-zinc-500">
                                                {isConnected ? (
                                                    <span className="flex items-center gap-1 text-green-400">
                                                        <Check className="w-3 h-3" /> Connected
                                                        {account.username && ` as ${account.username}`}
                                                    </span>
                                                ) : (
                                                    "Not connected"
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant={isConnected ? "destructive" : "outline"}
                                        size="sm"
                                        disabled={isLoading}
                                        onClick={() => {
                                            if (isConnected) {
                                                disconnectAccount(provider.id);
                                            } else {
                                                connectAccount(provider);
                                            }
                                        }}
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : isConnected ? (
                                            "Disconnect"
                                        ) : (
                                            <>
                                                <ExternalLink className="w-3 h-3 mr-1" />
                                                Connect
                                            </>
                                        )}
                                    </Button>
                                </div>
                            );
                        })}

                        <p className="text-xs text-zinc-500 text-center pt-4">
                            Connected accounts allow AI agents to access your data with your permission.
                        </p>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

export default BackpackDialog;
