/**
 * Agent Detail Page with Chat Interface
 * 
 * Shows agent info and provides interactive chat with x402 payments.
 * Includes knowledge upload and file attachments.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { useActiveWallet } from "thirdweb/react";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { thirdwebClient, INFERENCE_PRICE_WEI } from "@/lib/thirdweb";
import { createNormalizedFetch } from "@/lib/payment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/use-session.tsx";
import { SessionBudgetDialog } from "@/components/session";
import { useOnchainAgentByIdentifier } from "@/hooks/use-onchain";
import { getIpfsUrl, uploadConversationFile, fileToDataUrl } from "@/lib/pinata";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Sparkles,
  DollarSign,
  Package,
  Shield,
  Zap,
  Globe,
  Code,
  Link as LinkIcon,
  CheckCircle,
  Send,
  Bot,
  User,
  Loader2,
  BookOpen,
  Upload,
  Paperclip,
  X,
  MessageSquare,
  Mic,
  MicOff,
  Video,
  Image as ImageIcon,
  Music,
  Plus,
  Link2,
  FileText,
  Trash2,
  RefreshCw,
} from "lucide-react";

const MCP_URL = (import.meta.env.VITE_MCP_URL || "https://mcp.compose.market").replace(/\/+$/, "");

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  type?: "text" | "image" | "audio" | "video";
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  // id can be either numeric agent ID (legacy) or wallet address (preferred)
  const identifier = params.id || null;
  const { data: agent, isLoading, error } = useOnchainAgentByIdentifier(identifier);
  const { toast } = useToast();
  const wallet = useActiveWallet();
  const { sessionActive, budgetRemaining, recordUsage } = useSession();

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<"idle" | "paying" | "waiting" | "streaming">("idle");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Streaming optimization refs (RAF batching for 60fps max)
  const streamedTextRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);

  // Knowledge upload state
  const [showKnowledgeDialog, setShowKnowledgeDialog] = useState(false);
  const [knowledgeKey, setKnowledgeKey] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const [knowledgeUrls, setKnowledgeUrls] = useState<string[]>([]);
  const [newKnowledgeUrl, setNewKnowledgeUrl] = useState("");
  const knowledgeFileInputRef = useRef<HTMLInputElement>(null);

  // File attachment state
  interface AttachedFile {
    file: File;
    cid?: string;
    url?: string;
    preview?: string;
    uploading: boolean;
    type: "image" | "audio";
  }
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string>(`agent-conv-${Date.now()}`);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Session dialog
  const [showSessionDialog, setShowSessionDialog] = useState(false);

  // Build the A2A-compatible endpoint URL using wallet address (canonical identifier)
  const agentWallet = agent?.walletAddress;
  const apiEndpoint = agentWallet
    ? `https://api.compose.market/api/agent/${agentWallet}`
    : null;

  // Invoke endpoint for x402 calls
  const invokeEndpoint = agentWallet
    ? `https://api.compose.market/api/agent/${agentWallet}/invoke`
    : null;

  // Stick-to-bottom scroll (only scroll if user is near bottom)
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (!isNearBottom()) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, isNearBottom]);

  const copyEndpoint = () => {
    if (apiEndpoint) {
      navigator.clipboard.writeText(apiEndpoint);
      toast({
        title: "Copied!",
        description: "Agent endpoint copied to clipboard",
      });
    }
  };

  // Auto-register agent with backend if not registered
  const autoRegisterAgent = useCallback(async (): Promise<boolean> => {
    if (!agent || !agentWallet) return false;

    try {
      const metadata = agent.metadata;

      // walletTimestamp is optional - agent works for chat without it
      // Only needed if agent needs to sign transactions
      const walletTimestamp = metadata?.walletTimestamp;
      if (!walletTimestamp) {
        console.log(`[agent] No walletTimestamp in metadata - agent will work without signing capability`);
      }

      const response = await fetch(`${MCP_URL}/agent/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: agentWallet,
          ...(walletTimestamp && { walletTimestamp }), // Optional - for signing capability
          dnaHash: agent.dnaHash,
          name: metadata?.name || `Agent #${agent.id}`,
          description: metadata?.description || "",
          agentCardUri: agent.agentCardUri,
          creator: agent.creator,
          model: metadata?.model || "gpt-4o-mini",
          plugins: metadata?.plugins?.map(p => p.registryId) || [],
        }),
      });

      if (response.ok || response.status === 409) {
        // 409 = already registered, which is fine
        console.log(`[agent] Auto-registered agent ${agentWallet}`);
        return true;
      }

      console.warn(`[agent] Auto-registration failed:`, await response.text());
      return false;
    } catch (err) {
      console.error(`[agent] Auto-registration error:`, err);
      return false;
    }
  }, [agent, agentWallet]);

  // Pre-register agent when chat is opened (avoids 404 -> register race condition)
  useEffect(() => {
    if (showChat && agentWallet) {
      autoRegisterAgent().then((ok) => {
        if (!ok) {
          console.warn("[agent] Pre-registration failed, will retry on 404");
        }
      });
    }
  }, [showChat, agentWallet, autoRegisterAgent]);

  // Send chat message with x402 payment
  const handleSendMessage = useCallback(async () => {
    if (attachedFiles.some(f => f.uploading)) return;
    if ((!inputValue.trim() && attachedFiles.length === 0) || sending || !agentWallet) return;

    if (!wallet) {
      toast({ title: "Connect wallet", description: "Please connect your wallet to chat", variant: "destructive" });
      return;
    }

    const attached = attachedFiles[0];
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
      type: attached?.type === "image" ? "image" : attached?.type === "audio" ? "audio" : "text",
      imageUrl: attached?.type === "image" ? attached.url : undefined,
      audioUrl: attached?.type === "audio" ? attached.url : undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setAttachedFiles([]); // Clear attachment from input after sending
    setSending(true);
    setChatError(null);
    setChatStatus("paying");

    // Create assistant placeholder
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: Date.now() }]);

    try {
      if (!agent) {
        throw new Error("Agent not loaded");
      }

      setChatStatus("waiting");

      const normalizedFetch = createNormalizedFetch();
      const fetchWithPayment = wrapFetchWithPayment(
        normalizedFetch,
        thirdwebClient,
        wallet,
        { maxValue: BigInt(INFERENCE_PRICE_WEI) } // $0.005
      );

      // Pre-compute attachment base64 data BEFORE defining makeChatRequest
      // This ensures we capture the file data before any async operations
      let attachmentBase64: string | undefined;
      let attachmentType: "image" | "audio" | undefined;
      if (attached && attached.file) {
        const base64Data = await fileToDataUrl(attached.file);
        attachmentBase64 = base64Data.split(",")[1]; // Strip data:mime;base64,
        attachmentType = attached.type;
      }

      // ALL agents use MCP for chat - MCP handles both plugin and non-plugin agents
      const makeChatRequest = async (): Promise<Response> => {
        // Persistent thread ID scoped to user and agent
        const userAddress = wallet.getAccount()?.address;
        const threadKey = `thread-${userAddress}-${agentWallet}`;
        let threadId = sessionStorage.getItem(threadKey);
        if (!threadId) {
          threadId = `thread-${userAddress}-${agentWallet}-${crypto.randomUUID()}`;
          sessionStorage.setItem(threadKey, threadId);
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (userAddress) {
          headers["x-session-user-address"] = userAddress;
        }

        // Build request body with attachment if present (like playground.tsx)
        const requestBody: Record<string, unknown> = {
          message: userMessage.content,
          threadId: threadId,
        };

        // Add attachment base64 data if present (pre-computed above)
        if (attachmentBase64) {
          if (attachmentType === "image") {
            requestBody.image = attachmentBase64;
          } else if (attachmentType === "audio") {
            requestBody.audio = attachmentBase64;
          }
        }

        return fetchWithPayment(`${MCP_URL}/agent/${agentWallet}/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });
      };

      let response = await makeChatRequest();

      // If agent not found (404), auto-register and retry once
      if (response.status === 404) {
        console.log(`[agent] Agent not registered, auto-registering...`);
        const registered = await autoRegisterAgent();
        if (registered) {
          // Wait a moment for backend to spin up the agent
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await makeChatRequest();
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Chat failed: ${response.status}`);
      }

      // Handle streaming response - same pattern of playground.tsx
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Streaming text response
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        setChatStatus("streaming");
        const decoder = new TextDecoder();
        let fullResponse = "";

        // Store assistant ID for RAF flush callback
        currentAssistantIdRef.current = assistantId;
        streamedTextRef.current = "";

        // O(1) message update helper
        const updateAssistantMessage = (content: string) => {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.id === assistantId) {
              next[next.length - 1] = { ...last, content };
              return next;
            }
            // Fallback if ordering changed
            const idx = next.findIndex(m => m.id === assistantId);
            if (idx >= 0) next[idx] = { ...next[idx], content };
            return next;
          });
        };

        // RAF flush function for 60fps max updates
        const flushStreamedContent = () => {
          rafRef.current = null;
          updateAssistantMessage(streamedTextRef.current);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          streamedTextRef.current = fullResponse;

          // Schedule RAF update (batches multiple chunks to single frame)
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flushStreamedContent);
          }
        }

        // Final flush to ensure all content is displayed
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        updateAssistantMessage(fullResponse);

        if (!fullResponse) {
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: "No response received" } : m)
          );
        }
        // Record successful usage
        recordUsage();
      } else if (contentType.includes("image")) {
        // Image response
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: "Generated image:", imageUrl, type: "image" } : m)
        );
        recordUsage();
      } else if (contentType.includes("audio")) {
        // Audio response
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: "Generated audio:", audioUrl, type: "audio" } : m)
        );
        recordUsage();
      } else if (contentType.includes("video")) {
        // Video response
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: "Generated video:", videoUrl, type: "video" } : m)
        );
        recordUsage();
      } else {
        // JSON response - handle multimodal results with base64 data
        const data = await response.json();

        // Check if this is a multimodal result with base64 data
        if (data.success && data.data && data.type) {
          const base64Data = data.data;
          const mimeType = data.mimeType || (data.type === "image" ? "image/png" : data.type === "audio" ? "audio/wav" : "video/mp4");

          // Convert base64 to blob URL
          const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const blob = new Blob([byteArray], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);

          if (data.type === "image") {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: "Generated image:", imageUrl: blobUrl, type: "image" } : m)
            );
          } else if (data.type === "audio") {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: "Generated audio:", audioUrl: blobUrl, type: "audio" } : m)
            );
          } else if (data.type === "video") {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: "Generated video:", videoUrl: blobUrl, type: "video" } : m)
            );
          } else {
            // Text or other content
            const content = data.content || data.output || data.message || JSON.stringify(data);
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content } : m)
            );
          }
        } else if (!data.success && data.error) {
          // Multimodal error response
          throw new Error(data.error);
        } else {
          // Regular JSON response (text output, etc.)
          const content = data.output || data.message || data.content || JSON.stringify(data);
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content } : m)
          );
        }
        recordUsage();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setChatError(errorMsg);
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${errorMsg}` } : m)
      );
    } finally {
      setSending(false);
      setChatStatus("idle");
    }
  }, [inputValue, sending, agentWallet, wallet, toast, agent, autoRegisterAgent, recordUsage, attachedFiles]);

  // Upload knowledge
  const handleUploadKnowledge = useCallback(async () => {
    if (!agentWallet || !knowledgeKey.trim() || !knowledgeContent.trim()) return;

    setUploadingKnowledge(true);
    try {
      const response = await fetch(`${MCP_URL}/agent/${agentWallet}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: knowledgeKey.trim(),
          content: knowledgeContent.trim(),
          metadata: { source: "manual-upload", type: "document" }
        }),
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      toast({
        title: "Knowledge Uploaded!",
        description: `Added "${knowledgeKey}" (${result.contentLength} chars) to agent's knowledge base.`,
      });
      setShowKnowledgeDialog(false);
      setKnowledgeKey("");
      setKnowledgeContent("");
    } catch (err) {
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploadingKnowledge(false);
    }
  }, [agentWallet, knowledgeKey, knowledgeContent, toast]);

  // ==========================================================================
  // Recording Handlers
  // ==========================================================================

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingSupported(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!recordingSupported) {
      setChatError("Audio recording not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, { type: "audio/webm" });

        try {
          const preview = await fileToDataUrl(audioFile);
          const newFile: AttachedFile = { file: audioFile, preview, uploading: true, type: "audio" };
          setAttachedFiles([newFile]);

          const { cid, url } = await uploadConversationFile(audioFile, conversationIdRef.current);
          setAttachedFiles((prev) => prev.map((f) => (f.file === audioFile ? { ...f, cid, url, uploading: false } : f)));
        } catch (err) {
          console.error("Recording upload failed", err);
          setAttachedFiles([]);
          setChatError("Failed to upload recording");
        }
      };

      recorder.start();
      setIsRecording(true);
      setChatError(null);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setChatError("Failed to access microphone");
    }
  }, [recordingSupported]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // ==========================================================================
  // File Attachment Handlers
  // ==========================================================================

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const type = file.type.startsWith("image/") ? "image" : "audio";

      try {
        const preview = await fileToDataUrl(file);
        const newFile: AttachedFile = { file, preview, uploading: true, type: type as "image" | "audio" };
        setAttachedFiles([newFile]);

        const { cid, url } = await uploadConversationFile(file, conversationIdRef.current);
        setAttachedFiles((prev) => prev.map((f) => (f.file === file ? { ...f, cid, url, uploading: false } : f)));
      } catch (err) {
        console.error("Upload failed", err);
        setAttachedFiles([]);
        setChatError("Failed to upload file");
      }
    }
  }, []);

  const handleRemoveFile = useCallback((file: File) => {
    setAttachedFiles((prev) => prev.filter((f) => f.file !== file));
  }, []);

  // ==========================================================================
  // Knowledge File/URL Handlers
  // ==========================================================================

  const handleKnowledgeFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setKnowledgeContent((prev) => prev + (prev ? "\n\n" : "") + text);
        setKnowledgeKey(file.name.replace(/\.[^/.]+$/, ""));
      };
      reader.readAsText(file);
    }
  }, []);

  const handleAddKnowledgeUrl = useCallback(() => {
    if (newKnowledgeUrl.trim() && !knowledgeUrls.includes(newKnowledgeUrl.trim())) {
      setKnowledgeUrls((prev) => [...prev, newKnowledgeUrl.trim()]);
      setNewKnowledgeUrl("");
    }
  }, [newKnowledgeUrl, knowledgeUrls]);

  const handleRemoveKnowledgeUrl = useCallback((url: string) => {
    setKnowledgeUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <div className="mb-8">
          <Skeleton className="h-8 w-48" />
        </div>
        <Card className="glass-panel">
          <CardHeader>
            <Skeleton className="h-24 w-24 rounded-full mx-auto" />
            <Skeleton className="h-8 w-64 mx-auto mt-4" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>

        <div className="text-center py-20 border border-dashed border-red-500/30 rounded-lg">
          <Shield className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400 font-mono">Agent not found</p>
          <p className="text-muted-foreground text-sm mt-2">
            This agent may not exist or hasn't been minted yet.
          </p>
        </div>
      </div>
    );
  }

  // Handle both IPFS URIs (ipfs://) and gateway URLs (https://)
  const avatarUrl = agent.metadata?.avatar && agent.metadata.avatar !== "none"
    ? agent.metadata.avatar.startsWith("ipfs://")
      ? getIpfsUrl(agent.metadata.avatar.replace("ipfs://", ""))
      : agent.metadata.avatar.startsWith("https://")
        ? agent.metadata.avatar
        : null
    : null;

  const initials = (agent.metadata?.name || `Agent ${agent.id}`)
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const licensesDisplay = agent.licenses === 0 ? "∞" : `${agent.licensesAvailable}/${agent.licenses}`;

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>

        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
          <Sparkles className="w-3 h-3 mr-1" />
          Agent #{agent.id}
        </Badge>
      </div>

      {/* Agent Card */}
      <Card className="glass-panel border-cyan-500/30 overflow-hidden">
        {/* Banner Area */}
        <div className="h-32 bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/10 to-transparent relative">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(6,182,212,0.1)_25%,rgba(6,182,212,0.1)_50%,transparent_50%,transparent_75%,rgba(6,182,212,0.1)_75%,rgba(6,182,212,0.1)_100%)] bg-[length:20px_20px]"></div>
        </div>

        {/* Avatar - overlapping */}
        <div className="-mt-16 flex justify-center relative z-10">
          <Avatar className="w-32 h-32 border-4 border-background shadow-xl">
            <AvatarImage src={avatarUrl || undefined} alt={agent.metadata?.name || `Agent #${agent.id}`} />
            <AvatarFallback className="bg-cyan-500/20 text-cyan-400 font-mono text-2xl">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        <CardHeader className="text-center pt-4">
          <CardTitle className="text-2xl font-display font-bold text-white">
            {agent.metadata?.name || `Agent #${agent.id}`}
          </CardTitle>
          <p className="text-muted-foreground font-mono text-sm mt-2">
            {agent.metadata?.description || "No description available"}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <CheckCircle className="w-3 h-3 mr-1" />
              On-Chain Verified
            </Badge>
            {agent.cloneable && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                Cloneable
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <DollarSign className="w-5 h-5 text-green-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Price</p>
              <p className="font-mono text-lg text-green-400">{agent.licensePriceFormatted}</p>
            </div>
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <Package className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Licenses</p>
              <p className="font-mono text-lg text-cyan-400">{licensesDisplay}</p>
            </div>
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <Zap className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Protocol</p>
              <p className="font-mono text-lg text-yellow-400">x402</p>
            </div>
            <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
              <Globe className="w-5 h-5 text-fuchsia-400 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground uppercase">Chain</p>
              <p className="font-mono text-lg text-fuchsia-400">Avalanche</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold font-mono"
              onClick={() => setShowChat(!showChat)}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {showChat ? "HIDE CHAT" : "CHAT WITH AGENT"}
            </Button>
            <Button
              variant="outline"
              className="border-fuchsia-500/30 hover:bg-fuchsia-500/10"
              onClick={() => setShowKnowledgeDialog(true)}
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Upload Knowledge
            </Button>
            <Button
              variant="outline"
              className="border-sidebar-border"
              onClick={() => window.open(`https://testnet.snowtrace.io/token/${import.meta.env.VITE_AGENT_FACTORY_CONTRACT}?a=${agent.id}`, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Explorer
            </Button>
          </div>

          {/* Chat Interface */}
          {showChat && (
            <div className="border border-cyan-500/30 rounded-lg bg-background/50 overflow-hidden">
              {/* Chat Header */}
              <div className="p-3 border-b border-sidebar-border bg-cyan-500/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-mono text-cyan-400">Chat with {agent.metadata?.name || `Agent #${agent.id}`}</span>
                </div>
                {!sessionActive && (
                  <Button size="sm" variant="outline" onClick={() => setShowSessionDialog(true)} className="text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    Start Session
                  </Button>
                )}
              </div>

              {/* Messages */}
              <div ref={scrollContainerRef} className="h-64 p-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Start a conversation with this agent.</p>
                    <p className="text-xs mt-1">Requires x402 payment session.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <Avatar className="w-8 h-8 shrink-0">
                            <AvatarFallback className="bg-cyan-500/20 text-cyan-400 text-xs">
                              {msg.type === "image" ? <ImageIcon className="w-4 h-4" /> :
                                msg.type === "audio" ? <Music className="w-4 h-4" /> :
                                  msg.type === "video" ? <Video className="w-4 h-4" /> :
                                    <Bot className="w-4 h-4" />}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`max-w-[80%] p-3 rounded-lg relative group ${msg.role === "user"
                          ? "bg-fuchsia-500/20 text-fuchsia-100"
                          : "bg-sidebar-accent text-foreground"
                          }`}>
                          {/* Per-message actions - appear on hover */}
                          <div className="absolute -top-8 right-0 hidden group-hover:flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-sidebar-border rounded-md p-1 shadow-lg">
                            {/* Copy button */}
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                toast({ title: "Copied!", description: "Message copied to clipboard" });
                              }}
                              className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy message"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {/* Retry for user messages */}
                            {msg.role === "user" && (
                              <button
                                onClick={() => {
                                  setInputValue(msg.content);
                                  toast({ title: "Retry", description: "Message loaded for re-sending" });
                                }}
                                className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
                                title="Retry this message"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                              className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                              title="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Image content */}
                          {msg.imageUrl && (
                            <img src={msg.imageUrl} alt="Generated" className="rounded-lg max-w-full mb-2" />
                          )}
                          {/* Audio content */}
                          {msg.audioUrl && (
                            <audio controls className="w-full mb-2">
                              <source src={msg.audioUrl} />
                            </audio>
                          )}
                          {/* Video content */}
                          {msg.videoUrl && (
                            <video controls className="rounded-lg max-w-full mb-2">
                              <source src={msg.videoUrl} />
                            </video>
                          )}
                          {/* Text content */}
                          <p className="text-sm whitespace-pre-wrap">{msg.content || <Loader2 className="w-4 h-4 animate-spin" />}</p>
                        </div>
                        {msg.role === "user" && (
                          <Avatar className="w-8 h-8 shrink-0">
                            <AvatarFallback className="bg-fuchsia-500/20 text-fuchsia-400 text-xs">
                              <User className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Status Line */}
              {chatStatus !== "idle" && (
                <div className="px-3 py-2 border-t border-dashed border-sidebar-border bg-sidebar-accent/30 flex items-center gap-2 text-xs font-mono">
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                  <span className="text-muted-foreground">
                    {chatStatus === "paying" && (
                      <><span className="text-yellow-400">Paying...</span> Processing x402 payment</>)}
                    {chatStatus === "waiting" && (
                      <><span className="text-orange-400">Waiting...</span> Awaiting agent response</>)}
                    {chatStatus === "streaming" && (
                      <><span className="text-cyan-400">Streaming...</span> Receiving response</>)}
                  </span>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-sidebar-border">
                {chatError && (
                  <div className="text-xs text-red-400 mb-2 p-2 bg-red-500/10 rounded">{chatError}</div>
                )}

                {/* Attachment Preview */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachedFiles.map((file, index) => (
                      <div key={index} className="relative group">
                        <div className="h-12 w-12 rounded-md overflow-hidden bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                          {file.type === "image" ? (
                            <img src={file.preview} alt="Preview" className="h-full w-full object-cover" />
                          ) : (
                            <Music className="h-6 w-6 text-zinc-500" />
                          )}
                          {file.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveFile(file.file)}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {/* Paperclip attachment */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || isRecording}
                    className="text-zinc-400 hover:text-cyan-400 shrink-0 cursor-pointer"
                    title="Attach file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  {/* Microphone */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={sending || !recordingSupported}
                    className={`shrink-0 transition-colors cursor-pointer ${isRecording ? "text-red-500 hover:text-red-400 animate-pulse" : "text-zinc-400 hover:text-cyan-400"}`}
                    title={isRecording ? "Stop recording" : "Record audio"}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>

                  <Textarea
                    placeholder="Type your message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                    rows={1}
                    className="resize-none flex-1"
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={sending || (!inputValue.trim() && attachedFiles.length === 0)}
                    className="bg-cyan-500 hover:bg-cyan-600 text-black"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Hidden file inputs */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,audio/*"
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* A2A Endpoints */}
          <div className="border-t border-sidebar-border pt-6 space-y-4">
            <h3 className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              A2A Endpoints
            </h3>

            <div className="flex items-center gap-2 p-3 bg-background border border-sidebar-border rounded-lg font-mono text-sm">
              <Code className="w-4 h-4 text-muted-foreground shrink-0" />
              <code className="flex-1 truncate text-cyan-400">{apiEndpoint}</code>
              <Button variant="ghost" size="sm" onClick={copyEndpoint} className="shrink-0 hover:text-cyan-400">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Creator */}
          <div className="border-t border-sidebar-border pt-6">
            <h3 className="text-sm font-mono text-muted-foreground uppercase mb-3">Creator</h3>
            <div className="flex items-center gap-2 font-mono text-sm">
              <LinkIcon className="w-4 h-4 text-muted-foreground" />
              <a
                href={`https://testnet.snowtrace.io/address/${agent.creator}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fuchsia-400 hover:underline truncate"
              >
                {agent.creator}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Upload Dialog */}
      <Dialog open={showKnowledgeDialog} onOpenChange={setShowKnowledgeDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-fuchsia-400" />
              Upload Knowledge
            </DialogTitle>
            <DialogDescription>
              Add documents or URLs to this agent's knowledge base.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* File Upload Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Upload File (.txt, .md)
              </Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => knowledgeFileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Choose File
                </Button>
                <input
                  type="file"
                  ref={knowledgeFileInputRef}
                  onChange={handleKnowledgeFileSelect}
                  accept=".txt,.md,.text"
                  className="hidden"
                />
              </div>
            </div>

            {/* URL Input Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Add URLs (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/docs"
                  value={newKnowledgeUrl}
                  onChange={(e) => setNewKnowledgeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddKnowledgeUrl()}
                />
                <Button variant="outline" size="icon" onClick={handleAddKnowledgeUrl}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {knowledgeUrls.length > 0 && (
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {knowledgeUrls.map((url) => (
                    <div key={url} className="flex items-center gap-2 text-xs bg-zinc-900 px-2 py-1 rounded">
                      <span className="truncate flex-1 text-zinc-400">{url}</span>
                      <button onClick={() => handleRemoveKnowledgeUrl(url)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document Key */}
            <div className="space-y-2">
              <Label htmlFor="key">Document Key</Label>
              <Input
                id="key"
                placeholder="e.g., project-readme, api-docs"
                value={knowledgeKey}
                onChange={(e) => setKnowledgeKey(e.target.value)}
              />
            </div>

            {/* Document Content */}
            <div className="space-y-2">
              <Label htmlFor="content">Content (paste or loaded from file)</Label>
              <Textarea
                id="content"
                placeholder="Paste or upload document content..."
                value={knowledgeContent}
                onChange={(e) => setKnowledgeContent(e.target.value)}
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowKnowledgeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadKnowledge}
              disabled={!knowledgeKey.trim() || !knowledgeContent.trim() || uploadingKnowledge}
              className="bg-fuchsia-500 hover:bg-fuchsia-600"
            >
              {uploadingKnowledge ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Upload</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Budget Dialog */}
      <SessionBudgetDialog open={showSessionDialog} onOpenChange={setShowSessionDialog} />
    </div>
  );
}
