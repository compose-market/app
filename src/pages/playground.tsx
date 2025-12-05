/**
 * Playground - Test models and MCP plugins with x402 payment
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useActiveWallet } from "thirdweb/react";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { useSession } from "@/hooks/use-session";
import { SessionBudgetDialog } from "@/components/session";
import { thirdwebClient } from "@/lib/thirdweb";
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

interface Plugin {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface PluginResult {
  success: boolean;
  pluginId: string;
  tool: string;
  result?: unknown;
  error?: string;
  txHash?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://api.compose.market";

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

  // Tab state
  const [activeTab, setActiveTab] = useState<"model" | "agent">("model");

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

  // Agent Test State
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<string>("goat-erc20");
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [toolArgs, setToolArgs] = useState<string>("{}");
  const [pluginResults, setPluginResults] = useState<PluginResult[]>([]);
  const [executingPlugin, setExecutingPlugin] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);

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

  // Fetch plugins when agent tab is active
  useEffect(() => {
    if (activeTab === "agent" && plugins.length === 0) {
      fetchPlugins();
    }
  }, [activeTab]);

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
        BigInt(1_000_000) // $1 max
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
        throw new Error(errorData.message || `Inference failed: ${response.status}`);
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
  // Agent Test Handlers
  // ==========================================================================

  const fetchPlugins = async () => {
    setPluginsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/mcp/plugins`);
      if (!response.ok) throw new Error(`Failed to fetch plugins: ${response.status}`);
      const data = await response.json();
      setPlugins(data.tools || []);
    } catch (err) {
      console.error("Failed to fetch plugins:", err);
    } finally {
      setPluginsLoading(false);
    }
  };

  const handleExecutePlugin = useCallback(async () => {
    if (!selectedPlugin || !selectedTool || executingPlugin) return;

    if (!wallet) {
      setPluginError("Connect wallet to execute plugins");
      return;
    }

    setExecutingPlugin(true);
    setPluginError(null);

    try {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolArgs);
      } catch {
        throw new Error("Invalid JSON in arguments");
      }

      // x402 payment
      const normalizedFetch = createNormalizedFetch();
      const fetchWithPayment = wrapFetchWithPayment(
        normalizedFetch,
        thirdwebClient,
        wallet,
        BigInt(1_000_000) // $1 max
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add session headers if session is active
      if (sessionActive && budgetRemaining > 0) {
        headers["x-session-active"] = "true";
        headers["x-session-budget-remaining"] = budgetRemaining.toString();
      }

      const response = await fetchWithPayment(`${API_BASE}/api/mcp/${encodeURIComponent(selectedPlugin)}/execute`, {
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
        error: data.error,
        txHash: data.txHash,
      };

      setPluginResults((prev) => [...prev, result]);

      // Record usage (1% fee is calculated server-side)
      const costHeader = response.headers.get("X-Total-Cost");
      if (costHeader) {
        const cost = parseFloat(costHeader) * 1_000_000; // Convert to USDC wei
        recordUsage(cost);
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
  }, [selectedPlugin, selectedTool, toolArgs, executingPlugin, wallet, budgetRemaining, recordUsage]);

  const handleClearResults = useCallback(() => {
    setPluginResults([]);
    setPluginError(null);
  }, []);

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
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "model" | "agent")}>
                <TabsList className="bg-zinc-900">
                  <TabsTrigger value="model" className="gap-1.5">
                    <Bot className="h-3.5 w-3.5" />
                    Model Test
                  </TabsTrigger>
                  <TabsTrigger value="agent" className="gap-1.5">
                    <Plug className="h-3.5 w-3.5" />
                    Agent Test
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

          {/* Agent Test: Plugin selector */}
          {activeTab === "agent" && (
            <div className="flex items-center gap-3">
              <Select value={selectedPlugin} onValueChange={setSelectedPlugin}>
                <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder="Select plugin" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="goat-erc20">GOAT ERC20</SelectItem>
                  <SelectItem value="goat-coingecko">GOAT CoinGecko</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Tool name (e.g., getBalance)"
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="w-48 bg-zinc-900 border-zinc-700"
              />

              <Button
                variant="ghost"
                size="icon"
                onClick={fetchPlugins}
                disabled={pluginsLoading}
                className="text-zinc-400 hover:text-white shrink-0"
              >
                <RefreshCw className={cn("h-4 w-4", pluginsLoading && "animate-spin")} />
              </Button>

              <span className="text-xs text-zinc-500">
                {plugins.length} tools loaded
              </span>
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

        {/* Agent Test: Results Area */}
        {activeTab === "agent" && (
          <>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {pluginResults.length === 0 ? (
                  <div className="text-center py-20 text-zinc-500">
                    <Plug className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Execute MCP plugins and GOAT tools</p>
                    <p className="text-sm mt-2">
                      {sessionActive
                        ? `Budget remaining: ${formatBudget(budgetRemaining)}`
                        : "Start a session to begin"}
                    </p>
                    <div className="mt-6 text-left max-w-md mx-auto space-y-2">
                      <p className="text-xs text-zinc-600">Available tools:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-zinc-900 rounded p-2">
                          <span className="text-cyan-400">goat-erc20</span>
                          <p className="text-zinc-500">getBalance, transfer, approve</p>
                        </div>
                        <div className="bg-zinc-900 rounded p-2">
                          <span className="text-cyan-400">goat-coingecko</span>
                          <p className="text-zinc-500">getPrice, getCoinInfo</p>
                        </div>
                      </div>
                    </div>
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
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="h-4 w-4 text-zinc-400" />
                        <span className="font-mono text-sm text-zinc-300">
                          {result.pluginId}/{result.tool}
                        </span>
                        <Badge variant={result.success ? "default" : "destructive"} className="text-xs">
                          {result.success ? "Success" : "Failed"}
                        </Badge>
                        {result.txHash && (
                          <a
                            href={`https://testnet.avascan.info/blockchain/c/tx/${result.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-cyan-400 hover:underline"
                          >
                            View TX
                          </a>
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

            {/* Agent Test: Input */}
            <div className="border-t border-zinc-800 p-4">
              <div className="max-w-3xl mx-auto space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearResults}
                    className="text-zinc-400 hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Textarea
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    placeholder='{"address": "0x...", "tokenAddress": "0x..."}'
                    className="bg-zinc-900 border-zinc-700 font-mono text-sm min-h-16"
                  />
                  <Button
                    onClick={handleExecutePlugin}
                    disabled={!sessionActive || executingPlugin || !selectedPlugin || !selectedTool}
                    className="h-auto"
                  >
                    {executingPlugin ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {pluginError && (
                  <p className="text-red-400 text-sm text-center">
                    {pluginError}
                  </p>
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
