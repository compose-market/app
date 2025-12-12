/**
 * Manowar Workflow Page
 * 
 * Provides interactive chat/execution interface for Manowar workflows.
 * Fetches Manowar data -> Coordinator Agent -> Executes chat via Coordinator.
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
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/use-session.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionBudgetDialog } from "@/components/session";
import { useOnchainManowarByIdentifier, useOnchainAgent } from "@/hooks/use-onchain";
import { getIpfsUrl, uploadConversationFile, fileToDataUrl } from "@/lib/pinata";
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
    Layers,
    MessageSquare,
    Play,
    Share2,
    Mic,
    MicOff,
    Video,
    Image as ImageIcon,
    Music,
    Paperclip,
    X,
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

export default function ManowarPage() {
    const params = useParams<{ id: string }>();
    const manowarIdentifier = params.id || null;

    // Use identifier-based lookup (supports both wallet address and numeric ID)
    const { data: manowar, isLoading: manowarLoading, error: manowarError } = useOnchainManowarByIdentifier(manowarIdentifier);

    // Coordinator exists if coordinatorModel is set (coordinatorAgentId=0 is valid - IDs start from 0)
    const hasCoordinator = !!manowar?.coordinatorModel;
    const coordinatorAgentId = hasCoordinator ? manowar?.coordinatorAgentId : null;
    const { data: coordinatorAgent, isLoading: agentLoading } = useOnchainAgent(coordinatorAgentId ?? null);

    const isLoading = manowarLoading || (hasCoordinator && coordinatorAgentId !== null && agentLoading);

    const { toast } = useToast();
    const wallet = useActiveWallet();
    const { sessionActive, budgetRemaining, recordUsage } = useSession();

    // Chat state
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [sending, setSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Session dialog
    const [showSessionDialog, setShowSessionDialog] = useState(false);

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
    const conversationIdRef = useRef<string>(`manowar-conv-${Date.now()}`);

    // Audio recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSupported, setRecordingSupported] = useState(true);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Send chat message with x402 payment
    const handleSendMessage = useCallback(async () => {
        if (attachedFiles.some(f => f.uploading)) return;
        if ((!inputValue.trim() && attachedFiles.length === 0) || sending || !manowar) return;

        if (!wallet) {
            toast({ title: "Connect wallet", description: "Please connect your wallet to execute workflow", variant: "destructive" });
            return;
        }

        const attached = attachedFiles[0];
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: inputValue.trim(),
            timestamp: Date.now(),
            type: attached?.type || "text",
            imageUrl: attached?.type === "image" ? attached.preview : undefined,
            audioUrl: attached?.type === "audio" ? attached.preview : undefined,
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue("");
        setAttachedFiles([]); // Clear attachments after sending
        setSending(true);
        setChatError(null);

        // Create assistant placeholder
        const assistantId = crypto.randomUUID();
        setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: Date.now() }]);

        try {
            const normalizedFetch = createNormalizedFetch();
            const fetchWithPayment = wrapFetchWithPayment(
                normalizedFetch,
                thirdwebClient,
                wallet,
                { maxValue: BigInt(10_000) } // $0.01 - matches MANOWAR_PRICES.ORCHESTRATION
            );

            const makeChatRequest = async (): Promise<Response> => {
                // Persistent thread ID scoped to user and manowar workflow
                const userAddress = wallet.getAccount()?.address;
                const threadKey = `manowar-thread-${userAddress}-${manowar.id}`;
                let threadId = sessionStorage.getItem(threadKey);
                if (!threadId) {
                    threadId = `manowar-${manowar.id}-user-${userAddress}-${crypto.randomUUID()}`;
                    sessionStorage.setItem(threadKey, threadId);
                }

                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };

                if (userAddress) {
                    headers["x-session-user-address"] = userAddress;
                }

                // Build request body with optional file attachment
                let requestBody: Record<string, unknown> = {
                    message: userMessage.content,
                    threadId: threadId,
                };

                // Include attached file as base64 if present
                if (attached) {
                    const base64Data = await fileToDataUrl(attached.file);
                    const base64Content = base64Data.split(",")[1]; // Strip data:mime;base64,

                    if (attached.type === "image") {
                        requestBody.image = base64Content;
                    } else if (attached.type === "audio") {
                        requestBody.audio = base64Content;
                    }
                }

                // Use the /manowar/:id/chat endpoint - prefer wallet address for routing
                const manowarIdentifier = manowar.walletAddress || manowar.id.toString();
                return fetchWithPayment(`${MCP_URL}/manowar/${manowarIdentifier}/chat`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(requestBody),
                });
            };

            let response = await makeChatRequest();

            // If coordinator not registered (404), try basic auto-registration if possible (skipped here for complexity, agent page handles it)

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Execution failed: ${response.status}`);
            }

            // Handle streaming response
            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                const decoder = new TextDecoder();
                let fullResponse = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    fullResponse += chunk;
                    setMessages(prev =>
                        prev.map(m => m.id === assistantId ? { ...m, content: fullResponse } : m)
                    );
                }

                if (!fullResponse) {
                    setMessages(prev =>
                        prev.map(m => m.id === assistantId ? { ...m, content: "No response received" } : m)
                    );
                }
                recordUsage();
            } else if (contentType.includes("image")) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);
                setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, content: "Generated image:", imageUrl, type: "image" } : m)
                );
                recordUsage();
            } else if (contentType.includes("audio")) {
                const blob = await response.blob();
                const audioUrl = URL.createObjectURL(blob);
                setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, content: "Generated audio:", audioUrl, type: "audio" } : m)
                );
                recordUsage();
            } else if (contentType.includes("video")) {
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
                if (data.success && data.data && data.type && data.type !== "text") {
                    const base64Data = data.data;
                    const mimeType = data.mimeType || (data.type === "image" ? "image/png" : data.type === "audio" ? "audio/wav" : "video/mp4");

                    // Convert base64 to blob URL
                    const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                    const blob = new Blob([byteArray], { type: mimeType });
                    const blobUrl = URL.createObjectURL(blob);

                    if (data.type === "image") {
                        setMessages(prev =>
                            prev.map(m => m.id === assistantId ? { ...m, content: `Generated image:`, imageUrl: blobUrl, type: "image" } : m)
                        );
                    } else if (data.type === "audio") {
                        setMessages(prev =>
                            prev.map(m => m.id === assistantId ? { ...m, content: `Generated audio:`, audioUrl: blobUrl, type: "audio" } : m)
                        );
                    } else if (data.type === "video") {
                        setMessages(prev =>
                            prev.map(m => m.id === assistantId ? { ...m, content: `Generated video:`, videoUrl: blobUrl, type: "video" } : m)
                        );
                    }
                } else if (!data.success && data.error) {
                    // Error response
                    throw new Error(data.error);
                } else {
                    // Regular text output
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
        }
    }, [inputValue, sending, manowar, wallet, toast, attachedFiles]);

    // Check recording support
    useEffect(() => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setRecordingSupported(false);
        }
    }, []);

    // Recording handlers
    const startRecording = useCallback(async () => {
        if (!recordingSupported) {
            setChatError("Audio recording not supported");
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
                mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                const audioFile = new File([audioBlob], `rec-${Date.now()}.webm`, { type: "audio/webm" });
                try {
                    const preview = await fileToDataUrl(audioFile);
                    setAttachedFiles([{ file: audioFile, preview, uploading: true, type: "audio" }]);
                    const { cid, url } = await uploadConversationFile(audioFile, conversationIdRef.current);
                    setAttachedFiles((prev) => prev.map((f) => (f.file === audioFile ? { ...f, cid, url, uploading: false } : f)));
                } catch {
                    setAttachedFiles([]);
                    setChatError("Failed to upload recording");
                }
            };

            recorder.start();
            setIsRecording(true);
        } catch {
            setChatError("Failed to access microphone");
        }
    }, [recordingSupported]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, [isRecording]);

    // File handlers
    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const type = file.type.startsWith("image/") ? "image" : "audio";
            try {
                const preview = await fileToDataUrl(file);
                setAttachedFiles([{ file, preview, uploading: true, type: type as "image" | "audio" }]);
                const { cid, url } = await uploadConversationFile(file, conversationIdRef.current);
                setAttachedFiles((prev) => prev.map((f) => (f.file === file ? { ...f, cid, url, uploading: false } : f)));
            } catch {
                setAttachedFiles([]);
                setChatError("Failed to upload file");
            }
        }
    }, []);

    const handleRemoveFile = useCallback((file: File) => {
        setAttachedFiles((prev) => prev.filter((f) => f.file !== file));
    }, []);
    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto pb-20">
                <div className="mb-8"><Skeleton className="h-8 w-48" /></div>
                <Card className="glass-panel">
                    <CardHeader><Skeleton className="h-24 w-24 rounded-full mx-auto" /><Skeleton className="h-8 w-64 mx-auto mt-4" /></CardHeader>
                    <CardContent className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-32 w-full" /></CardContent>
                </Card>
            </div>
        );
    }

    if (manowarError || !manowar) {
        return (
            <div className="max-w-4xl mx-auto pb-20">
                <Link href="/my-assets">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2 mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Assets
                    </Button>
                </Link>
                <div className="text-center py-20 border border-dashed border-red-500/30 rounded-lg">
                    <Shield className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
                    <p className="text-red-400 font-mono">Manowar Workflow not found</p>
                </div>
            </div>
        );
    }

    const bannerUrl = manowar.banner && manowar.banner.startsWith("ipfs://")
        ? getIpfsUrl(manowar.banner.replace("ipfs://", ""))
        : null;

    return (
        <div className="max-w-4xl mx-auto pb-20">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <Link href="/my-assets">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-fuchsia-400 -ml-2">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Assets
                    </Button>
                </Link>

                <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30">
                    <Layers className="w-3 h-3 mr-1" />
                    Manowar #{manowar.id}
                </Badge>
            </div>

            {/* Manowar Card */}
            <Card className="glass-panel border-fuchsia-500/30 overflow-hidden">
                {/* Banner */}
                <div className="h-48 bg-cover bg-center bg-no-repeat relative" style={{ backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined }}>
                    {!bannerUrl && <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/20 via-cyan-500/10 to-background" />}
                </div>

                <CardHeader className="pt-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-2xl font-display font-bold text-white">
                                {manowar.title || `Workflow #${manowar.id}`}
                            </CardTitle>
                            <p className="text-muted-foreground font-mono text-sm mt-2 max-w-2xl">
                                {manowar.description || "No description available"}
                            </p>
                        </div>
                        {manowar.hasActiveRfa && (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                Active RFA
                            </Badge>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
                            <DollarSign className="w-5 h-5 text-green-400 mx-auto mb-2" />
                            <p className="text-[10px] text-muted-foreground uppercase">Run Cost</p>
                            <p className="font-mono text-lg text-green-400">${manowar.x402Price}</p>
                        </div>
                        <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
                            <Bot className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
                            <p className="text-[10px] text-muted-foreground uppercase">Coordinator</p>
                            {coordinatorAgent ? (
                                <Link href={`/agent/${coordinatorAgent.walletAddress}`}>
                                    <p className="font-mono text-sm text-cyan-400 hover:underline cursor-pointer">
                                        {coordinatorAgent.metadata?.name || `Agent #${coordinatorAgent.id}`}
                                    </p>
                                </Link>
                            ) : hasCoordinator ? (
                                <p className="font-mono text-sm text-cyan-400">{manowar?.coordinatorModel}</p>
                            ) : (
                                <p className="font-mono text-sm text-muted-foreground">None</p>
                            )}
                        </div>
                    </div>

                    {!hasCoordinator ? (
                        <div className="p-4 border border-yellow-500/30 bg-yellow-500/10 rounded-lg text-yellow-400 text-sm">
                            <p>This workflow does not have a coordinator assigned. It cannot be executed interactively.</p>
                        </div>
                    ) : (
                        <Button
                            className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-bold font-mono h-12"
                            onClick={() => setShowChat(!showChat)}
                        >
                            <Play className="w-4 h-4 mr-2" />
                            {showChat ? "HIDE CONSOLE" : "LAUNCH EXECUTION CONSOLE"}
                        </Button>
                    )}

                    {/* Chat Interface */}
                    {showChat && hasCoordinator && (
                        <div className="border border-fuchsia-500/30 rounded-lg bg-background/50 overflow-hidden shadow-[0_0_30px_-5px_hsl(292_85%_55%/0.1)]">
                            {/* Header */}
                            <div className="p-3 border-b border-sidebar-border bg-fuchsia-500/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-fuchsia-400" />
                                    <span className="text-sm font-mono text-fuchsia-400">Workflow Execution Console</span>
                                </div>
                                {!sessionActive && (
                                    <Button size="sm" variant="outline" onClick={() => setShowSessionDialog(true)} className="text-xs">
                                        <Zap className="w-3 h-3 mr-1" />
                                        Start Session
                                    </Button>
                                )}
                            </div>

                            {/* Messages */}
                            <ScrollArea className="h-96 p-4">
                                {messages.length === 0 ? (
                                    <div className="text-center text-muted-foreground text-sm py-16">
                                        <Play className="w-12 h-12 mx-auto mb-4 opacity-50 text-fuchsia-400" />
                                        <p>Ready to execute workflow.</p>
                                        <p className="text-xs mt-2 text-muted-foreground/70">
                                            Input will be sent to Coordinator <span className="text-cyan-400">{coordinatorAgent?.metadata?.name || manowar?.coordinatorModel || "Agent"}</span>
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {messages.map((msg) => (
                                            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                                                {msg.role === "assistant" && (
                                                    <Avatar className="w-8 h-8 shrink-0">
                                                        <AvatarFallback className="bg-fuchsia-500/20 text-fuchsia-400 text-xs">
                                                            {msg.type === "image" ? <ImageIcon className="w-4 h-4" /> :
                                                                msg.type === "audio" ? <Music className="w-4 h-4" /> :
                                                                    msg.type === "video" ? <Video className="w-4 h-4" /> :
                                                                        <Bot className="w-4 h-4" />}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                )}
                                                <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === "user"
                                                    ? "bg-cyan-500/20 text-cyan-100"
                                                    : "bg-sidebar-accent text-foreground font-mono text-sm"
                                                    }`}>
                                                    {msg.imageUrl && <img src={msg.imageUrl} alt="Generated" className="rounded-lg max-w-full mb-2" />}
                                                    {msg.audioUrl && <audio controls className="w-full mb-2"><source src={msg.audioUrl} /></audio>}
                                                    {msg.videoUrl && <video controls className="rounded-lg max-w-full mb-2"><source src={msg.videoUrl} /></video>}
                                                    <p className="whitespace-pre-wrap">{msg.content || <Loader2 className="w-4 h-4 animate-spin" />}</p>
                                                </div>
                                                {msg.role === "user" && (
                                                    <Avatar className="w-8 h-8 shrink-0">
                                                        <AvatarFallback className="bg-cyan-500/20 text-cyan-400 text-xs">
                                                            <User className="w-4 h-4" />
                                                        </AvatarFallback>
                                                    </Avatar>
                                                )}
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </ScrollArea>

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
                                                    {file.type === "image" ? <img src={file.preview} alt="Preview" className="h-full w-full object-cover" /> : <Music className="h-6 w-6 text-zinc-500" />}
                                                    {file.uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>}
                                                </div>
                                                <button onClick={() => handleRemoveFile(file.file)} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-zinc-400 hover:text-white"><X className="h-2.5 w-2.5" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending || isRecording} className="text-zinc-400 hover:text-fuchsia-400 shrink-0 cursor-pointer" title="Attach file">
                                        <Paperclip className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={isRecording ? stopRecording : startRecording} disabled={sending || !recordingSupported} className={`shrink-0 transition-colors cursor-pointer ${isRecording ? "text-red-500 hover:text-red-400 animate-pulse" : "text-zinc-400 hover:text-fuchsia-400"}`} title={isRecording ? "Stop recording" : "Record audio"}>
                                        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    </Button>
                                    <Textarea
                                        placeholder="Enter workflow parameters or instruction..."
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                        rows={1}
                                        className="resize-none flex-1 font-mono text-sm"
                                        disabled={sending}
                                    />
                                    <Button onClick={handleSendMessage} disabled={sending || (!inputValue.trim() && attachedFiles.length === 0)} className="bg-fuchsia-500 hover:bg-fuchsia-600 text-white">
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                    </Button>
                                </div>
                                <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,audio/*" className="hidden" />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Session Budget Dialog */}
            <SessionBudgetDialog open={showSessionDialog} onOpenChange={setShowSessionDialog} />
        </div>
    );
}
