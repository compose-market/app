/**
 * Playground - Test models and MCP plugins with x402 payment
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useActiveWallet } from "thirdweb/react";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { useSession } from "@/hooks/use-session";
import { SessionBudgetDialog } from "@/components/session";
import { thirdwebClient, INFERENCE_PRICE_WEI } from "@/lib/thirdweb";
import { createNormalizedFetch } from "@/lib/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Bot,
  User,
  Loader2,
  Zap,
  Settings2,
  Sparkles,
  DollarSign,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Music,
  FileText,
  AlertCircle,
  Plug,
  Play,
  Terminal,
  Paperclip,
  X,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadConversationFile,
  cleanupConversationFiles,
  getIpfsUrl,
  fileToDataUrl
} from "@/lib/pinata";

// =============================================================================
// Types
// =============================================================================

interface Model {
  id: string;
  name: string;
  source: string;
  ownedBy: string;
  available: boolean;
  task?: string;
  pricing?: {
    provider: string;
    inputPerMillion: number;
    outputPerMillion: number;
  };
  architecture?: {
    inputModalities: string[];
    outputModalities: string[];
  };
}

// Task categories will be dynamically generated from available models

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  type?: "text" | "image" | "audio" | "embedding";
  imageUrl?: string;
  audioUrl?: string;
}

interface GoatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  example?: Record<string, unknown>;
}

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  toolCount: number;
  requiresApiKey?: boolean;
  apiKeyConfigured?: boolean;
}

interface PluginResult {
  success: boolean;
  pluginId: string;
  tool: string;
  result?: unknown;
  error?: string;
  txHash?: string;
  explorer?: string;
  executedBy?: string;
  source?: "goat" | "mcp" | "eliza";
  executionTime?: number;
}

// Eliza Plugin types
interface ElizaPlugin {
  id: string;
  package: string;
  source?: string;
  description?: string;
  version?: string;
  supports?: {
    v0: boolean;
    v1: boolean;
  };
}

interface ElizaActionParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  example?: unknown;
}

interface ElizaAction {
  name: string;
  description: string;
  similes: string[];
  parameters: ElizaActionParameter[];
  examples: Array<{ input: string; output?: string }>;
}

interface ElizaPluginsResponse {
  count: number;
  plugins: ElizaPlugin[];
}

interface ElizaActionsResponse {
  pluginId: string;
  package: string;
  description?: string;
  actionCount: number;
  actions: ElizaAction[];
}

interface GoatStatus {
  initialized: boolean;
  walletAddress: string | null;
  chain: string | null;
  totalTools: number;
  plugins: PluginInfo[];
}

// MCP Server types
interface McpServer {
  slug: string;
  label: string;
  description: string;
  spawned: boolean;
  available: boolean;
  remote?: boolean;
  category?: string;
  tags?: string[];
  missingEnv?: string[];
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface McpServersResponse {
  count: number;
  spawnable: number;
  remote: number;
  servers: McpServer[];
}

interface McpToolsResponse {
  server: string;
  toolCount: number;
  tools: McpTool[];
}

// Plugin source type - GOAT, MCP, Eliza
type PluginSource = "goat" | "mcp" | "eliza";

// Remove trailing slashes to prevent double-slash URL issues
const API_BASE = (import.meta.env.VITE_API_URL || "https://api.compose.market").replace(/\/+$/, "");
const CONNECTOR_URL = (import.meta.env.VITE_CONNECTOR_URL || "https://connector.compose.market").replace(/\/+$/, "");

// Helper to generate default args from JSON schema
function generateDefaultArgs(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const props = (schema as { properties?: Record<string, { type?: string; default?: unknown; description?: string }> }).properties;
  if (!props) return result;

  for (const [key, prop] of Object.entries(props)) {
    if (prop.default !== undefined) {
      result[key] = prop.default;
    } else if (prop.type === "string") {
      // Use placeholder based on key name
      if (key.toLowerCase().includes("address")) {
        result[key] = "0x...";
      } else if (key.toLowerCase().includes("amount")) {
        result[key] = "0";
      } else {
        result[key] = "";
      }
    } else if (prop.type === "number" || prop.type === "integer") {
      result[key] = 0;
    } else if (prop.type === "boolean") {
      result[key] = false;
    } else if (prop.type === "array") {
      result[key] = [];
    } else if (prop.type === "object") {
      result[key] = {};
    }
  }
  return result;
}

// Helper to format schema as hint text
function formatSchemaHint(schema: Record<string, unknown>): string {
  const props = (schema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
  const required = (schema as { required?: string[] }).required || [];
  if (!props) return "No parameters required";

  const lines: string[] = [];
  for (const [key, prop] of Object.entries(props)) {
    const isRequired = required.includes(key);
    const desc = prop.description || "";
    lines.push(`• ${key}${isRequired ? " *" : ""} (${prop.type || "any"}): ${desc}`);
  }
  return lines.join("\n");
}

// Task type color mapping for visual badges
const TASK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "text-generation": { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40" },
  "text2text-generation": { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/40" },
  "text-to-image": { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40" },
  "image-to-image": { bg: "bg-fuchsia-500/20", text: "text-fuchsia-400", border: "border-fuchsia-500/40" },
  "text-to-speech": { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/40" },
  "automatic-speech-recognition": { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/40" },
  "feature-extraction": { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/40" },
  "sentence-similarity": { bg: "bg-sky-500/20", text: "text-sky-400", border: "border-sky-500/40" },
  "text-classification": { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/40" },
  "image-classification": { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/40" },
  "conversational": { bg: "bg-teal-500/20", text: "text-teal-400", border: "border-teal-500/40" },
  "translation": { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/40" },
  "summarization": { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/40" },
};

function getTaskStyle(task?: string) {
  return TASK_COLORS[task || ""] || { bg: "bg-zinc-500/20", text: "text-zinc-400", border: "border-zinc-500/40" };
}

function getTaskLabel(task?: string) {
  if (!task) return "Other";
  return task.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// =============================================================================
// Main Component
// =============================================================================

export default function PlaygroundPage() {
  const wallet = useActiveWallet();
  const { sessionActive, budgetRemaining, formatBudget, recordUsage } = useSession();

  // Tab state - check URL params for pre-selected plugin
  const [activeTab, setActiveTab] = useState<"model" | "plugins">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "plugins" ? "plugins" : "model";
  });

  // Models
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Model filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState("all");
  const [taskCategories, setTaskCategories] = useState<{ id: string; label: string; count: number }[]>([]);

  // Model Test State
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful AI assistant.");
  const [showSettings, setShowSettings] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  // Plugins Test State - Common
  const [pluginSource, setPluginSource] = useState<PluginSource>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("source") as PluginSource) || "goat";
  });
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [toolArgs, setToolArgs] = useState<string>("{}");
  const [toolSchema, setToolSchema] = useState<Record<string, unknown> | null>(null);
  const [pluginResults, setPluginResults] = useState<PluginResult[]>([]);
  const [executingPlugin, setExecutingPlugin] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);

  // GOAT Plugins State
  const [goatStatus, setGoatStatus] = useState<GoatStatus | null>(null);
  const [pluginTools, setPluginTools] = useState<GoatTool[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    return source !== "mcp" ? params.get("plugin") || "" : "";
  });

  // MCP Servers State
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    return source === "mcp" ? params.get("plugin") || "" : "";
  });

  // Eliza Plugins State
  const [elizaPlugins, setElizaPlugins] = useState<ElizaPlugin[]>([]);
  const [elizaActions, setElizaActions] = useState<ElizaAction[]>([]);
  const [selectedElizaPlugin, setSelectedElizaPlugin] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    return source === "eliza" ? params.get("plugin") || "" : "";
  });
  const [selectedElizaAction, setSelectedElizaAction] = useState<string>("");

  // File Attachment State
  interface AttachedFile {
    file: File;
    cid?: string;  // Pinata CID once uploaded
    url?: string;  // IPFS gateway URL
    preview?: string;  // Local preview data URL
    uploading: boolean;
    type: "image" | "audio";
  }
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploadedCids, setUploadedCids] = useState<string[]>([]); // Track for cleanup
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string>(`conv-${Date.now()}`);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  // NOTE: Plugin/MCP fetching is handled in the MCP Server Handlers section below

  const fetchModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const response = await fetch(`${API_BASE}/api/models`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const data = await response.json();
      const modelList = data.models || [];
      setModels(modelList);

      // Build task categories from model tasks
      const taskCounts: Record<string, number> = {};
      for (const m of modelList) {
        const task = m.task || "unknown";
        taskCounts[task] = (taskCounts[task] || 0) + 1;
      }
      const categories = Object.entries(taskCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count desc
        .map(([id, count]) => ({
          id,
          label: id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          count,
        }));
      setTaskCategories([{ id: "all", label: "All", count: modelList.length }, ...categories]);

      if (modelList.length > 0 && !selectedModel) {
        setSelectedModel(modelList[0].id);
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "Failed to fetch models");
    } finally {
      setModelsLoading(false);
    }
  };

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filtered models based on search and task filter
  const filteredModels = models.filter((model) => {
    // Task filter
    if (selectedTask !== "all" && model.task !== selectedTask) {
      return false;
    }
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query) ||
        model.source.toLowerCase().includes(query) ||
        (model.ownedBy && model.ownedBy.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // Get selected model info
  const selectedModelInfo = models.find((m) => m.id === selectedModel);

  // Determine output type from task
  const getOutputType = (task: string): "text" | "image" | "audio" | "embedding" => {
    const t = task.toLowerCase();
    if (t.includes("image") || t.includes("video")) return "image";
    if (t.includes("audio") || t.includes("speech")) return "audio";
    if (t.includes("embed") || t.includes("feature") || t.includes("similarity")) return "embedding";
    return "text";
  };

  const modelTask = selectedModelInfo?.task || "text-generation";
  const outputType = getOutputType(modelTask);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSendMessage = useCallback(async () => {
    if (attachedFiles.some(f => f.uploading)) return;
    if ((!inputValue.trim() && attachedFiles.length === 0) || streaming || !selectedModel) return;

    const attached = attachedFiles[0];
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
      type: outputType,
      imageUrl: attached?.type === "image" ? attached.url : undefined,
      audioUrl: attached?.type === "audio" ? attached.url : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setAttachedFiles([]); // Clear attachment from input after sending
    setStreaming(true);
    setInferenceError(null);

    // Create assistant placeholder
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), type: outputType },
    ]);

    try {
      if (!wallet) {
        throw new Error("Connect wallet to use inference");
      }

      // x402 payment - exactly as in starter kit
      const normalizedFetch = createNormalizedFetch();
      const fetchWithPayment = wrapFetchWithPayment(
        normalizedFetch,
        thirdwebClient,
        wallet,
        { maxValue: BigInt(INFERENCE_PRICE_WEI) } // $0.005
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add session headers if session is active
      if (sessionActive && budgetRemaining > 0) {
        headers["x-session-active"] = "true";
        headers["x-session-budget-remaining"] = budgetRemaining.toString();
      }

      // Build request body based on output type and attachments
      let requestBody: Record<string, unknown>;

      if (attached) {
        // Handle attached file (image-to-image, ASR, etc.)
        const base64Data = await fileToDataUrl(attached.file);
        const base64Content = base64Data.split(",")[1]; // Strip data:mime;base64,

        if (modelTask === "image-to-image" || modelTask === "image-classification") {
          // Image-to-image requires 'image' and 'prompt'
          requestBody = { image: base64Content, prompt: userMessage.content };
        } else if (modelTask === "automatic-speech-recognition") {
          // ASR requires 'audio'
          requestBody = { audio: base64Content };
        } else {
          // Fallback generic
          requestBody = { prompt: userMessage.content, image: base64Content };
        }
      } else if (outputType === "image") {
        requestBody = { prompt: userMessage.content };
      } else if (outputType === "audio") {
        requestBody = { text: userMessage.content };
      } else if (outputType === "embedding") {
        requestBody = { text: userMessage.content };
      } else {
        requestBody = {
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          systemPrompt,
        };
      }

      const response = await fetchWithPayment(`${API_BASE}/api/inference/${encodeURIComponent(selectedModel)}`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[x402] Response failed:', response.status, JSON.stringify(errorData, null, 2));
        throw new Error(errorData.message || errorData.error || `Inference failed: ${response.status}`);
      }

      // Handle different response types based on model
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Streaming text response
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullResponse } : m
            )
          );
        }

        const estimatedTokens = Math.ceil(fullResponse.length / 4);
        recordUsage(estimatedTokens);
      } else if (contentType.includes("image")) {
        // Image response
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "Generated image:", imageUrl, type: "image" } : m
          )
        );
        recordUsage(1000);
      } else if (contentType.includes("audio")) {
        // Audio response
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "Generated audio:", audioUrl, type: "audio" } : m
          )
        );
        recordUsage(500);
      } else {
        // JSON response (embeddings, etc.)
        const data = await response.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: JSON.stringify(data, null, 2), type: "embedding" } : m
          )
        );
        recordUsage(100);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setInferenceError(errorMsg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${errorMsg}` } : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }, [inputValue, streaming, selectedModel, messages, systemPrompt, wallet, budgetRemaining, recordUsage, outputType]);


  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const type = file.type.startsWith("image/") ? "image" : "audio";

      try {
        const preview = await fileToDataUrl(file);

        const newFile: AttachedFile = {
          file,
          preview,
          uploading: true,
          type: type as "image" | "audio"
        };

        setAttachedFiles([newFile]); // Replace (single file mode for now)
        setInferenceError(null);

        // Upload to Pinata
        const { cid, url } = await uploadConversationFile(file, conversationIdRef.current);
        setAttachedFiles(prev => prev.map(f => f.file === file ? { ...f, cid, url, uploading: false } : f));
        setUploadedCids(prev => [...prev, cid]);
      } catch (err) {
        console.error("Upload failed", err);
        setAttachedFiles([]);
        setInferenceError("Failed to upload file");
      }
    }
  }, []);

  const handleRemoveFile = useCallback((file: File) => {
    setAttachedFiles(prev => prev.filter(f => f.file !== file));
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setInferenceError(null);
    setAttachedFiles([]);

    // Cleanup Pinata files
    if (uploadedCids.length > 0) {
      cleanupConversationFiles(uploadedCids).then(() => setUploadedCids([]));
    }
  }, [uploadedCids]);

  // ==========================================================================
  // Plugin Test Handlers
  // ==========================================================================

  const fetchPluginStatus = async () => {
    setPluginsLoading(true);
    try {
      const response = await fetch(`${CONNECTOR_URL}/plugins/status`);
      if (!response.ok) throw new Error(`Failed to fetch status: ${response.status}`);
      const data = await response.json();
      setGoatStatus(data);

      // Auto-select first plugin if none selected
      if (!selectedPlugin && data.plugins?.length > 0) {
        setSelectedPlugin(data.plugins[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch plugin status:", err);
      setPluginError(err instanceof Error ? err.message : "Failed to connect to plugin server");
    } finally {
      setPluginsLoading(false);
    }
  };

  const fetchPluginTools = async (pluginId: string) => {
    try {
      const response = await fetch(`${CONNECTOR_URL}/plugins/${encodeURIComponent(pluginId)}/tools`);
      if (!response.ok) throw new Error(`Failed to fetch tools: ${response.status}`);
      const data = await response.json();
      setPluginTools(data.tools || []);

      // Auto-select first tool if none selected
      if (data.tools?.length > 0) {
        setSelectedTool(data.tools[0].name);
        setToolSchema(data.tools[0].parameters);
        // Generate default args from schema
        const defaultArgs = data.tools[0].example || generateDefaultArgs(data.tools[0].parameters);
        setToolArgs(JSON.stringify(defaultArgs, null, 2));
      }
    } catch (err) {
      console.error("Failed to fetch plugin tools:", err);
      setPluginTools([]);
    }
  };

  // Get current tool info
  const currentTool = pluginTools.find(t => t.name === selectedTool);

  // Update args when tool is selected
  const handleToolSelect = useCallback((toolName: string) => {
    setSelectedTool(toolName);
    const tool = pluginTools.find(t => t.name === toolName);
    if (tool) {
      setToolSchema(tool.parameters);
      const defaultArgs = tool.example || generateDefaultArgs(tool.parameters);
      setToolArgs(JSON.stringify(defaultArgs, null, 2));
    }
  }, [pluginTools]);

  // Handle plugin change
  const handlePluginChange = useCallback((pluginId: string) => {
    setSelectedPlugin(pluginId);
    setSelectedTool("");
    setToolSchema(null);
    setToolArgs("{}");
  }, []);

  const handleExecutePlugin = useCallback(async () => {
    if (!selectedPlugin || !selectedTool || executingPlugin) return;

    if (!wallet) {
      setPluginError("Connect wallet to execute plugins");
      return;
    }

    // Validate JSON first
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolArgs);
    } catch (e) {
      setPluginError(`Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}. Check your input format.`);
      return;
    }

    setExecutingPlugin(true);
    setPluginError(null);

    try {
      // x402 payment
      const normalizedFetch = createNormalizedFetch();
      const fetchWithPayment = wrapFetchWithPayment(
        normalizedFetch,
        thirdwebClient,
        wallet,
        { maxValue: BigInt(INFERENCE_PRICE_WEI) } // $0.005
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add session headers if session is active
      if (sessionActive && budgetRemaining > 0) {
        headers["x-session-active"] = "true";
        headers["x-session-budget-remaining"] = budgetRemaining.toString();
      }

      // Execute via connector
      const response = await fetchWithPayment(`${CONNECTOR_URL}/plugins/${encodeURIComponent(selectedPlugin)}/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tool: selectedTool, args }),
      });

      const data = await response.json();

      const result: PluginResult = {
        success: data.success ?? response.ok,
        pluginId: selectedPlugin,
        tool: selectedTool,
        result: data.result,
        error: data.error || data.hint,
        txHash: data.txHash,
        explorer: data.explorer,
        executedBy: data.executedBy,
      };

      setPluginResults((prev) => [...prev, result]);

      // Record usage
      if (data.success) {
        recordUsage(1000); // $0.001 per successful execution
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setPluginError(errorMsg);
      setPluginResults((prev) => [
        ...prev,
        { success: false, pluginId: selectedPlugin, tool: selectedTool, error: errorMsg },
      ]);
    } finally {
      setExecutingPlugin(false);
    }
  }, [selectedPlugin, selectedTool, toolArgs, executingPlugin, wallet, sessionActive, budgetRemaining, recordUsage]);

  const handleClearResults = useCallback(() => {
    setPluginResults([]);
    setPluginError(null);
  }, []);

  // ==========================================================================
  // MCP Server Handlers
  // ==========================================================================

  const fetchMcpServers = async () => {
    setPluginsLoading(true);
    try {
      const response = await fetch(`${CONNECTOR_URL}/mcp/servers`);
      if (!response.ok) throw new Error(`Failed to fetch MCP servers: ${response.status}`);
      const data: McpServersResponse = await response.json();
      // Filter to only available servers
      const availableServers = data.servers.filter(s => s.available);
      setMcpServers(availableServers);

      // Auto-select first server if none selected
      if (!selectedMcpServer && availableServers.length > 0) {
        setSelectedMcpServer(availableServers[0].slug);
      }
    } catch (err) {
      console.error("Failed to fetch MCP servers:", err);
      setPluginError(err instanceof Error ? err.message : "Failed to connect to MCP server");
    } finally {
      setPluginsLoading(false);
    }
  };

  const fetchMcpTools = async (slug: string) => {
    setPluginsLoading(true);
    try {
      const response = await fetch(`${CONNECTOR_URL}/mcp/servers/${encodeURIComponent(slug)}/tools`);
      if (!response.ok) throw new Error(`Failed to fetch MCP tools: ${response.status}`);
      const data: McpToolsResponse = await response.json();
      setMcpTools(data.tools || []);

      // Auto-select first tool if none selected
      if (data.tools?.length > 0) {
        setSelectedTool(data.tools[0].name);
        setToolSchema(data.tools[0].inputSchema);
        const defaultArgs = generateDefaultArgs(data.tools[0].inputSchema);
        setToolArgs(JSON.stringify(defaultArgs, null, 2));
      }
    } catch (err) {
      console.error("Failed to fetch MCP tools:", err);
      setMcpTools([]);
      setPluginError(err instanceof Error ? err.message : "Failed to fetch tools");
    } finally {
      setPluginsLoading(false);
    }
  };

  // Handle MCP server change
  const handleMcpServerChange = useCallback((slug: string) => {
    setSelectedMcpServer(slug);
    setSelectedTool("");
    setToolSchema(null);
    setToolArgs("{}");
    setMcpTools([]);
  }, []);

  // Handle MCP tool select
  const handleMcpToolSelect = useCallback((toolName: string) => {
    setSelectedTool(toolName);
    const tool = mcpTools.find(t => t.name === toolName);
    if (tool) {
      setToolSchema(tool.inputSchema);
      const defaultArgs = generateDefaultArgs(tool.inputSchema);
      setToolArgs(JSON.stringify(defaultArgs, null, 2));
    }
  }, [mcpTools]);

  // Get current MCP tool info
  const currentMcpTool = mcpTools.find(t => t.name === selectedTool);

  // Execute MCP tool
  const handleExecuteMcpTool = useCallback(async () => {
    if (!selectedMcpServer || !selectedTool || executingPlugin) return;

    if (!wallet) {
      setPluginError("Connect wallet to execute MCP tools");
      return;
    }

    // Validate JSON first
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolArgs);
    } catch (e) {
      setPluginError(`Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}. Check your input format.`);
      return;
    }

    setExecutingPlugin(true);
    setPluginError(null);

    try {
      // x402 payment
      const normalizedFetch = createNormalizedFetch();
      const fetchWithPayment = wrapFetchWithPayment(
        normalizedFetch,
        thirdwebClient,
        wallet,
        { maxValue: BigInt(INFERENCE_PRICE_WEI) } // $0.005
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add session headers if session is active
      if (sessionActive && budgetRemaining > 0) {
        headers["x-session-active"] = "true";
        headers["x-session-budget-remaining"] = budgetRemaining.toString();
      }

      // Execute via connector MCP proxy
      const response = await fetchWithPayment(`${CONNECTOR_URL}/mcp/servers/${encodeURIComponent(selectedMcpServer)}/call`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tool: selectedTool, args }),
      });

      const data = await response.json();

      const result: PluginResult = {
        success: data.success ?? response.ok,
        pluginId: selectedMcpServer,
        tool: selectedTool,
        result: data.content,
        error: data.error || data.message,
        source: "mcp",
      };

      setPluginResults((prev) => [...prev, result]);

      // Record usage
      if (data.success) {
        recordUsage(1000); // $0.001 per successful execution
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setPluginError(errorMsg);
      setPluginResults((prev) => [
        ...prev,
        { success: false, pluginId: selectedMcpServer, tool: selectedTool, error: errorMsg, source: "mcp" },
      ]);
    } finally {
      setExecutingPlugin(false);
    }
  }, [selectedMcpServer, selectedTool, toolArgs, executingPlugin, wallet, sessionActive, budgetRemaining, recordUsage]);

  // ==========================================================================
  // Eliza Plugin Handlers
  // ==========================================================================

  const fetchElizaPlugins = async () => {
    setPluginsLoading(true);
    try {
      const response = await fetch(`${CONNECTOR_URL}/eliza/plugins`);
      if (!response.ok) throw new Error(`Failed to fetch Eliza plugins: ${response.status}`);
      const data: ElizaPluginsResponse = await response.json();
      setElizaPlugins(data.plugins || []);
    } catch (err) {
      console.error("Failed to fetch Eliza plugins:", err);
      setPluginError(err instanceof Error ? err.message : "Failed to fetch Eliza plugins");
    } finally {
      setPluginsLoading(false);
    }
  };

  const fetchElizaActions = async (pluginId: string) => {
    setPluginsLoading(true);
    setElizaActions([]);
    try {
      const response = await fetch(`${CONNECTOR_URL}/eliza/plugins/${encodeURIComponent(pluginId)}/actions`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch actions: ${response.status}`);
      }
      const data: ElizaActionsResponse = await response.json();
      setElizaActions(data.actions || []);

      // If actions exist, select the first one
      if (data.actions?.length > 0) {
        handleElizaActionChange(data.actions[0].name);
      }
    } catch (err) {
      console.error("Failed to fetch Eliza actions:", err);
      setPluginError(err instanceof Error ? err.message : "Failed to fetch actions");
    } finally {
      setPluginsLoading(false);
    }
  };

  const handleElizaPluginChange = (pluginId: string) => {
    setSelectedElizaPlugin(pluginId);
    setSelectedElizaAction("");
    setElizaActions([]);
    setSelectedTool("");
    setToolSchema(null);
    setToolArgs("{}");
    setPluginError(null);
    if (pluginId) {
      fetchElizaActions(pluginId);
    }
  };

  const handleElizaActionChange = (actionName: string) => {
    setSelectedElizaAction(actionName);
    setSelectedTool(actionName);
    setPluginError(null);

    // Find the action schema and generate default args
    const action = elizaActions.find(a => a.name === actionName);
    if (action) {
      // Build args from parameters
      const defaultArgs: Record<string, unknown> = {};
      for (const param of action.parameters) {
        if (param.example !== undefined) {
          defaultArgs[param.name] = param.example;
        } else if (param.default !== undefined) {
          defaultArgs[param.name] = param.default;
        } else if (param.required) {
          // Provide placeholder based on type
          switch (param.type) {
            case "string":
              defaultArgs[param.name] = param.enum?.[0] || "";
              break;
            case "number":
              defaultArgs[param.name] = 0;
              break;
            case "boolean":
              defaultArgs[param.name] = false;
              break;
            case "array":
              defaultArgs[param.name] = [];
              break;
            case "object":
              defaultArgs[param.name] = {};
              break;
          }
        }
      }
      setToolArgs(JSON.stringify(defaultArgs, null, 2));

      // Store schema for hints display
      setToolSchema({
        properties: action.parameters.reduce((acc, p) => {
          acc[p.name] = {
            type: p.type,
            description: p.description,
            enum: p.enum,
            default: p.default,
          };
          return acc;
        }, {} as Record<string, unknown>),
        required: action.parameters.filter(p => p.required).map(p => p.name),
      });
    }
  };

  const handleElizaExecution = useCallback(async () => {
    if (!selectedElizaPlugin || !selectedElizaAction || executingPlugin) return;

    if (!wallet) {
      setPluginError("Connect wallet to execute Eliza actions");
      return;
    }

    // Validate JSON first
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(toolArgs);
    } catch (e) {
      setPluginError(`Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}. Check your input format.`);
      return;
    }

    setExecutingPlugin(true);
    setPluginError(null);

    try {
      // x402 payment
      const normalizedFetch = createNormalizedFetch();
      const fetchWithPayment = wrapFetchWithPayment(
        normalizedFetch,
        thirdwebClient,
        wallet,
        { maxValue: BigInt(INFERENCE_PRICE_WEI) } // $0.005
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add session headers if session is active
      if (sessionActive && budgetRemaining > 0) {
        headers["x-session-active"] = "true";
        headers["x-session-budget-remaining"] = budgetRemaining.toString();
      }

      // Execute via connector Eliza proxy
      const response = await fetchWithPayment(`${CONNECTOR_URL}/eliza/plugins/${encodeURIComponent(selectedElizaPlugin)}/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: selectedElizaAction, params }),
      });

      const data = await response.json();

      const result: PluginResult = {
        success: data.success ?? response.ok,
        pluginId: selectedElizaPlugin,
        tool: selectedElizaAction,
        result: data.result || data.text,
        error: data.error,
        source: "eliza",
        executionTime: data.executionTime,
      };

      setPluginResults((prev) => [...prev, result]);

      // Record usage
      if (data.success) {
        recordUsage(2000); // $0.002 per successful Eliza execution
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setPluginError(errorMsg);
      setPluginResults((prev) => [
        ...prev,
        { success: false, pluginId: selectedElizaPlugin, tool: selectedElizaAction, error: errorMsg, source: "eliza" },
      ]);
    } finally {
      setExecutingPlugin(false);
    }
  }, [selectedElizaPlugin, selectedElizaAction, toolArgs, executingPlugin, wallet, sessionActive, budgetRemaining, recordUsage]);

  // Handle source change
  const handleSourceChange = useCallback((source: PluginSource) => {
    setPluginSource(source);
    setSelectedTool("");
    setToolSchema(null);
    setToolArgs("{}");
    setPluginError(null);
    // Reset source-specific selections
    if (source !== "goat") setSelectedPlugin("");
    if (source !== "mcp") setSelectedMcpServer("");
    if (source !== "eliza") {
      setSelectedElizaPlugin("");
      setSelectedElizaAction("");
    }
  }, []);

  // Fetch plugins/servers based on source when tab is active
  useEffect(() => {
    if (activeTab === "plugins") {
      if (pluginSource === "goat" && !goatStatus) {
        fetchPluginStatus();
      } else if (pluginSource === "mcp" && mcpServers.length === 0) {
        fetchMcpServers();
      } else if (pluginSource === "eliza" && elizaPlugins.length === 0) {
        fetchElizaPlugins();
      }
    }
  }, [activeTab, pluginSource, goatStatus, mcpServers.length, elizaPlugins.length]);

  // Fetch tools when MCP server is selected
  useEffect(() => {
    if (selectedMcpServer && activeTab === "plugins" && pluginSource === "mcp") {
      fetchMcpTools(selectedMcpServer);
    }
  }, [selectedMcpServer, activeTab, pluginSource]);

  // Fetch tools when GOAT plugin is selected
  useEffect(() => {
    if (selectedPlugin && activeTab === "plugins" && pluginSource === "goat") {
      fetchPluginTools(selectedPlugin);
    }
  }, [selectedPlugin, activeTab, pluginSource]);

  // Fetch actions when Eliza plugin is selected
  useEffect(() => {
    if (selectedElizaPlugin && activeTab === "plugins" && pluginSource === "eliza") {
      fetchElizaActions(selectedElizaPlugin);
    }
  }, [selectedElizaPlugin, activeTab, pluginSource]);

  // Auto-scroll results
  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pluginResults]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-zinc-950">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-400" />
                <h1 className="text-lg font-semibold text-white font-mono">PLAYGROUND</h1>
              </div>

              {/* Tab switcher */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "model" | "plugins")}>
                <TabsList className="bg-zinc-900">
                  <TabsTrigger value="model" className="gap-1.5">
                    <Bot className="h-3.5 w-3.5" />
                    Models
                  </TabsTrigger>
                  <TabsTrigger value="plugins" className="gap-1.5">
                    <Plug className="h-3.5 w-3.5" />
                    Plugins
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Model task indicator */}
              {activeTab === "model" && selectedModelInfo && (
                <Badge variant="outline" className="gap-1 border-zinc-700 text-zinc-400">
                  {selectedModelInfo.task || "text-generation"}
                </Badge>
              )}
            </div>

            {/* Session & Settings */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-mono text-white">
                  {sessionActive ? formatBudget(budgetRemaining) : "$0.00"}
                </span>
              </div>

              <Button
                variant={sessionActive ? "outline" : "default"}
                onClick={() => setShowSessionDialog(true)}
                className={cn(
                  sessionActive && "border-emerald-500/50 text-emerald-400"
                )}
              >
                <Zap className="h-4 w-4 mr-2" />
                {sessionActive ? "Session Active" : "Start Session"}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Model Test: Model selector row */}
          {activeTab === "model" && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Task filter dropdown */}
              <Select value={selectedTask} onValueChange={setSelectedTask} disabled={taskCategories.length === 0}>
                <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder={modelsLoading ? "Loading..." : "All tasks"} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 max-h-80">
                  {taskCategories.length === 0 ? (
                    <div className="p-2 text-zinc-500 text-sm">Loading tasks...</div>
                  ) : (
                    taskCategories.map((cat) => {
                      const taskStyle = getTaskStyle(cat.id);
                      const isAll = cat.id === "all";
                      return (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            {!isAll && (
                              <div className={cn("w-2 h-2 rounded-full", taskStyle.bg.replace("/20", ""))} />
                            )}
                            <span className={isAll ? "" : taskStyle.text}>{cat.label}</span>
                            <span className="text-zinc-500 text-xs">({cat.count})</span>
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>

              {/* Model Selector with search */}
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-96 bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder={modelsLoading ? "Loading..." : "Select model"} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 max-h-96">
                  {/* Search within dropdown */}
                  <div className="p-2 border-b border-zinc-800">
                    <Input
                      placeholder="Search models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {modelsLoading ? (
                    <div className="p-4 text-center text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Loading {models.length > 0 ? `${models.length}+` : ""} models...
                    </div>
                  ) : modelsError ? (
                    <div className="p-4 text-center text-red-400">
                      <AlertCircle className="h-4 w-4 mx-auto mb-2" />
                      {modelsError}
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500">
                      {models.length === 0 ? "No models available" : `No models match "${searchQuery}"`}
                    </div>
                  ) : (
                    filteredModels.slice(0, 100).map((model) => {
                      const taskStyle = getTaskStyle(model.task);
                      return (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="truncate max-w-40">{model.name}</span>
                            {/* Task type badge with color */}
                            {model.task && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] shrink-0 px-1.5 py-0 font-normal border",
                                  taskStyle.bg,
                                  taskStyle.text,
                                  taskStyle.border
                                )}
                              >
                                {getTaskLabel(model.task).replace("To ", "→")}
                              </Badge>
                            )}
                            {/* Source badge */}
                            <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0 font-normal text-zinc-500 border-zinc-700">
                              {model.source}
                            </Badge>
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                  {filteredModels.length > 100 && (
                    <div className="p-2 text-xs text-zinc-500 text-center border-t border-zinc-800">
                      Showing 100 of {filteredModels.length} — use search to narrow down
                    </div>
                  )}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={fetchModels}
                disabled={modelsLoading}
                className="text-zinc-400 hover:text-white shrink-0"
              >
                <RefreshCw className={cn("h-4 w-4", modelsLoading && "animate-spin")} />
              </Button>

              {/* Model count */}
              <span className="text-xs text-zinc-500 shrink-0">
                {filteredModels.length} models
              </span>
            </div>
          )}

          {/* Plugins Test: Source selector and dynamic plugin/server selector */}
          {activeTab === "plugins" && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Source selector with color-coded badges */}
              <Select value={pluginSource} onValueChange={(v) => handleSourceChange(v as PluginSource)}>
                <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="goat">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-[10px] px-1.5">GOAT</Badge>
                      <span className="text-[10px] text-zinc-500">DeFi</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="mcp">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[10px] px-1.5">MCP</Badge>
                      <span className="text-[10px] text-zinc-500">Servers</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="eliza">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40 text-[10px] px-1.5">Eliza</Badge>
                      <span className="text-[10px] text-zinc-500">AI Agents</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* GOAT Plugin selector - shown when source is goat */}
              {pluginSource === "goat" && (
                <>
                  <Select value={selectedPlugin} onValueChange={handlePluginChange} disabled={!goatStatus?.plugins?.length}>
                    <SelectTrigger className="w-52 bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder={pluginsLoading ? "Loading..." : "Select plugin"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-80">
                      {!goatStatus?.plugins?.length ? (
                        <div className="p-2 text-zinc-500 text-sm">No plugins available</div>
                      ) : (
                        goatStatus.plugins.map((plugin) => (
                          <SelectItem key={plugin.id} value={plugin.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{plugin.name}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{plugin.toolCount}</Badge>
                              {plugin.requiresApiKey && !plugin.apiKeyConfigured && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-400">needs key</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* GOAT Tool selector */}
                  <Select value={selectedTool} onValueChange={handleToolSelect} disabled={pluginTools.length === 0}>
                    <SelectTrigger className="w-72 bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder={pluginTools.length === 0 ? "Select plugin first" : "Select tool"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-96">
                      {pluginTools.length === 0 ? (
                        <div className="p-2 text-zinc-500 text-sm">No tools available</div>
                      ) : (
                        pluginTools.map((tool) => (
                          <SelectItem key={tool.name} value={tool.name}>
                            <div className="flex flex-col py-0.5">
                              <span className="font-mono text-xs">{tool.name}</span>
                              <span className="text-[10px] text-zinc-500 truncate max-w-64">{tool.description}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Status indicator */}
                  {goatStatus && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn("w-2 h-2 rounded-full", goatStatus.initialized ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="text-zinc-500">
                        {goatStatus.initialized ? `${goatStatus.totalTools} tools • ${goatStatus.chain}` : "Offline"}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* MCP Server selector - shown when source is mcp */}
              {pluginSource === "mcp" && (
                <>
                  <Select value={selectedMcpServer} onValueChange={handleMcpServerChange} disabled={mcpServers.length === 0}>
                    <SelectTrigger className="w-52 bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder={pluginsLoading ? "Loading..." : "Select server"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-80">
                      {mcpServers.length === 0 ? (
                        <div className="p-2 text-zinc-500 text-sm">No MCP servers available</div>
                      ) : (
                        mcpServers.map((server, idx) => (
                          <SelectItem key={`${idx}-${server.slug}`} value={server.slug}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{server.label || server.slug}</span>
                              {server.remote && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-cyan-500/50 text-cyan-400">remote</Badge>
                              )}
                              {server.category && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{server.category}</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* MCP Tool selector */}
                  <Select value={selectedTool} onValueChange={handleMcpToolSelect} disabled={mcpTools.length === 0}>
                    <SelectTrigger className="w-72 bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder={mcpTools.length === 0 ? "Select server first" : "Select tool"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-96">
                      {mcpTools.length === 0 ? (
                        <div className="p-2 text-zinc-500 text-sm">No tools available</div>
                      ) : (
                        mcpTools.map((tool) => (
                          <SelectItem key={tool.name} value={tool.name}>
                            <div className="flex flex-col py-0.5">
                              <span className="font-mono text-xs">{tool.name}</span>
                              <span className="text-[10px] text-zinc-500 truncate max-w-64">{tool.description || "No description"}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* MCP Status indicator */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className={cn("w-2 h-2 rounded-full", mcpServers.length > 0 ? "bg-purple-500" : "bg-zinc-500")} />
                    <span className="text-zinc-500">
                      {mcpServers.length > 0 ? `${mcpServers.length} servers` : "Loading..."}
                    </span>
                  </div>
                </>
              )}

              {/* Eliza Plugin selector - shown when source is eliza */}
              {pluginSource === "eliza" && (
                <>
                  <Select value={selectedElizaPlugin} onValueChange={handleElizaPluginChange} disabled={elizaPlugins.length === 0}>
                    <SelectTrigger className="w-52 bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder={pluginsLoading ? "Loading..." : "Select plugin"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-80">
                      {elizaPlugins.length === 0 ? (
                        <div className="p-2 text-zinc-500 text-sm">No plugins available</div>
                      ) : (
                        elizaPlugins.map((plugin) => (
                          <SelectItem key={plugin.id} value={plugin.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{plugin.id}</span>
                              {plugin.version && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500">{plugin.version}</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Eliza Action selector */}
                  <Select value={selectedElizaAction} onValueChange={handleElizaActionChange} disabled={elizaActions.length === 0}>
                    <SelectTrigger className="w-72 bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder={elizaActions.length === 0 ? "Select plugin first" : "Select action"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-96">
                      {elizaActions.length === 0 ? (
                        <div className="p-2 text-zinc-500 text-sm">No actions available</div>
                      ) : (
                        elizaActions.map((action) => (
                          <SelectItem key={action.name} value={action.name}>
                            <div className="flex flex-col py-0.5">
                              <span className="font-mono text-xs">{action.name}</span>
                              <span className="text-[10px] text-zinc-500 truncate max-w-64">{action.description}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Eliza Status indicator */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className={cn("w-2 h-2 rounded-full", elizaPlugins.length > 0 ? "bg-fuchsia-500" : "bg-zinc-500")} />
                    <span className="text-zinc-500">
                      {elizaPlugins.length > 0 ? `${elizaPlugins.length} plugins` : "Loading..."}
                    </span>
                  </div>
                </>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={pluginSource === "goat" ? fetchPluginStatus : pluginSource === "mcp" ? fetchMcpServers : fetchElizaPlugins}
                disabled={pluginsLoading}
                className="text-zinc-400 hover:text-white shrink-0"
              >
                <RefreshCw className={cn("h-4 w-4", pluginsLoading && "animate-spin")} />
              </Button>
            </div>
          )}
        </div>

        {/* Settings Panel */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleContent className="border-b border-zinc-800 p-4 bg-zinc-900/50">
            <div className="space-y-4 max-w-3xl mx-auto">
              <div>
                <Label className="text-zinc-400">System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Define the AI's behavior..."
                  className="mt-2 bg-zinc-900 border-zinc-700 min-h-20"
                />
              </div>
              {selectedModelInfo && (
                <div className="flex gap-4 text-sm text-zinc-500">
                  <span>Provider: {selectedModelInfo.source}</span>
                  <span>Owner: {selectedModelInfo.ownedBy}</span>
                  {selectedModelInfo.pricing && (
                    <>
                      <span>Input: ${selectedModelInfo.pricing.inputPerMillion}/M tokens</span>
                      <span>Output: ${selectedModelInfo.pricing.outputPerMillion}/M tokens</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Model Test: Canvas / Messages */}
        {activeTab === "model" && (
          <>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.length === 0 ? (
                  <div className="text-center py-20 text-zinc-500">
                    {outputType === "image" ? (
                      <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    ) : outputType === "audio" ? (
                      <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    ) : (
                      <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    )}
                    <p>
                      {outputType === "image"
                        ? "Describe an image to generate"
                        : outputType === "audio"
                          ? "Enter text to convert to audio"
                          : `Start a conversation with ${selectedModelInfo?.name || "AI"}`}
                    </p>
                    <p className="text-sm mt-2">
                      {sessionActive
                        ? `Budget remaining: ${formatBudget(budgetRemaining)}`
                        : "Start a session to begin"}
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-3",
                        message.role === "user" && "justify-end"
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                          {message.type === "image" ? (
                            <ImageIcon className="h-4 w-4 text-cyan-400" />
                          ) : message.type === "audio" ? (
                            <Music className="h-4 w-4 text-cyan-400" />
                          ) : (
                            <Bot className="h-4 w-4 text-cyan-400" />
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-4 py-3",
                          message.role === "user"
                            ? "bg-cyan-600 text-white"
                            : "bg-zinc-800 text-zinc-100"
                        )}
                      >
                        {/* Image result */}
                        {message.imageUrl && (
                          <img
                            src={message.imageUrl}
                            alt="Generated"
                            className="rounded-lg max-w-full mb-2"
                          />
                        )}

                        {/* Audio result */}
                        {message.audioUrl && (
                          <audio controls className="w-full mb-2">
                            <source src={message.audioUrl} />
                          </audio>
                        )}

                        {/* Text content */}
                        {message.type === "embedding" ? (
                          <pre className="text-xs overflow-auto max-h-64 font-mono">
                            {message.content || "..."}
                          </pre>
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content || "..."}</p>
                        )}
                      </div>
                      {message.role === "user" && (
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-zinc-300" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Model Test: Input */}
            <div className="border-t border-zinc-800 p-4">
              <div className="max-w-3xl mx-auto space-y-2">

                {/* Attachment Preview */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachedFiles.map((file, index) => (
                      <div key={index} className="relative group">
                        <div className="h-16 w-16 rounded-md overflow-hidden bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                          {file.type === "image" ? (
                            <img src={file.preview} alt="Preview" className="h-full w-full object-cover" />
                          ) : (
                            <Music className="h-8 w-8 text-zinc-500" />
                          )}
                          {file.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveFile(file.file)}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearChat}
                    className="text-zinc-400 hover:text-white shrink-0"
                    title="Clear chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "text-zinc-400 hover:text-white shrink-0",
                      attachedFiles.length > 0 && "text-cyan-400"
                    )}
                    title="Attach file"
                    disabled={!sessionActive || streaming}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    placeholder={
                      !sessionActive
                        ? "Start a session first"
                        : outputType === "image"
                          ? "Describe the image you want to generate..."
                          : outputType === "audio"
                            ? "Enter text to convert to speech..."
                            : attachedFiles.length > 0
                              ? "Describe the uploaded file..."
                              : "Type your message..."
                    }
                    disabled={!sessionActive || streaming}
                    className="bg-zinc-900 border-zinc-700"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!sessionActive || streaming || (!inputValue.trim() && attachedFiles.length === 0) || !selectedModel || attachedFiles.some(f => f.uploading)}
                  >
                    {streaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelect}
                  accept="image/*,audio/*"
                />
              </div>
            </div>
            {inferenceError && (
              <p className="text-red-400 text-sm mt-2 text-center">
                {inferenceError}
              </p>
            )}
          </>
        )}

        {/* Plugins Test: Results Area */}
        {activeTab === "plugins" && (
          <>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-4xl mx-auto">
                {pluginResults.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <Plug className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">
                      Test {pluginSource === "goat" ? "GOAT DeFi" : pluginSource === "mcp" ? "MCP Server" : "Eliza AI"} Actions
                    </p>
                    <p className="text-sm mt-2">
                      {sessionActive
                        ? `Budget: ${formatBudget(budgetRemaining)} • Select a ${pluginSource === "goat" ? "plugin" : pluginSource === "mcp" ? "server" : "plugin"
                        } and ${pluginSource === "eliza" ? "action" : "tool"} to execute`
                        : "Start a session to begin"}
                    </p>

                    {/* Plugin/Server overview grid */}
                    {pluginSource === "goat" && goatStatus?.plugins && goatStatus.plugins.length > 0 && (
                      <div className="mt-6 text-left max-w-2xl mx-auto">
                        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                          {goatStatus.plugins.length} Plugins • {goatStatus.totalTools} Tools
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {goatStatus.plugins.map((plugin) => (
                            <button
                              key={plugin.id}
                              onClick={() => handlePluginChange(plugin.id)}
                              className={cn(
                                "bg-zinc-900 rounded-lg p-3 border text-left transition-colors",
                                selectedPlugin === plugin.id
                                  ? "border-green-500/50 bg-green-950/20"
                                  : "border-zinc-800 hover:border-zinc-700"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-green-400 font-mono text-xs">{plugin.name}</span>
                                <Badge variant="outline" className="text-[9px]">{plugin.toolCount}</Badge>
                              </div>
                              <p className="text-zinc-500 text-[10px] line-clamp-2">{plugin.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {pluginSource === "mcp" && mcpServers.length > 0 && (
                      <div className="mt-6 text-left max-w-2xl mx-auto">
                        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                          {mcpServers.length} MCP Servers Available
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {mcpServers.slice(0, 8).map((server) => (
                            <button
                              key={server.slug}
                              onClick={() => handleMcpServerChange(server.slug)}
                              className={cn(
                                "bg-zinc-900 rounded-lg p-3 border text-left transition-colors",
                                selectedMcpServer === server.slug
                                  ? "border-purple-500/50 bg-purple-950/20"
                                  : "border-zinc-800 hover:border-zinc-700"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-purple-400 font-mono text-xs">{server.label || server.slug}</span>
                                {server.remote && (
                                  <Badge variant="outline" className="text-[9px] border-cyan-500/50 text-cyan-400">remote</Badge>
                                )}
                              </div>
                              <p className="text-zinc-500 text-[10px] line-clamp-2">{server.description || "No description"}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {pluginSource === "eliza" && elizaPlugins.length > 0 && (
                      <div className="mt-6 text-left max-w-2xl mx-auto">
                        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                          {elizaPlugins.length} ElizaOS Plugins Available
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {elizaPlugins.slice(0, 8).map((plugin) => (
                            <button
                              key={plugin.id}
                              onClick={() => handleElizaPluginChange(plugin.id)}
                              className={cn(
                                "bg-zinc-900 rounded-lg p-3 border text-left transition-colors",
                                selectedElizaPlugin === plugin.id
                                  ? "border-fuchsia-500/50 bg-fuchsia-950/20"
                                  : "border-zinc-800 hover:border-zinc-700"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-fuchsia-400 font-mono text-xs">{plugin.id}</span>
                                {plugin.version && (
                                  <Badge variant="outline" className="text-[9px] text-zinc-500">{plugin.version}</Badge>
                                )}
                              </div>
                              <p className="text-zinc-500 text-[10px] line-clamp-2">{plugin.description || "No description"}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {pluginsLoading && (
                      <div className="mt-6">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-cyan-400" />
                        <p className="mt-2 text-sm">
                          Loading {pluginSource === "goat" ? "plugins" : pluginSource === "mcp" ? "servers" : "plugins"}...
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  pluginResults.map((result, index) => (
                    <div
                      key={index}
                      className={cn(
                        "rounded-lg p-4 border",
                        result.success
                          ? "bg-emerald-950/30 border-emerald-800"
                          : "bg-red-950/30 border-red-800"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Terminal className="h-4 w-4 text-zinc-400" />
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5",
                            result.source === "mcp"
                              ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                              : result.source === "eliza"
                                ? "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40"
                                : "bg-green-500/20 text-green-400 border-green-500/40"
                          )}
                        >
                          {result.source === "mcp" ? "MCP" : result.source === "eliza" ? "Eliza" : "GOAT"}
                        </Badge>
                        <span className="font-mono text-sm text-zinc-300">
                          {result.pluginId}/{result.tool}
                        </span>
                        <Badge variant={result.success ? "default" : "destructive"} className="text-xs">
                          {result.success ? "Success" : "Failed"}
                        </Badge>
                        {result.explorer && (
                          <a
                            href={result.explorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                          >
                            View TX <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {result.executedBy && (
                          <span className="text-[10px] text-zinc-600">
                            by {result.executedBy.slice(0, 6)}...{result.executedBy.slice(-4)}
                          </span>
                        )}
                      </div>
                      <pre className="text-xs text-zinc-400 overflow-auto max-h-48 font-mono bg-zinc-900/50 rounded p-2">
                        {result.error || JSON.stringify(result.result, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
                <div ref={resultsEndRef} />
              </div>
            </ScrollArea>

            {/* Plugins Test: Input with schema hints */}
            <div className="border-t border-zinc-800 p-4">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Tool/Action description & schema hint - works for GOAT, MCP, and Eliza */}
                {(pluginSource === "goat" ? currentTool : pluginSource === "mcp" ? currentMcpTool : elizaActions.find(a => a.name === selectedElizaAction)) && (
                  <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className={cn(
                        "h-4 w-4",
                        pluginSource === "goat" ? "text-green-400" : pluginSource === "mcp" ? "text-purple-400" : "text-fuchsia-400"
                      )} />
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5",
                          pluginSource === "goat"
                            ? "bg-green-500/20 text-green-400 border-green-500/40"
                            : pluginSource === "mcp"
                              ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                              : "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40"
                        )}
                      >
                        {pluginSource === "goat" ? "GOAT" : pluginSource === "mcp" ? "MCP" : "Eliza"}
                      </Badge>
                      <span className={cn(
                        "font-mono text-sm",
                        pluginSource === "goat" ? "text-green-400" : pluginSource === "mcp" ? "text-purple-400" : "text-fuchsia-400"
                      )}>
                        {pluginSource === "goat"
                          ? currentTool?.name
                          : pluginSource === "mcp"
                            ? currentMcpTool?.name
                            : elizaActions.find(a => a.name === selectedElizaAction)?.name}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mb-2">
                      {pluginSource === "goat"
                        ? currentTool?.description
                        : pluginSource === "mcp"
                          ? (currentMcpTool?.description || "No description available")
                          : (elizaActions.find(a => a.name === selectedElizaAction)?.description || "No description available")}
                    </p>
                    {toolSchema && (
                      <div className="mt-2 pt-2 border-t border-zinc-800">
                        <p className="text-[10px] text-zinc-500 uppercase mb-1">Parameters (* = required)</p>
                        <pre className="text-[10px] text-zinc-500 font-mono whitespace-pre-wrap">
                          {formatSchemaHint(toolSchema)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearResults}
                    className="text-zinc-400 hover:text-white shrink-0"
                    title="Clear results"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 relative">
                    <Textarea
                      value={toolArgs}
                      onChange={(e) => setToolArgs(e.target.value)}
                      placeholder='{"key": "value"}'
                      className="bg-zinc-900 border-zinc-700 font-mono text-sm min-h-20 pr-20"
                    />
                    <div className="absolute right-2 top-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (pluginSource === "goat" && currentTool) {
                            const defaultArgs = currentTool.example || generateDefaultArgs(currentTool.parameters);
                            setToolArgs(JSON.stringify(defaultArgs, null, 2));
                          } else if (pluginSource === "mcp" && currentMcpTool) {
                            const defaultArgs = generateDefaultArgs(currentMcpTool.inputSchema);
                            setToolArgs(JSON.stringify(defaultArgs, null, 2));
                          }
                        }}
                        className="h-6 px-2 text-[10px] text-zinc-500 hover:text-white"
                        title="Reset to defaults"
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                  <Button
                    onClick={
                      pluginSource === "goat"
                        ? handleExecutePlugin
                        : pluginSource === "mcp"
                          ? handleExecuteMcpTool
                          : handleElizaExecution
                    }
                    disabled={
                      !sessionActive ||
                      executingPlugin ||
                      !selectedTool ||
                      (pluginSource === "goat" ? !selectedPlugin : pluginSource === "mcp" ? !selectedMcpServer : !selectedElizaPlugin)
                    }
                    className={cn(
                      "h-auto px-6",
                      pluginSource === "goat"
                        ? "bg-green-600 hover:bg-green-700"
                        : pluginSource === "mcp"
                          ? "bg-purple-600 hover:bg-purple-700"
                          : "bg-fuchsia-600 hover:bg-fuchsia-700"
                    )}
                  >
                    {executingPlugin ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Execute
                      </>
                    )}
                  </Button>
                </div>
                {pluginError && (
                  <div className="p-3 rounded-lg bg-red-950/30 border border-red-800">
                    <p className="text-red-400 text-sm flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      {pluginError}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Session Dialog - controlled mode, no trigger (we have our own button) */}
      <SessionBudgetDialog
        open={showSessionDialog}
        onOpenChange={setShowSessionDialog}
        showTrigger={false}
      />
    </div>
  );
}
