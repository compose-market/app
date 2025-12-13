/**
 * Shared chat state management hook
 * 
 * Provides O(1) message updates, RAF-batched streaming, and stick-to-bottom scroll.
 */
import { useState, useRef, useCallback, useEffect } from "react";

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

export interface AttachedFile {
    file: File;
    cid?: string;
    url?: string;
    preview?: string;
    uploading: boolean;
    type: "image" | "audio";
}

export interface UseChatOptions {
    /** Called when a full response is received */
    onResponse?: (message: ChatMessage) => void;
    /** Enable 60fps max streaming updates via requestAnimationFrame */
    rafBatching?: boolean;
}

export interface UseChatReturn {
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    /** Add a user message, returns the message ID */
    addUserMessage: (content: string, options?: {
        type?: ChatMessage["type"];
        imageUrl?: string;
        audioUrl?: string;
    }) => string;
    /** Create an assistant placeholder, returns the message ID */
    createAssistantPlaceholder: (type?: ChatMessage["type"]) => string;
    /** Update assistant message by ID (O(1) for last message) */
    updateAssistantMessage: (id: string, update: Partial<ChatMessage>) => void;
    /** Clear all messages */
    clearMessages: () => void;
    // RAF batching for streaming
    streamedTextRef: React.MutableRefObject<string>;
    currentAssistantIdRef: React.MutableRefObject<string | null>;
    /** Schedule a streaming update (batched to RAF) */
    scheduleStreamUpdate: (content: string) => void;
    /** Flush any pending stream content immediately */
    flushStreamContent: () => void;
    // Scroll management
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    /** Check if user is near bottom of scroll */
    isNearBottom: () => boolean;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
    const { rafBatching = true } = options;

    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // RAF batching refs
    const streamedTextRef = useRef<string>("");
    const rafRef = useRef<number | null>(null);
    const currentAssistantIdRef = useRef<string | null>(null);

    // Scroll refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Add user message
    const addUserMessage = useCallback((
        content: string,
        options?: {
            type?: ChatMessage["type"];
            imageUrl?: string;
            audioUrl?: string;
        }
    ): string => {
        const id = crypto.randomUUID();
        const message: ChatMessage = {
            id,
            role: "user",
            content,
            timestamp: Date.now(),
            type: options?.type || "text",
            imageUrl: options?.imageUrl,
            audioUrl: options?.audioUrl,
        };
        setMessages(prev => [...prev, message]);
        return id;
    }, []);

    // Create assistant placeholder
    const createAssistantPlaceholder = useCallback((type?: ChatMessage["type"]): string => {
        const id = crypto.randomUUID();
        currentAssistantIdRef.current = id;
        streamedTextRef.current = "";

        setMessages(prev => [...prev, {
            id,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            type: type || "text",
        }]);

        return id;
    }, []);

    // O(1) update for assistant message (optimized for last message)
    const updateAssistantMessage = useCallback((id: string, update: Partial<ChatMessage>) => {
        setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];

            // Fast path: updating last message
            if (last?.id === id) {
                next[next.length - 1] = { ...last, ...update };
                return next;
            }

            // Fallback: find by ID
            const idx = next.findIndex(m => m.id === id);
            if (idx >= 0) {
                next[idx] = { ...next[idx], ...update };
            }
            return next;
        });
    }, []);

    // Clear all messages
    const clearMessages = useCallback(() => {
        setMessages([]);
        streamedTextRef.current = "";
        currentAssistantIdRef.current = null;
    }, []);

    // RAF-batched stream update
    const flushStreamContent = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const assistantId = currentAssistantIdRef.current;
        const content = streamedTextRef.current;

        if (assistantId && content) {
            updateAssistantMessage(assistantId, { content });
        }
    }, [updateAssistantMessage]);

    const scheduleStreamUpdate = useCallback((content: string) => {
        streamedTextRef.current = content;

        if (!rafBatching) {
            // Direct update without batching
            const assistantId = currentAssistantIdRef.current;
            if (assistantId) {
                updateAssistantMessage(assistantId, { content });
            }
            return;
        }

        // Schedule RAF if not already scheduled
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                const assistantId = currentAssistantIdRef.current;
                if (assistantId) {
                    updateAssistantMessage(assistantId, { content: streamedTextRef.current });
                }
            });
        }
    }, [rafBatching, updateAssistantMessage]);

    // Stick-to-bottom: check if user is near bottom
    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, []);

    // Auto-scroll when messages change (only if near bottom)
    useEffect(() => {
        if (!isNearBottom()) return;
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, [messages, isNearBottom]);

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return {
        messages,
        setMessages,
        addUserMessage,
        createAssistantPlaceholder,
        updateAssistantMessage,
        clearMessages,
        streamedTextRef,
        currentAssistantIdRef,
        scheduleStreamUpdate,
        flushStreamContent,
        scrollContainerRef,
        messagesEndRef,
        isNearBottom,
    };
}
