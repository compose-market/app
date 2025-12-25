/**
 * Reusable Chat Message Component
 * 
 * Renders a single chat message with support for:
 * - Text, image, audio, video, and embedding content
 * - User and assistant message styling
 * - Per-message actions (copy, retry, delete)
 * - Loading state
 */
import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Bot,
    User,
    Loader2,
    Image as ImageIcon,
    Music,
    Video,
    Copy,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/renderer";

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    type?: "text" | "image" | "audio" | "video" | "embedding";
    imageUrl?: string;
    audioUrl?: string;
    videoUrl?: string;
}

export interface ChatMessageItemProps {
    message: ChatMessage;
    /** Visual variant for theming */
    variant?: "agent" | "manowar" | "playground";
    /** Show action buttons on hover */
    showActions?: boolean;
    /** Callback when copy is clicked */
    onCopy?: (content: string) => void;
    /** Callback when retry is clicked (user messages only) */
    onRetry?: (content: string) => void;
    /** Callback when delete is clicked */
    onDelete?: (id: string) => void;
    /** Custom avatar for assistant */
    assistantAvatar?: React.ReactNode;
    /** Custom fallback initials for assistant */
    assistantInitials?: string;
}

// Color schemes for variants
const variantStyles = {
    agent: {
        user: "bg-fuchsia-500/20 text-fuchsia-100",
        userAvatar: "bg-fuchsia-500/20 text-fuchsia-400",
        assistant: "bg-sidebar-accent text-foreground",
        assistantAvatar: "bg-cyan-500/20 text-cyan-400",
    },
    manowar: {
        user: "bg-cyan-500/20 text-cyan-100",
        userAvatar: "bg-cyan-500/20 text-cyan-400",
        assistant: "bg-sidebar-accent text-foreground font-mono text-sm",
        assistantAvatar: "bg-fuchsia-500/20 text-fuchsia-400",
    },
    playground: {
        user: "bg-cyan-600 text-white",
        userAvatar: "bg-zinc-700 text-zinc-300",
        assistant: "bg-zinc-800 text-zinc-100",
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
    const styles = variantStyles[variant];
    const isUser = message.role === "user";
    const isLoading = !message.content && message.role === "assistant";

    // Get assistant icon based on message type
    const getAssistantIcon = () => {
        if (assistantAvatar) return assistantAvatar;

        switch (message.type) {
            case "image":
                return <ImageIcon className="h-4 w-4" />;
            case "audio":
                return <Music className="h-4 w-4" />;
            case "video":
                return <Video className="h-4 w-4" />;
            default:
                return <Bot className="h-4 w-4" />;
        }
    };

    return (
        <div
            className={cn(
                "flex gap-3",
                isUser && "justify-end"
            )}
        >
            {/* Assistant avatar */}
            {!isUser && (
                <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className={styles.assistantAvatar}>
                        {getAssistantIcon()}
                    </AvatarFallback>
                </Avatar>
            )}

            {/* Message bubble */}
            <div
                className={cn(
                    "max-w-[80%] p-3 rounded-lg relative group",
                    isUser ? styles.user : styles.assistant
                )}
            >
                {/* Action buttons - appear on hover */}
                {showActions && (
                    <div className="absolute -top-8 right-0 hidden group-hover:flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-sidebar-border rounded-md p-1 shadow-lg z-10">
                        {/* Copy button */}
                        {onCopy && (
                            <button
                                onClick={() => onCopy(message.content)}
                                className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
                                title="Copy message"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {/* Retry for user messages */}
                        {isUser && onRetry && (
                            <button
                                onClick={() => onRetry(message.content)}
                                className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
                                title="Retry this message"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {/* Delete button */}
                        {onDelete && (
                            <button
                                onClick={() => onDelete(message.id)}
                                className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                                title="Delete message"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Image content */}
                {message.imageUrl && (
                    <img
                        src={message.imageUrl}
                        alt="Generated"
                        className="rounded-lg max-w-full mb-2"
                    />
                )}

                {/* Audio content */}
                {message.audioUrl && (
                    <audio controls className="w-full mb-2">
                        <source src={message.audioUrl} />
                    </audio>
                )}

                {/* Video content */}
                {message.videoUrl && (
                    <video controls className="rounded-lg max-w-full mb-2">
                        <source src={message.videoUrl} />
                    </video>
                )}

                {/* Text content */}
                {message.type === "embedding" ? (
                    <pre className="text-xs overflow-auto max-h-64 font-mono">
                        {message.content || "..."}
                    </pre>
                ) : isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Thinking...</span>
                    </div>
                ) : isUser ? (
                    // User messages: plain text (no markdown)
                    <p className="whitespace-pre-wrap text-sm">
                        {message.content || "..."}
                    </p>
                ) : (
                    // Assistant messages: rich markdown
                    <MarkdownRenderer content={message.content || "..."} />
                )}
            </div>

            {/* User avatar */}
            {isUser && (
                <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className={styles.userAvatar}>
                        <User className="w-4 h-4" />
                    </AvatarFallback>
                </Avatar>
            )}
        </div>
    );
}

// Memoized to prevent re-renders during streaming
export const ChatMessageItem = memo(ChatMessageItemInner);
