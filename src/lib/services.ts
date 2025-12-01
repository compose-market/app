/**
 * Backend Service API Client
 * 
 * Provides typed functions for interacting with:
 * - Connector Hub (https://connector.compose.market)
 * - Sandbox Service (https://sandbox.compose.market)
 * - Exporter Service (https://exporter.compose.market)
 */

// Service URLs from environment or defaults
const CONNECTOR_URL = import.meta.env.VITE_CONNECTOR_SERVICE_URL || "https://connector.compose.market";
const SANDBOX_URL = import.meta.env.VITE_SANDBOX_SERVICE_URL || "https://sandbox.compose.market";
const EXPORTER_URL = import.meta.env.VITE_EXPORTER_SERVICE_URL || "https://exporter.compose.market";

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

export interface ExportOptions {
  workflow: WorkflowDefinition;
  projectName?: string;
  description?: string;
  author?: string;
}

// =============================================================================
// Connector Hub API
// =============================================================================

/**
 * Fetch list of available connectors
 */
export async function getConnectors(): Promise<ConnectorInfo[]> {
  const res = await fetch(`${CONNECTOR_URL}/connectors`);
  if (!res.ok) {
    throw new Error(`Failed to fetch connectors: ${res.status}`);
  }
  const data = await res.json();
  return data.connectors;
}

/**
 * Fetch tools for a specific connector
 */
export async function getConnectorTools(connectorId: string): Promise<ConnectorTool[]> {
  const res = await fetch(`${CONNECTOR_URL}/connectors/${encodeURIComponent(connectorId)}/tools`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tools for ${connectorId}: ${res.status}`);
  }
  const data = await res.json();
  return data.tools;
}

/**
 * Call a tool on a connector directly
 */
export async function callConnectorTool(
  connectorId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; content: unknown; raw: unknown }> {
  const res = await fetch(`${CONNECTOR_URL}/connectors/${encodeURIComponent(connectorId)}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, args }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Connector call failed: ${text}`);
  }
  
  return res.json();
}

// =============================================================================
// Sandbox API
// =============================================================================

/**
 * Execute a workflow in the sandbox
 */
export async function runWorkflow(
  workflow: WorkflowDefinition,
  input: Record<string, unknown> = {}
): Promise<WorkflowRunResult> {
  const res = await fetch(`${SANDBOX_URL}/sandbox/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow, input }),
  });
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `Workflow execution failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Validate a workflow without executing
 */
export async function validateWorkflow(
  workflow: WorkflowDefinition
): Promise<{ valid: boolean; errors: string[] }> {
  const res = await fetch(`${SANDBOX_URL}/sandbox/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `Validation failed: ${res.status}`);
  }
  
  return res.json();
}

/**
 * Fetch connectors via sandbox proxy
 */
export async function getSandboxConnectors(): Promise<ConnectorInfo[]> {
  const res = await fetch(`${SANDBOX_URL}/sandbox/connectors`);
  if (!res.ok) {
    throw new Error(`Failed to fetch connectors: ${res.status}`);
  }
  const data = await res.json();
  return data.connectors;
}

// =============================================================================
// Exporter API
// =============================================================================

/**
 * Export a workflow as a downloadable zip file
 */
export async function exportWorkflow(options: ExportOptions): Promise<Blob> {
  const res = await fetch(`${EXPORTER_URL}/export/workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `Export failed: ${res.status}`);
  }
  
  return res.blob();
}

/**
 * Export and automatically trigger download
 */
export async function downloadWorkflow(options: ExportOptions): Promise<void> {
  const blob = await exportWorkflow(options);
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${options.projectName || options.workflow.name || "workflow"}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

export async function checkConnectorHealth(): Promise<ServiceHealth> {
  try {
    const res = await fetch(`${CONNECTOR_URL}/health`);
    return res.json();
  } catch (error) {
    return { status: "error", service: "connector", error: String(error) };
  }
}

export async function checkSandboxHealth(): Promise<ServiceHealth> {
  try {
    const res = await fetch(`${SANDBOX_URL}/health`);
    return res.json();
  } catch (error) {
    return { status: "error", service: "sandbox", error: String(error) };
  }
}

export async function checkExporterHealth(): Promise<ServiceHealth> {
  try {
    const res = await fetch(`${EXPORTER_URL}/health`);
    return res.json();
  } catch (error) {
    return { status: "error", service: "exporter", error: String(error) };
  }
}

export async function checkAllServicesHealth(): Promise<{
  connector: ServiceHealth;
  sandbox: ServiceHealth;
  exporter: ServiceHealth;
  allHealthy: boolean;
}> {
  const [connector, sandbox, exporter] = await Promise.all([
    checkConnectorHealth(),
    checkSandboxHealth(),
    checkExporterHealth(),
  ]);
  
  return {
    connector,
    sandbox,
    exporter,
    allHealthy: 
      connector.status === "ok" && 
      sandbox.status === "ok" && 
      exporter.status === "ok",
  };
}

