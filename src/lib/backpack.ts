import { sdk } from "@/lib/sdk";

export interface BackpackConnectionInfo {
  slug: string;
  name: string;
  connected: boolean;
  accountId?: string;
  connectedAccountId?: string;
  status?: string;
}

export const BACKPACK_CLOUD_PERMISSION_TYPES = [
  "filesystem",
  "camera",
  "microphone",
  "geolocation",
  "clipboard",
  "notifications",
] as const;

export type BackpackCloudPermission = typeof BACKPACK_CLOUD_PERMISSION_TYPES[number];

function isBackpackCloudPermission(value: string): value is BackpackCloudPermission {
  return BACKPACK_CLOUD_PERMISSION_TYPES.includes(value as BackpackCloudPermission);
}

function permissionStorageKey(agentWallet: string, permission: BackpackCloudPermission): string {
  return `consent_${agentWallet.toLowerCase()}_${permission}`;
}

export function getCachedBackpackPermissions(agentWallet?: string | null): BackpackCloudPermission[] {
  if (!agentWallet) return [];
  return BACKPACK_CLOUD_PERMISSION_TYPES.filter((permission) => (
    sessionStorage.getItem(permissionStorageKey(agentWallet, permission)) === "granted"
  ));
}

export function cacheBackpackPermission(agentWallet: string, permission: BackpackCloudPermission, granted: boolean): void {
  const key = permissionStorageKey(agentWallet, permission);
  if (granted) {
    sessionStorage.setItem(key, "granted");
    return;
  }
  sessionStorage.removeItem(key);
}

export function resolveBackpackUserId(preferred?: string | null): string {
  if (preferred && preferred.trim().length > 0) {
    return preferred;
  }

  const existing = sessionStorage.getItem("composio_anon_id");
  if (existing) {
    return existing;
  }

  const created = `anon_${crypto.randomUUID()}`;
  sessionStorage.setItem("composio_anon_id", created);
  return created;
}

export async function fetchBackpackConnections(userAddress: string, agentWallet: string): Promise<BackpackConnectionInfo[]> {
  const payload = await sdk.accounts.list({ userAddress, agentWallet }) as { connections?: BackpackConnectionInfo[] };
  return Array.isArray(payload.connections) ? payload.connections : [];
}

export async function fetchBackpackPermissions(userAddress: string, agentWallet: string): Promise<BackpackCloudPermission[]> {
  const payload = await sdk.permissions.list({ userAddress, agentWallet }) as {
    permissions?: Array<{ consentType?: string; granted?: boolean }>;
  };

  const granted = Array.isArray(payload.permissions)
    ? payload.permissions
      .filter((permission) => permission.granted && typeof permission.consentType === "string" && isBackpackCloudPermission(permission.consentType))
      .map((permission) => permission.consentType as BackpackCloudPermission)
    : [];

  BACKPACK_CLOUD_PERMISSION_TYPES.forEach((permission) => {
    cacheBackpackPermission(agentWallet, permission, granted.includes(permission));
  });

  return granted;
}

export async function grantBackpackPermission(userAddress: string, agentWallet: string, consentType: BackpackCloudPermission): Promise<void> {
  await sdk.permissions.grant({ userAddress, agentWallet, consentType });
  cacheBackpackPermission(agentWallet, consentType, true);
}

export async function revokeBackpackPermission(userAddress: string, agentWallet: string, consentType: BackpackCloudPermission): Promise<void> {
  await sdk.permissions.revoke({ userAddress, agentWallet, consentType });
  cacheBackpackPermission(agentWallet, consentType, false);
}
