/**
 * Playground - Test models and MCP plugins with x402 payment
 */
import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useActiveWallet } from "thirdweb/react";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { useSession } from "@/hooks/use-session.tsx";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Mic,
  MicOff,
  Video,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessageItem } from "@/components/chat";
import { MultimodalCanvas } from "@/components/canvas";
import { useFileAttachment, type AttachedFile } from "@/hooks/use-attachment";
import { useAudioRecording } from "@/hooks/use-recording";
import { useRegistryServers, type RegistryServer } from "@/hooks/use-registry";
import {
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
  type?: "text" | "image" | "audio" | "video" | "embedding";
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
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
// CONNECTOR_URL used for tool fetching (metadata, not execution)
const CONNECTOR_URL = (import.meta.env.VITE_CONNECTOR_URL || "https://services.compose.market/connector").replace(/\/+$/, "");

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

// ChatMessageItem is imported from @/components/chat

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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState("all");
  const [taskCategories, setTaskCategories] = useState<{ id: string; label: string; count: number }[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

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

  // MCP Servers State - fetched from centralized registry
  const { data: mcpRegistryData, isLoading: mcpLoading } = useRegistryServers({
    origin: 'mcp',
    available: true
  });
  const mcpServers = mcpRegistryData?.servers ?? [];
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

  // File Attachment from shared hook
  const fileAttachment = useFileAttachment({
    conversationId: `playground-${Date.now()}`,
    onError: (err) => setInferenceError(err),
  });
  const { attachedFiles, fileInputRef, handleFileSelect, handleRemoveFile, isUploading, uploadedCids, cleanupFiles } = fileAttachment;

  // Audio recording from shared hook
  const recording = useAudioRecording({
    conversationId: `playground-${Date.now()}`,
    onRecordingComplete: (file) => {
      fileAttachment.attachedFiles.length === 0 &&
        fileAttachment.handleFileSelect({ target: { files: [file.file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    },
    onError: (err) => setInferenceError(err),
  });
  const { isRecording, recordingSupported, startRecording, stopRecording } = recording;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Fetch models on mount
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const { fetchAvailableModels } = await import("@/lib/models");
      const modelList = await fetchAvailableModels();

      // Transform AIModel to local Model interface if needed, or update local interface
      // The shapes are compatible enough for this usage:
      // AIModel: { id, name, source, ownedBy, available, task, pricing, ... }
      // Model: { id, name, source, ownedBy, available, task, pricing, ... }
      setModels(modelList as unknown as Model[]);

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

  // Debounce search query for performance (150ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filtered models based on search and task filter (memoized for performance)
  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      // Task filter
      if (selectedTask !== "all" && model.task !== selectedTask) {
        return false;
      }
      // Search filter (using debounced value)
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        return (
          model.id.toLowerCase().includes(query) ||
          model.name.toLowerCase().includes(query) ||
          model.source.toLowerCase().includes(query) ||
          (model.ownedBy && model.ownedBy.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [models, selectedTask, debouncedSearchQuery]);

  // Get selected model info (memoized)
  const selectedModelInfo = useMemo(() => models.find((m) => m.id === selectedModel), [models, selectedModel]);

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

    // Pre-compute attachment base64 data BEFORE clearing files
    // This ensures we capture the file data before any state changes
    let attachmentBase64: string | undefined;
    let attachmentType: "image" | "audio" | undefined;
    if (attached && attached.file) {
      const base64Data = await fileToDataUrl(attached.file);
      attachmentBase64 = base64Data.split(",")[1]; // Strip data:mime;base64,
      attachmentType = attached.type;
    }

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
    fileAttachment.clearFiles(); // Clear attachment from input after sending
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

      // Build request body based on output type
      // Always include attachments if present - let the model decide what to do with them
      let requestBody: Record<string, unknown>;

      if (outputType === "image") {
        // Text-to-image generation
        requestBody = { prompt: userMessage.content };
        // If user attached an image, add it (for image-to-image scenarios)
        if (attachmentBase64) {
          requestBody.image = attachmentBase64;
        }
      } else if (outputType === "audio") {
        // Text-to-speech
        requestBody = { text: userMessage.content };
      } else if (outputType === "embedding") {
        // Embeddings
        requestBody = { text: userMessage.content };
      } else {
        // Text generation (default) - ALWAYS include attachments if present
        requestBody = {
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          systemPrompt,
        };

        // Include any attachment - the model will handle it (or ignore it if not supported)
        if (attachmentBase64 && attachmentType === "image") {
          requestBody.image = attachmentBase64;
        } else if (attachmentBase64 && attachmentType === "audio") {
          requestBody.audio = attachmentBase64;
        }
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

        // Record USDC usage for the session (default = INFERENCE_PRICE_WEI = $0.005)
        recordUsage();
      } else if (contentType.includes("image")) {
        // Image response
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "Generated image:", imageUrl, type: "image" } : m
          )
        );
        recordUsage();
      } else if (contentType.includes("audio")) {
        // Audio response
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "Generated audio:", audioUrl, type: "audio" } : m
          )
        );
        recordUsage();
      } else if (contentType.includes("video")) {
        // Video response
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "Generated video:", videoUrl, type: "video" } : m
          )
        );
        recordUsage();
      } else {
        // JSON response (embeddings, etc.)
        const data = await response.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: JSON.stringify(data, null, 2), type: "embedding" } : m
          )
        );
        recordUsage();
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

  // Note: handleFileSelect, handleRemoveFile, startRecording, stopRecording provided by hooks

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setInferenceError(null);
    fileAttachment.clearFiles();

    // Cleanup Pinata files via hook
    if (uploadedCids.length > 0) {
      cleanupFiles();
    }
  }, [uploadedCids, cleanupFiles, fileAttachment]);

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
      let url = `${CONNECTOR_URL}/plugins/${encodeURIComponent(selectedPlugin)}/execute`;
      let body = { tool: selectedTool, args };

      if (pluginSource === 'mcp') {
        // Route MCP execution through Lambda (API_BASE) for x402 payment handling
        // Lambda route: POST /api/mcp/servers/:slug/call -> MCP Server
        url = `${API_BASE}/api/mcp/servers/${encodeURIComponent(selectedPlugin)}/call`;
        body = { tool: selectedTool, args: args };
      }

      const response = await fetchWithPayment(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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
        recordUsage(); // $0.001 per successful execution
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

  // MCP servers are now fetched via useRegistryServers hook above
  // Auto-select first server when servers load
  useEffect(() => {
    if (!selectedMcpServer && mcpServers.length > 0) {
      setSelectedMcpServer(mcpServers[0].slug);
    }
  }, [mcpServers, selectedMcpServer]);

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

      // Execute via Lambda -> MCP proxy (Lambda handles x402 payment, proxies to MCP server)
      const response = await fetchWithPayment(`${API_BASE}/api/mcp/servers/${encodeURIComponent(selectedMcpServer)}/call`, {
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
        recordUsage(); // $0.001 per successful execution
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
        recordUsage(); // $0.002 per successful Eliza execution
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
  // Note: MCP servers are auto-fetched via useRegistryServers hook
  useEffect(() => {
    if (activeTab === "plugins") {
      if (pluginSource === "goat" && !goatStatus) {
        fetchPluginStatus();
      } else if (pluginSource === "eliza" && elizaPlugins.length === 0) {
        fetchElizaPlugins();
      }
      // MCP servers auto-loaded via hook - no manual fetch needed
    }
  }, [activeTab, pluginSource, goatStatus, elizaPlugins.length]);

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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-zinc-950">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 p-3 lg:p-4">
          {/* Mobile: Session controls row (shown first on mobile for prominence) */}
          <div className="flex sm:hidden items-center justify-between gap-2 mb-3 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-mono text-white">
                {sessionActive ? formatBudget(budgetRemaining) : "$0.00"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={sessionActive ? "outline" : "default"}
                onClick={() => setShowSessionDialog(true)}
                className={cn(
                  "h-9 text-xs px-3",
                  sessionActive && "border-emerald-500/50 text-emerald-400"
                )}
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                {sessionActive ? "Active" : "Start Session"}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className="h-9 w-9"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Top row: Title, Tabs, and Session controls (desktop) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
                <h1 className="text-base sm:text-lg font-semibold text-white font-mono">PLAYGROUND</h1>
              </div>

              {/* Tab switcher */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "model" | "plugins")}>
                <TabsList className="bg-zinc-900 h-8 sm:h-9">
                  <TabsTrigger value="model" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                    <Bot className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">Models</span>
                    <span className="xs:hidden">AI</span>
                  </TabsTrigger>
                  <TabsTrigger value="plugins" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                    <Plug className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">Plugins</span>
                    <span className="xs:hidden">Tools</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Model task indicator - hide on mobile */}
              {activeTab === "model" && selectedModelInfo && (
                <Badge variant="outline" className="gap-1 border-zinc-700 text-zinc-400 hidden md:flex text-[10px] sm:text-xs">
                  {selectedModelInfo.task || "text-generation"}
                </Badge>
              )}
            </div>

            {/* Session & Settings - Desktop only */}
            <div className="hidden sm:flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                <span className="text-xs sm:text-sm font-mono text-white">
                  {sessionActive ? formatBudget(budgetRemaining) : "$0.00"}
                </span>
              </div>

              <Button
                variant={sessionActive ? "outline" : "default"}
                onClick={() => setShowSessionDialog(true)}
                className={cn(
                  "h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-4",
                  sessionActive && "border-emerald-500/50 text-emerald-400"
                )}
              >
                <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                {sessionActive ? "Session Active" : "Start Session"}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className="h-8 w-8 sm:h-9 sm:w-9"
              >
                <Settings2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>

          {/* Model Test: Model selector row */}
          {activeTab === "model" && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
              {/* Task filter dropdown */}
              <Select value={selectedTask} onValueChange={setSelectedTask} disabled={taskCategories.length === 0}>
                <SelectTrigger className="w-full sm:w-36 lg:w-44 bg-zinc-900 border-zinc-700 h-9">
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

              {/* Model Selector with search - Combobox pattern */}
              <Popover open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelDropdownOpen}
                    className="w-full sm:flex-1 lg:w-80 xl:w-96 bg-zinc-900 border-zinc-700 h-9 justify-between text-left font-normal"
                  >
                    <span className="truncate">
                      {modelsLoading
                        ? "Loading..."
                        : selectedModelInfo?.name || "Select model..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 bg-zinc-900 border-zinc-700" align="start">
                  <Command className="bg-zinc-900" shouldFilter={false}>
                    <CommandInput
                      placeholder="Search models..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      className="h-9"
                    />
                    <CommandList className="max-h-[300px]">
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
                        <CommandEmpty>
                          {models.length === 0 ? "No models available" : `No models match "${searchQuery}"`}
                        </CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {filteredModels.slice(0, 100).map((model) => {
                            const taskStyle = getTaskStyle(model.task);
                            return (
                              <CommandItem
                                key={model.id}
                                value={model.id}
                                onSelect={() => {
                                  setSelectedModel(model.id);
                                  setModelDropdownOpen(false);
                                }}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0",
                                    selectedModel === model.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="truncate max-w-32 sm:max-w-48">{model.name}</span>
                                {/* Task type badge with color */}
                                {model.task && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] shrink-0 px-1.5 py-0 font-normal border hidden sm:flex",
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
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      )}
                      {filteredModels.length > 100 && (
                        <div className="p-2 text-xs text-zinc-500 text-center border-t border-zinc-800">
                          Showing 100 of {filteredModels.length} — use search to narrow down
                        </div>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={loadModels}
                  disabled={modelsLoading}
                  className="text-zinc-400 hover:text-white h-8 w-8 sm:h-9 sm:w-9"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", modelsLoading && "animate-spin")} />
                </Button>

                {/* Model count */}
                <span className="text-[10px] sm:text-xs text-zinc-500">
                  {filteredModels.length} models
                </span>
              </div>
            </div>
          )}

          {/* Plugins Test: Source selector and dynamic plugin/server selector */}
          {activeTab === "plugins" && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
              {/* Source selector with color-coded badges */}
              <Select value={pluginSource} onValueChange={(v) => handleSourceChange(v as PluginSource)}>
                <SelectTrigger className="w-full sm:w-28 lg:w-32 bg-zinc-900 border-zinc-700 h-9">
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
                    <SelectTrigger className="w-full sm:w-40 lg:w-52 bg-zinc-900 border-zinc-700 h-9">
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
                    <SelectTrigger className="w-full sm:flex-1 lg:w-56 xl:w-72 bg-zinc-900 border-zinc-700 h-9">
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
                  {/* MCP Server selector with search - Combobox pattern */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full sm:w-40 lg:w-52 bg-zinc-900 border-zinc-700 h-9 justify-between text-left font-normal"
                      >
                        <span className="truncate font-mono text-xs">
                          {mcpLoading
                            ? "Loading..."
                            : selectedMcpServer
                              ? mcpServers.find(s => s.slug === selectedMcpServer)?.name || selectedMcpServer
                              : "Select server..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0 bg-zinc-900 border-zinc-700" align="start">
                      <Command className="bg-zinc-900">
                        <CommandInput
                          placeholder="Search servers..."
                          className="h-9"
                        />
                        <CommandList className="max-h-[300px]">
                          {mcpLoading ? (
                            <div className="p-4 text-center text-zinc-500">
                              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                              Loading servers...
                            </div>
                          ) : mcpServers.length === 0 ? (
                            <CommandEmpty>No servers found</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {mcpServers.map((server) => (
                                <CommandItem
                                  key={server.slug}
                                  value={`${server.name} ${server.slug} ${server.description || ""}`}
                                  onSelect={() => {
                                    handleMcpServerChange(server.slug);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0",
                                        selectedMcpServer === server.slug ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className="font-mono text-xs truncate">{server.name || server.slug}</span>
                                      <span className="text-[10px] text-zinc-500 truncate">{server.description || "No description"}</span>
                                    </div>
                                    {server.transport === 'http' && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-cyan-500/50 text-cyan-400 shrink-0">remote</Badge>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* MCP Tool selector */}
                  <Select value={selectedTool} onValueChange={handleMcpToolSelect} disabled={mcpTools.length === 0}>
                    <SelectTrigger className="w-full sm:flex-1 lg:w-56 xl:w-72 bg-zinc-900 border-zinc-700 h-9">
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
                              <span className="text-[10px] text-zinc-500 truncate max-w-48 sm:max-w-64">{tool.description || "No description"}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* MCP Status indicator */}
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs shrink-0">
                    <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full", mcpServers.length > 0 ? "bg-purple-500" : "bg-zinc-500")} />
                    <span className="text-zinc-500">
                      {mcpServers.length > 0 ? `${mcpServers.length.toLocaleString()} servers` : "Loading..."}
                    </span>
                  </div>
                </>
              )}

              {/* Eliza Plugin selector - shown when source is eliza */}
              {pluginSource === "eliza" && (
                <>
                  <Select value={selectedElizaPlugin} onValueChange={handleElizaPluginChange} disabled={elizaPlugins.length === 0}>
                    <SelectTrigger className="w-full sm:w-40 lg:w-52 bg-zinc-900 border-zinc-700 h-9">
                      <SelectValue placeholder={pluginsLoading ? "Loading..." : "Select plugin"} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-80">
                      {elizaPlugins.length === 0 ? (
                        <div className="p-2 text-zinc-500 text-sm">No plugins available</div>
                      ) : (
                        elizaPlugins.map((plugin) => (
                          <SelectItem key={plugin.id} value={plugin.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs truncate max-w-24 sm:max-w-40">{plugin.id}</span>
                              {plugin.version && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500 hidden sm:flex">{plugin.version}</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Eliza Action selector */}
                  <Select value={selectedElizaAction} onValueChange={handleElizaActionChange} disabled={elizaActions.length === 0}>
                    <SelectTrigger className="w-full sm:flex-1 lg:w-56 xl:w-72 bg-zinc-900 border-zinc-700 h-9">
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
                              <span className="text-[10px] text-zinc-500 truncate max-w-48 sm:max-w-64">{action.description}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Eliza Status indicator */}
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs shrink-0">
                    <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full", elizaPlugins.length > 0 ? "bg-fuchsia-500" : "bg-zinc-500")} />
                    <span className="text-zinc-500">
                      {elizaPlugins.length > 0 ? `${elizaPlugins.length} plugins` : "Loading..."}
                    </span>
                  </div>
                </>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={pluginSource === "goat" ? fetchPluginStatus : pluginSource === "eliza" ? fetchElizaPlugins : undefined}
                disabled={pluginsLoading || mcpLoading || pluginSource === "mcp"}
                className="text-zinc-400 hover:text-white shrink-0 h-8 w-8 sm:h-9 sm:w-9"
                title={pluginSource === "mcp" ? "MCP servers auto-refresh" : "Refresh"}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", (pluginsLoading || mcpLoading) && "animate-spin")} />
              </Button>
            </div>
          )}
        </div>

        {/* Settings Panel */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleContent className="border-b border-zinc-800 p-3 lg:p-4 bg-zinc-900/50">
            <div className="space-y-4 max-w-3xl mx-auto">
              <div>
                <Label className="text-zinc-400 text-sm">System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Define the AI's behavior..."
                  className="mt-2 bg-zinc-900 border-zinc-700 min-h-16 sm:min-h-20"
                />
              </div>
              {selectedModelInfo && (
                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-zinc-500">
                  <span>Provider: {selectedModelInfo.source}</span>
                  <span className="hidden sm:inline">Owner: {selectedModelInfo.ownedBy}</span>
                  {selectedModelInfo.pricing && (
                    <>
                      <span className="hidden lg:inline">Input: ${selectedModelInfo.pricing.inputPerMillion}/M</span>
                      <span className="hidden lg:inline">Output: ${selectedModelInfo.pricing.outputPerMillion}/M</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Model Test: Canvas / Messages - using shared MultimodalCanvas */}
        {activeTab === "model" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <MultimodalCanvas
              variant="playground"
              showHeader={false}
              messages={messages}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSend={handleSendMessage}
              sending={streaming}
              error={inferenceError}
              sessionActive={sessionActive}
              attachedFiles={attachedFiles}
              onFileSelect={() => fileInputRef.current?.click()}
              onRemoveFile={handleRemoveFile}
              fileInputRef={fileInputRef}
              onFileInputChange={handleFileSelect}
              isRecording={isRecording}
              recordingSupported={recordingSupported}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onClearChat={handleClearChat}
              messagesEndRef={messagesEndRef}
              height="flex-1"
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
              emptyStateIcon={
                outputType === "image" ? (
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50 text-zinc-500" />
                ) : outputType === "audio" ? (
                  <Music className="h-12 w-12 mx-auto mb-4 opacity-50 text-zinc-500" />
                ) : (
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50 text-zinc-500" />
                )
              }
              emptyStateText={
                outputType === "image"
                  ? "Describe an image to generate"
                  : outputType === "audio"
                    ? "Enter text to convert to audio"
                    : `Start a conversation with ${selectedModelInfo?.name || "AI"}`
              }
              emptyStateSubtext={
                sessionActive
                  ? `Budget remaining: ${formatBudget(budgetRemaining)}`
                  : "Start a session to begin"
              }
            />
          </div>
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
                      <div className="mt-6 text-left max-w-md mx-auto">
                        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3 text-center">
                          {mcpServers.length.toLocaleString()} MCP Servers Available
                        </p>
                        <p className="text-zinc-500 text-sm text-center">
                          Use the <span className="text-purple-400 font-mono">Select server</span> dropdown above to search and select from all available servers.
                        </p>
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
    </div >
  );
}
