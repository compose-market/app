import { sdk } from "@/lib/sdk";

export interface BackpackConnectionInfo {
  slug: string;
  name: string;
  connected: boolean;
  accountId?: string;
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

function permissionStorageKey(permission: BackpackCloudPermission): string {
  return `consent_${permission}`;
}

export function getCachedBackpackPermissions(): BackpackCloudPermission[] {
  return BACKPACK_CLOUD_PERMISSION_TYPES.filter((permission) => sessionStorage.getItem(permissionStorageKey(permission)) === "granted");
}

export function cacheBackpackPermission(permission: BackpackCloudPermission, granted: boolean): void {
  if (granted) {
    sessionStorage.setItem(permissionStorageKey(permission), "granted");
    return;
  }
  sessionStorage.removeItem(permissionStorageKey(permission));
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

export async function fetchBackpackConnections(userAddress: string): Promise<BackpackConnectionInfo[]> {
  const payload = await sdk.backpack.connections({ userAddress }) as { connections?: BackpackConnectionInfo[] };
  return Array.isArray(payload.connections) ? payload.connections : [];
}

export async function fetchBackpackPermissions(userAddress: string): Promise<BackpackCloudPermission[]> {
  const payload = await sdk.backpack.permissions.list({ userAddress }) as {
    permissions?: Array<{ consentType?: string; granted?: boolean }>;
  };

  const granted = Array.isArray(payload.permissions)
    ? payload.permissions
      .filter((permission) => permission.granted && typeof permission.consentType === "string" && isBackpackCloudPermission(permission.consentType))
      .map((permission) => permission.consentType as BackpackCloudPermission)
    : [];

  BACKPACK_CLOUD_PERMISSION_TYPES.forEach((permission) => {
    cacheBackpackPermission(permission, granted.includes(permission));
  });

  return granted;
}

export async function grantBackpackPermission(userAddress: string, consentType: BackpackCloudPermission): Promise<void> {
  await sdk.backpack.permissions.grant({ userAddress, consentType });
  cacheBackpackPermission(consentType, true);
}

export async function revokeBackpackPermission(userAddress: string, consentType: BackpackCloudPermission): Promise<void> {
  await sdk.backpack.permissions.revoke({ userAddress, consentType });
  cacheBackpackPermission(consentType, false);
}
