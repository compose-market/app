/**
 * Backend Service API Client
 *
 * Talks to:
 * - Connectors broker (https://connectors.compose.market) — tools catalog,
 *   tool execution, onchain connectors
 * - API Gateway (https://api.compose.market) — via the shared SDK singleton
 */

import { sdk } from "./sdk";
import { normalizeConnectorBinding } from "./connectors";

// Service URLs from environment or defaults
const CONNECTORS_URL = import.meta.env.VITE_CONNECTORS_URL || "https://connectors.compose.market";

// =============================================================================
// Types
// =============================================================================

export interface ConnectorInfo {
  id: string;
  label: string;
  description: string;
  available: boolean;
  missingEnv?: string[];
}

export interface ConnectorTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: "connectorTool";
  connectorId: string;
  toolName: string;
  inputTemplate: Record<string, unknown>;
  saveAs: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface StepLog {
  stepId: string;
  name: string;
  connectorId: string;
  toolName: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "error";
  args: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface WorkflowRunResult {
  workflowId: string;
  success: boolean;
  context: Record<string, unknown>;
  logs: StepLog[];
}

// =============================================================================
// Connectors broker catalog + execution
// =============================================================================

interface ServerSummary {
  slug: string;
  origin: "mcp" | "onchain";
  name: string;
  namespace: string;
  description: string;
  tags: string[];
  category: string | null;
  status: "live" | "credential_gated";
  statefulness: "stateless" | "stateful" | "unknown";
  cardVersion: string;
  inspectedAt: string | null;
}

interface ServerListResponse {
  total: number;
  offset: number;
  limit: number;
  servers: ServerSummary[];
}

const DEFAULT_CONNECTOR_LIMIT = 50;

async function fetchToolSummariesPage(limit = DEFAULT_CONNECTOR_LIMIT, offset = 0): Promise<ServerSummary[]> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${CONNECTORS_URL}/mcps?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch connectors: ${res.status}`);
  }
  const data = await res.json() as ServerListResponse;
  return data.servers || [];
}

export async function getConnectors(): Promise<ConnectorInfo[]> {
  const servers = await fetchToolSummariesPage();
  return servers.map((s) => ({
    id: s.slug,
    label: s.name,
    description: s.description,
    available: true,
  }));
}

export async function getConnectorTools(connectorId: string): Promise<ConnectorTool[]> {
  const res = await fetch(`${CONNECTORS_URL}/mcps/${encodeURIComponent(connectorId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tools for ${connectorId}: ${res.status}`);
  }
  const data = await res.json() as { tools?: ConnectorTool[] };
  return data.tools || [];
}

/**
 * Call a tool on a connector directly. Routes through api/ for x402.
 */
export async function callConnectorTool(
  connectorId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; content: unknown; raw: unknown }> {
  const res = await sdk.fetch(
    `/api/mcps/${encodeURIComponent(connectorId)}/execute/${encodeURIComponent(toolName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Connector call failed: ${text}`);
  }

  return res.json();
}

// =============================================================================
// Connector execution API
// =============================================================================

export interface ConnectorExecutionResult {
  success: boolean;
  connectorId: string;
  tool: string;
  result?: unknown;
  txHash?: string;
  error?: string;
  content?: unknown;
}

export async function executeGoatPlugin(
  connectorId: string,
  tool: string,
  args: Record<string, unknown>
): Promise<ConnectorExecutionResult> {
  const res = await sdk.fetch(
    `/api/onchain/${encodeURIComponent(connectorId)}/execute/${encodeURIComponent(tool)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args }),
    },
  );
  return res.json();
}

export async function executeSpawnedServer(
  slug: string,
  tool: string,
  args: Record<string, unknown>
): Promise<ConnectorExecutionResult> {
  const res = await sdk.fetch(
    `/api/mcps/${encodeURIComponent(slug)}/execute/${encodeURIComponent(tool)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args }),
    },
  );

  const data = await res.json() as { ok?: boolean; result?: unknown; kind?: string; message?: string };
  return {
    success: Boolean(data.ok),
    connectorId: slug,
    tool,
    content: data.result,
    error: data.ok ? undefined : (data.message || data.kind),
  };
}

export async function fetchToolsConnectorTools(
  serverSlug: string
): Promise<{ name: string; description?: string; inputSchema?: Record<string, unknown> }[]> {
  const res = await fetch(`${CONNECTORS_URL}/mcps/${encodeURIComponent(serverSlug)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `Failed to fetch tools: ${res.status}`);
  }
  const data = await res.json() as { tools?: ConnectorTool[] };
  return data.tools || [];
}

export async function fetchRemoteToolsConnectorTools(serverSlug: string): Promise<ConnectorTool[]> {
  try {
    const res = await fetch(`${CONNECTORS_URL}/mcps/${encodeURIComponent(serverSlug)}`);
    if (!res.ok) {
      console.warn(`Failed to fetch tools for ${serverSlug}: ${res.status}`);
      return [];
    }
    const data = await res.json() as { tools?: ConnectorTool[] };
    return data.tools || [];
  } catch (error) {
    console.warn(`Error fetching tools for ${serverSlug}:`, error);
    return [];
  }
}

/**
 * Execute a registry server tool based on origin.
 */
export async function executeRegistryTool(
  registryId: string,
  origin: string,
  slug: string,
  tool: string,
  args: Record<string, unknown>,
  _connectorId?: string
): Promise<ConnectorExecutionResult> {
  const binding = normalizeConnectorBinding({ registryId, origin, slug }, { defaultOrigin: "mcp" });
  if (binding.origin === "onchain") {
    const connectorId = binding.slug;
    return executeGoatPlugin(connectorId, tool, args);
  }
  return executeSpawnedServer(binding.slug, tool, args);
}

// =============================================================================
// Health Checks
// =============================================================================

export interface ServiceHealth {
  status: "ok" | "error";
  service: string;
  version?: string;
  timestamp?: string;
  error?: string;
}

export async function checkConnectorsHealth(): Promise<ServiceHealth> {
  try {
    const res = await fetch(`${CONNECTORS_URL}/`);
    const data = await res.json() as { service?: string; ok?: boolean; timestamp?: string };
    return {
      status: data.ok ? "ok" : "error",
      service: data.service || "connectors",
      timestamp: data.timestamp,
    };
  } catch (error) {
    return { status: "error", service: "connectors", error: String(error) };
  }
}

// Backwards-compat alias used by callers that haven't been updated yet.
export const checkConnectorHealth = checkConnectorsHealth;

export async function checkAllServicesHealth(): Promise<{
  connector: ServiceHealth;
  allHealthy: boolean;
}> {
  const connector = await checkConnectorsHealth();
  return {
    connector,
    allHealthy: connector.status === "ok",
  };
}
