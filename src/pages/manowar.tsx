/**
 * Manowar Workflow Page
 * 
 * Provides interactive chat/execution interface for Manowar workflows.
 * Fetches Manowar data -> Coordinator Agent -> Executes chat via Coordinator.
 * 
 * Uses shared MultimodalCanvas component and hooks for the chat interface.
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
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/use-session.tsx";
import { SessionBudgetDialog } from "@/components/session";
import { useOnchainManowarByIdentifier, useOnchainAgent } from "@/hooks/use-onchain";
import { getIpfsUrl, fileToDataUrl } from "@/lib/pinata";
import { MultimodalCanvas } from "@/components/canvas";
import { type ChatMessage } from "@/components/chat";
import { useChat } from "@/hooks/use-chat";
import { useFileAttachment, type AttachedFile } from "@/hooks/use-attachment";
import { useAudioRecording } from "@/hooks/use-recording";
import {
    ArrowLeft,
    DollarSign,
    Shield,
    Loader2,
    Play,
    Layers,
    Bot,
} from "lucide-react";

const MANOWAR_URL = (import.meta.env.VITE_MANOWAR_URL || "https://manowar.compose.market").replace(/\/+$/, "");

export default function ManowarPage() {
    const params = useParams<{ id: string }>();
    const manowarIdentifier = params.id || null;

    // Use identifier-based lookup (supports both wallet address and numeric ID)
    const { data: manowar, isLoading: manowarLoading, error: manowarError } = useOnchainManowarByIdentifier(manowarIdentifier);

    // Coordinator exists if hasCoordinator is true
    const hasCoordinator = !!manowar?.hasCoordinator;
    const coordinatorAgent = null; // Coordinator is now model-based, not agent-based

    const isLoading = manowarLoading;

    const { toast } = useToast();
    const wallet = useActiveWallet();
    const { sessionActive, budgetRemaining, recordUsage } = useSession();

    // Chat state from shared hook
    const chat = useChat();
    const { messages, setMessages, messagesEndRef } = chat;
    const [showChat, setShowChat] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [sending, setSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    // Session dialog
    const [showSessionDialog, setShowSessionDialog] = useState(false);

    // File attachment from shared hook
    const manowarWallet = manowar?.walletAddress;
    const fileAttachment = useFileAttachment({
        conversationId: `manowar-${manowarWallet || 'unknown'}`,
        onError: (err) => setChatError(err),
    });
    const { attachedFiles, fileInputRef, handleFileSelect, handleRemoveFile, isUploading } = fileAttachment;

    // Audio recording from shared hook
    const recording = useAudioRecording({
        conversationId: `manowar-${manowarWallet || 'unknown'}`,
        onRecordingComplete: (file) => {
            fileAttachment.attachedFiles.length === 0 &&
                fileAttachment.handleFileSelect({ target: { files: [file.file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
        },
        onError: (err) => setChatError(err),
    });
    const { isRecording, recordingSupported, startRecording, stopRecording } = recording;

    // Note: Auto-scroll handled by useChat hook

    // Auto-register manowar with backend if not registered (matching agent.tsx pattern)
    const autoRegisterManowar = useCallback(async (): Promise<boolean> => {
        if (!manowar || !manowar.walletAddress) return false;

        try {
            const response = await fetch(`${MANOWAR_URL}/manowar/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    manowarId: manowar.id,
                    walletAddress: manowar.walletAddress,
                    dnaHash: manowar.dnaHash,
                    title: manowar.title || `Manowar #${manowar.id}`,
                    description: manowar.description || "",
                    image: manowar.image,
                    creator: manowar.creator,
                    hasCoordinator: manowar.hasCoordinator,
                    coordinatorModel: manowar.coordinatorModel,
                    totalPrice: manowar.totalPrice,
                }),
            });

            if (response.ok || response.status === 409) {
                // 409 = already registered, which is fine
                console.log(`[manowar] Auto-registered manowar ${manowar.walletAddress}`);
                return true;
            }

            console.warn(`[manowar] Auto-registration failed:`, await response.text());
            return false;
        } catch (err) {
            console.error(`[manowar] Auto-registration error:`, err);
            return false;
        }
    }, [manowar]);

    // Pre-register manowar when chat is opened (avoids 404 -> register race condition)
    useEffect(() => {
        if (showChat && manowar?.walletAddress) {
            autoRegisterManowar().then((ok) => {
                if (!ok) {
                    console.warn("[manowar] Pre-registration failed, will retry on 404");
                }
            });
        }
    }, [showChat, manowar?.walletAddress, autoRegisterManowar]);

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
        fileAttachment.clearFiles(); // Clear attachments after sending
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
                return fetchWithPayment(`${MANOWAR_URL}/manowar/${manowarIdentifier}/chat`, {
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
    }, [inputValue, sending, manowar, wallet, toast, attachedFiles, recordUsage]);

    // Note: Recording and file handlers provided by hooks
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

    const bannerUrl = manowar.image && manowar.image.startsWith("ipfs://")
        ? getIpfsUrl(manowar.image.replace("ipfs://", ""))
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
                            <p className="text-[10px] text-muted-foreground uppercase">Total Cost</p>
                            <p className="font-mono text-lg text-green-400">${manowar.totalPrice}</p>
                        </div>
                        <div className="p-4 bg-background/50 border border-sidebar-border rounded-lg text-center">
                            <Bot className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
                            <p className="text-[10px] text-muted-foreground uppercase">Coordinator</p>
                            {hasCoordinator ? (
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

                    {/* Chat Interface - using shared MultimodalCanvas */}
                    {showChat && hasCoordinator && (
                        <MultimodalCanvas
                            variant="manowar"
                            title="Workflow Execution Console"
                            messages={messages}
                            inputValue={inputValue}
                            onInputChange={setInputValue}
                            onSend={handleSendMessage}
                            sending={sending}
                            error={chatError}
                            sessionActive={sessionActive}
                            onStartSession={() => setShowSessionDialog(true)}
                            attachedFiles={attachedFiles}
                            onFileSelect={() => fileInputRef.current?.click()}
                            onRemoveFile={handleRemoveFile}
                            fileInputRef={fileInputRef}
                            onFileInputChange={handleFileSelect}
                            isRecording={isRecording}
                            recordingSupported={recordingSupported}
                            onStartRecording={startRecording}
                            onStopRecording={stopRecording}
                            messagesEndRef={messagesEndRef}
                            height="h-96"
                            emptyStateText="Ready to execute workflow."
                            emptyStateSubtext={`Input will be sent to Coordinator ${manowar?.coordinatorModel || "Model"}`}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Session Budget Dialog */}
            <SessionBudgetDialog open={showSessionDialog} onOpenChange={setShowSessionDialog} />
        </div>
    );
}
