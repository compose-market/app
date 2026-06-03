/**
 * Unified Chat Component
 * 
 * Consolidates:
 * - MultimodalCanvas (chat container with input, attachments, recording)
 * - ChatMessageItem (message bubbles with actions)
 * - MarkdownRenderer (rich content with Mermaid, LaTeX, code)
 * 
 * Used by: agent.tsx, workflow.tsx, playground.tsx
 */
import React, { Suspense, lazy, useState, memo, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { GenerationCanvas } from "@/components/blur";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Bot,
    User,
    Loader2,
    Send,
    Play,
    Paperclip,
    Mic,
    MicOff,
    Music,
    Video,
    X,
    Layers,
    Trash2,
    BookOpen,
    Copy,
    Check,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    FileText,
	    Image as ImageIcon,
	    Wrench,
	    Cpu,
	    Plug,
	    Search,
	    GitBranch,
	    Route,
	} from "lucide-react";
import type { AttachedFile, ChatActivityState, ChatMessage } from "@/hooks/use-chat";

// Re-export for convenience
export type { ChatMessage, AttachedFile };
const LazyMarkdownRenderer = lazy(() =>
    import("@/lib/performance/markdown").then((module) => ({ default: module.MarkdownRenderer }))
);

function EmbeddingBlock({ content }: { content: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    // Parse embedding content - try to prettify it
    let formattedContent = content;
    let dimensions = 0;
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            // Handle nested arrays (multiple embeddings)
            if (Array.isArray(parsed[0])) {
                dimensions = parsed[0].length;
                formattedContent = parsed.map((emb: number[], idx: number) =>
                    `[${idx}]:\n  ` + emb.map((v, i) => `[${i}]: ${v.toFixed(8)}`).join('\n  ')
                ).join('\n\n');
            } else {
                // Single embedding array
                dimensions = parsed.length;
                formattedContent = parsed.map((v: number, i: number) => `[${i}]: ${v.toFixed(8)}`).join('\n');
            }
        }
    } catch {
        // Keep original content if not valid JSON
    }

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="border border-emerald-500/30 rounded-lg overflow-hidden bg-emerald-500/5">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                title="Toggle Embedding Vector"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(!isOpen); }}
            >
                <span className="flex items-center gap-2 font-medium">
                    <span className="text-emerald-500">📊</span>
                    Embedding Vector {dimensions > 0 && <span className="text-emerald-600">({dimensions} dimensions)</span>}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                        className="p-1 rounded hover:bg-emerald-500/20 transition-colors"
                        title="Copy raw embedding"
                        type="button"
                    >
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
            </div>
            {isOpen && (
                <div className="px-3 py-2 border-t border-emerald-500/20 bg-black/30 animate-in fade-in slide-in-from-top-1 duration-200">
                    <pre className="text-xs font-mono text-emerald-300/80 overflow-auto max-h-80 whitespace-pre leading-relaxed">
                        {formattedContent}
                    </pre>
                </div>
            )}
        </div>
    );
}

function AudioBlock({ src, content }: { src: string; content?: string }) {
    return (
        <div className="mb-2 rounded-md border border-cyan-500/25 bg-black/20 p-2">
            {content && <p className="mb-2 text-xs text-muted-foreground">{content}</p>}
            <audio controls preload="metadata" className="w-full">
                <source src={src} />
            </audio>
        </div>
    );
}

function ToolBadge({ tool }: { tool: NonNullable<ChatMessage["toolCalls"]>[number] }) {
    const [open, setOpen] = useState(false);
    const label = tool.targetKind || tool.displayName || tool.name;
    const target = tool.target || tool.displayName;
    const title = tool.error
        ? `${tool.displayName || tool.name}: ${tool.error}`
        : (tool.summary || tool.arguments || target || tool.name);
    const icon = toolIcon(tool.targetKind);
    return (
        <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
                "cm-tool-chip min-h-6 max-w-full px-2 py-0.5 text-left text-[10px] normal-case",
                tool.status === "running" && "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
	                tool.status === "completed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
	                tool.status === "error" && "border-red-500/30 bg-red-500/10 text-red-200",
	                toolKindClass(tool.targetKind),
	            )}
            title={title}
            aria-expanded={open}
        >
	            {icon}
            <span className="truncate">{label}</span>
            <span className="shrink-0 opacity-70">{tool.status}</span>
            {open ? <ChevronUp className="h-3 w-3 shrink-0 opacity-70" /> : <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />}
            {open && (
                <span className="ml-1 inline-flex min-w-0 max-w-[18rem] items-center gap-1 border-l border-current/20 pl-1.5 opacity-80">
                    {target && <span className="truncate">{target}</span>}
                    <span className="shrink-0 opacity-60">raw:{tool.name}</span>
                </span>
            )}
        </button>
    );
}

function toolIcon(kind?: string) {
    const className = "h-2.5 w-2.5 shrink-0 opacity-75";
    switch (kind) {
        case "model": return <Cpu className={className} />;
        case "connector": return <Plug className={className} />;
        case "agent": return <Bot className={className} />;
        case "search": return <Search className={className} />;
        case "harness": return <GitBranch className={className} />;
        case "conclave": return <Layers className={className} />;
        case "route": return <Route className={className} />;
        default: return <Wrench className={className} />;
    }
}

function toolKindClass(kind?: string): string {
    switch (kind) {
        case "model": return "shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]";
        case "connector": return "shadow-[inset_0_0_0_1px_rgba(168,85,247,0.14)]";
        case "agent": return "shadow-[inset_0_0_0_1px_rgba(244,114,182,0.14)]";
        case "search": return "shadow-[inset_0_0_0_1px_rgba(34,197,94,0.12)]";
        case "harness": return "shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]";
        case "conclave": return "shadow-[inset_0_0_0_1px_rgba(45,212,191,0.14)]";
        case "route": return "shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]";
        default: return "";
    }
}


// =============================================================================
// Chat Message Item
// =============================================================================

export interface ChatMessageItemProps {
    message: ChatMessage;
    variant?: "agent" | "workflow" | "playground";
    showActions?: boolean;
    onCopy?: (content: string) => void;
    onRetry?: (content: string) => void;
    onDelete?: (id: string) => void;
    assistantAvatar?: React.ReactNode;
}

const messageVariantStyles = {
    agent: {
        user: "bg-fuchsia-500/20 text-fuchsia-100",
        userAvatar: "bg-fuchsia-500/20 text-fuchsia-400",
        assistant: "",
        assistantAvatar: "bg-cyan-500/20 text-cyan-400",
    },
    workflow: {
        user: "bg-cyan-500/20 text-cyan-100",
        userAvatar: "bg-cyan-500/20 text-cyan-400",
        assistant: "font-mono text-sm",
        assistantAvatar: "bg-fuchsia-500/20 text-fuchsia-400",
    },
    playground: {
        user: "cm-chat-message__bubble--user",
        userAvatar: "cm-chat-message__avatar-user",
        assistant: "",
        assistantAvatar: "bg-cyan-500/20 text-cyan-400",
    },
};

function ChatMessageItemInner({
    message,
    variant = "agent",
    showActions = true,
    onCopy,
    onRetry,
    onDelete,
    assistantAvatar,
}: ChatMessageItemProps) {
    const styles = messageVariantStyles[variant];
    const isUser = message.role === "user";
    // Only treat assistant message as "loading" when generating non-text media.
    // Text "thinking" status is owned exclusively by the activityState bar (see line ~608),
    // so we don't render a second per-bubble spinner for plain text turns.
    const isLoadingMedia = !message.content
        && message.role === "assistant"
        && (message.type === "image" || message.type === "audio" || message.type === "video");

    const getAssistantIcon = () => {
        if (assistantAvatar) return assistantAvatar;
        switch (message.type) {
            case "image": return <ImageIcon className="h-4 w-4" />;
            case "audio": return <Music className="h-4 w-4" />;
            case "video": return <Video className="h-4 w-4" />;
            default: return <Bot className="h-4 w-4" />;
        }
    };

    return (
        <div className={cn("cm-chat-message", isUser && "cm-chat-message--user")}>
            {!isUser && (
                <Avatar className="cm-chat-message__avatar">
                    <AvatarFallback className={cn("cm-chat-message__avatar-assistant", styles.assistantAvatar)}>{getAssistantIcon()}</AvatarFallback>
                </Avatar>
            )}

            <div className={cn("cm-chat-message__bubble group", isUser ? styles.user : styles.assistant, isUser && "cm-chat-message__bubble--user")}>
                {showActions && (
                    <div className="cm-chat-message__actions">
                        {onCopy && (
                            <button
                                onClick={() => onCopy(message.content)}
                                className="cm-chat__icon-action rounded-full p-1 transition-colors"
                                title="Copy message"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {isUser && onRetry && (
                            <button
                                onClick={() => onRetry(message.content)}
                                className="cm-chat__icon-action rounded-full p-1 transition-colors"
                                title="Retry this message"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={() => onDelete(message.id)}
                                className="cm-chat__icon-action rounded-full p-1 transition-colors hover:text-red-400"
                                title="Delete message"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {message.imageUrl && (
                    <img
                        src={message.imageUrl}
                        alt="Generated"
                        className={cn(
                            "rounded-lg max-w-full mb-2 transition-all duration-300",
                            message.partialImage ? "blur-md saturate-75 scale-[1.01]" : "blur-0 saturate-100 scale-100",
                        )}
                    />
                )}
                {message.audioUrl && <AudioBlock src={message.audioUrl} content={!isUser ? message.content : undefined} />}
                {message.videoUrl && <video controls className="rounded-lg max-w-full mb-2"><source src={message.videoUrl} /></video>}

                {!!message.reasoning && (
                    <details className="mb-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
                        <summary className="cursor-pointer font-mono text-amber-300">Thinking</summary>
                        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-amber-100/80">{message.reasoning}</pre>
                    </details>
                )}

                {!!message.progressEvents?.length && (
                    <div className="mb-2 space-y-1 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                        {message.progressEvents.map((event) => (
                            <div key={event.id} className="text-[11px] font-mono text-cyan-200/85">
                                <span className="mr-2 uppercase tracking-wide text-cyan-400/70">{event.phase}</span>
                                <span>{event.message}</span>
                            </div>
                        ))}
                    </div>
                )}

                {!!message.toolCalls?.length && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {message.toolCalls.map((tool) => (
                            <ToolBadge key={tool.id} tool={tool} />
                        ))}
                    </div>
                )}

                {message.audioUrl ? null : message.type === "embedding" ? (
                    <EmbeddingBlock content={message.content || "..."} />
                ) : isLoadingMedia ? (
                    <GenerationCanvas
                        type={message.type as "image" | "audio" | "video"}
                        status={message.content || undefined}
                    />
                ) : isUser ? (
                    <p className="whitespace-pre-wrap text-sm">{message.content || "..."}</p>
                ) : (
                    <Suspense fallback={<p className="whitespace-pre-wrap text-sm">{message.content || "..."}</p>}>
                        <LazyMarkdownRenderer content={message.content || "..."} />
                    </Suspense>
                )}
            </div>

            {isUser && (
                <Avatar className="cm-chat-message__avatar">
                    <AvatarFallback className={cn("cm-chat-message__avatar-user", styles.userAvatar)}><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
            )}
        </div>
    );
}

export const ChatMessageItem = memo(ChatMessageItemInner);

// =============================================================================
// Multimodal Canvas
// =============================================================================

export interface MultimodalCanvasProps {
    messages: ChatMessage[];
    inputValue: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    sending: boolean;
    variant?: "agent" | "workflow" | "playground";
    title?: string;
    icon?: React.ReactNode;
    emptyStateText?: string;
    emptyStateSubtext?: string;
    emptyStateIcon?: React.ReactNode;
    showHeader?: boolean;
    placeholder?: string;
    status?: "idle" | "paying" | "waiting" | "streaming";
    activityState?: ChatActivityState;
    error?: string | null;
    sessionActive?: boolean;
    onStartSession?: () => void;
    attachedFiles?: AttachedFile[];
    onFileSelect?: () => void;
    onRemoveFile?: (file: File) => void;
    fileInputRef?: React.RefObject<HTMLInputElement | null>;
    onFileInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isRecording?: boolean;
    recordingSupported?: boolean;
    onStartRecording?: () => void;
    onStopRecording?: () => void;
    showMessageActions?: boolean;
    onCopyMessage?: (content: string) => void;
    onRetryMessage?: (content: string) => void;
    onDeleteMessage?: (id: string) => void;
    onClearChat?: () => void;
    onKnowledgeUpload?: () => void;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
    messagesEndRef?: React.RefObject<HTMLDivElement | null>;
    height?: string;
}

const canvasVariantConfig = {
    agent: {
        border: "border-cyan-500/30",
        headerBg: "bg-cyan-500/5",
        headerText: "text-cyan-400",
        headerIcon: <Bot className="w-4 h-4 text-cyan-400" />,
        sendButton: "bg-cyan-500 hover:bg-cyan-600 text-black",
        accentColor: "cyan",
    },
    workflow: {
        border: "border-fuchsia-500/30",
        headerBg: "bg-fuchsia-500/5",
        headerText: "text-fuchsia-400",
        headerIcon: <Layers className="w-4 h-4 text-fuchsia-400" />,
        sendButton: "bg-fuchsia-500 hover:bg-fuchsia-600 text-white",
        accentColor: "fuchsia",
    },
    playground: {
        border: "border-cyan-500/20",
        headerBg: "bg-cyan-500/5",
        headerText: "text-cyan-400",
        headerIcon: <Bot className="w-4 h-4 text-cyan-400" />,
        sendButton: "bg-cyan-500 hover:bg-cyan-600 text-black",
        accentColor: "cyan",
    },
};

export function MultimodalCanvas({
    messages,
    inputValue,
    onInputChange,
    onSend,
    sending,
    variant = "agent",
    title,
    icon,
    emptyStateText = "Start a conversation",
    emptyStateSubtext,
    emptyStateIcon,
    showHeader = true,
    placeholder,
    status = "idle",
    activityState,
    error,
    attachedFiles = [],
    onFileSelect,
    onRemoveFile,
    fileInputRef,
    onFileInputChange,
    isRecording = false,
    recordingSupported = true,
    onStartRecording,
    onStopRecording,
    showMessageActions = true,
    onCopyMessage,
    onRetryMessage,
    onDeleteMessage,
    onClearChat,
    onKnowledgeUpload,
    scrollContainerRef,
    messagesEndRef,
    height = "h-64",
}: MultimodalCanvasProps) {
    const config = canvasVariantConfig[variant];
    const activeTools = activityState?.tools.slice(-3) || [];
    const shouldShowActivity = status !== "idle" || Boolean(activityState && activityState.phase !== "idle");
    const nearBottomRef = useRef(true);
    const [showJump, setShowJump] = useState(false);

    const handleSend = useCallback(() => {
        onSend();
    }, [onSend]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const canSend = !sending && (inputValue.trim() || attachedFiles.length > 0);
    const isUploading = attachedFiles.some(f => f.uploading);

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef?.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, [scrollContainerRef]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef?.current?.scrollIntoView({ behavior: "smooth" });
        nearBottomRef.current = true;
        setShowJump(false);
    }, [messagesEndRef]);

    useEffect(() => {
        const el = scrollContainerRef?.current;
        if (!el) return;
        const update = () => {
            const near = isNearBottom();
            nearBottomRef.current = near;
            if (near) setShowJump(false);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        return () => el.removeEventListener("scroll", update);
    }, [isNearBottom, scrollContainerRef]);

    useEffect(() => {
        if (nearBottomRef.current) {
            setShowJump(false);
            return;
        }
        if (messages.length > 0) {
            setShowJump(true);
        }
    }, [messages]);

    return (
        <div className={cn(
            "cm-chat",
            config.border,
            variant === "workflow" && "shadow-[0_0_30px_-5px_hsl(292_85%_55%/0.1)]",
            !showHeader && "cm-chat--bare",
            height
        )}>
            {showHeader && (
                <div className={cn("cm-chat__header", config.headerBg)}>
                    <div className="flex items-center gap-2">
                        {icon || config.headerIcon}
                        <span className={cn("text-sm font-mono", config.headerText)}>{title || "Chat"}</span>
                    </div>
                </div>
            )}

            <div ref={scrollContainerRef} className="cm-chat__body">
                {messages.length === 0 ? (
                    <div className="cm-chat__empty text-sm">
                        {emptyStateIcon || (variant === "workflow" ? (
                            <Play className={cn("w-12 h-12 mx-auto mb-4 opacity-50", config.headerText)} />
                        ) : (
                            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        ))}
                        <p>{emptyStateText}</p>
                        {emptyStateSubtext && <p className="text-xs mt-1 text-muted-foreground/70">{emptyStateSubtext}</p>}
                    </div>
                ) : (
                    <div className="cm-chat__messages">
                        {messages.map((msg) => (
                            <React.Fragment key={msg.id}>
                                <ChatMessageItem
                                    message={msg}
                                    variant={variant}
                                    showActions={showMessageActions}
                                    onCopy={onCopyMessage}
                                    onRetry={onRetryMessage}
                                    onDelete={onDeleteMessage}
                                />
                            </React.Fragment>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
                {showJump ? (
                    <button type="button" className="cm-chat__jump" onClick={scrollToBottom}>
                        <ChevronDown className="h-3.5 w-3.5" />
                        New messages
                    </button>
                ) : null}
            </div>

            {shouldShowActivity && (
                <div className="cm-chat__activity">
                    <Loader2 className={cn("w-3 h-3", (status === "paying" || status === "waiting" || status === "streaming" || activityState?.phase === "thinking" || activityState?.phase === "tool" || activityState?.phase === "streaming") && "animate-spin", config.headerText)} />
                    <span className="text-muted-foreground">
                        {status === "paying" && <><span className="text-yellow-400">Paying...</span> Processing x402 payment</>}
                        {status === "waiting" && <><span className="text-orange-400">Waiting...</span> Awaiting response</>}
                        {status === "streaming" && activityState?.label ? <><span className={config.headerText}>Live...</span> {activityState.label}</> : null}
                        {status === "streaming" && !activityState?.label && <><span className={config.headerText}>Streaming...</span> Receiving response</>}
                        {status === "idle" && activityState?.phase === "streaming" && <><span className={config.headerText}>Live...</span> {activityState.label || "Receiving response"}</>}
                        {status === "idle" && activityState?.phase === "thinking" && <><span className={config.headerText}>Thinking...</span> {activityState.label || "Planning next step"}</>}
                        {status === "idle" && activityState?.phase === "tool" && <><span className={config.headerText}>Tool...</span> {activityState.label || "Using tools"}</>}
                        {status === "idle" && activityState?.phase === "error" && <><span className="text-red-400">Error...</span> {activityState.label || "Execution failed"}</>}
                    </span>
                    {activeTools.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-1">
                            {activeTools.map((tool) => (
                                <span
                                    key={tool.id}
                                    className={cn(
                                        "rounded-full border px-2 py-0.5 text-[10px] normal-case",
                                        tool.status === "running" && "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
                                        tool.status === "completed" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                                        tool.status === "error" && "border-red-500/40 bg-red-500/10 text-red-200",
                                    )}
                                    title={tool.summary || tool.displayName || tool.toolName}
                                >
                                    {tool.displayName || tool.toolName}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="cm-chat__composer">
                {error && <div className="text-xs text-red-400 mb-2 p-2 bg-red-500/10 rounded">{error}</div>}

                {attachedFiles.length > 0 && (
                    <div className="cm-chat__attachments">
                        {attachedFiles.map((file, index) => (
                            <div key={file.file.name + index} className="relative group">
                                <div className="cm-chat__attachment">
                                    {file.type === "image" ? (
                                        <img src={file.preview} alt="Preview" className="h-full w-full object-cover" />
                                    ) : file.type === "video" ? (
                                        file.preview ? <video src={file.preview} className="h-full w-full object-cover" muted /> : <Video className="h-6 w-6 text-pink-500" />
                                    ) : file.type === "pdf" ? (
                                        <FileText className="h-6 w-6 text-muted-foreground" />
                                    ) : file.type === "file" ? (
                                        <Paperclip className="h-6 w-6 text-muted-foreground" />
                                    ) : (
                                        <Music className="h-6 w-6 text-muted-foreground" />
                                    )}
                                    {file.uploading && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                {onRemoveFile && (
                                    <button
                                        onClick={() => onRemoveFile(file.file)}
                                        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-primary/20 bg-background/90 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="cm-chat__composer-row">
                    {onClearChat && (
                        <Button variant="ghost" size="icon" onClick={onClearChat} disabled={sending} className="cm-chat__icon-action shrink-0" title="Clear chat">
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    )}

                    {onFileSelect && (
                        <Button variant="ghost" size="icon" onClick={onFileSelect} disabled={sending || isRecording} className="cm-chat__icon-action shrink-0 cursor-pointer" title="Attach file">
                            <Paperclip className="w-4 h-4" />
                        </Button>
                    )}

                    {onStartRecording && onStopRecording && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={isRecording ? onStopRecording : onStartRecording}
                            disabled={sending || !recordingSupported}
                            className={cn("cm-chat__icon-action shrink-0 cursor-pointer transition-colors", isRecording && "text-red-500 hover:text-red-400 animate-pulse")}
                            title={isRecording ? "Stop recording" : "Record audio"}
                        >
                            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                    )}

                    {onKnowledgeUpload && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={onKnowledgeUpload} disabled={sending} className="cm-chat__icon-action shrink-0 cursor-pointer">
                                        <BookOpen className="w-4 h-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Upload Knowledge</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    <Textarea
                        placeholder={placeholder || (variant === "workflow" ? "Enter workflow parameters or instruction..." : "Type your message...")}
                        value={inputValue}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        className={cn("resize-none flex-1", variant === "workflow" && "font-mono text-sm")}
                        disabled={sending}
                    />

                    <Button onClick={handleSend} disabled={!canSend || isUploading} className={config.sendButton}>
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : variant === "workflow" ? <Play className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    </Button>
                </div>

                {fileInputRef && onFileInputChange && (
                    <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*,audio/*,video/*,application/pdf,.pdf,.txt,.md,.json,.csv,.html,.xml,text/*,application/json" className="hidden" />
                )}
            </div>
        </div>
    );
}
