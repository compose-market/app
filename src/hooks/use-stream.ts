/**
 * useComposeStream — the single dispatch surface every chat-like page
 * (playground, agent, workflow) uses to drive SDK streaming into the
 * use-chat activity machine.
 *
 * One hook replaces the three separate hand-rolled `parseEventStream` loops
 * that lived in `agent.tsx`, `workflow.tsx`, and `playground.tsx`. The hook
 * speaks to the SDK's typed stream iterators (`sdk.agent.stream`,
 * `sdk.workflow.stream`, `sdk.inference.chat.completions.stream`,
 * `sdk.inference.responses.stream`, `sdk.inference.videos.stream`) and
 * dispatches every event into the `useChat` activity sink (thinking,
 * streaming, tool, error) exactly once per page.
 *
 * Page consumers write:
 *
 *   const streamer = useComposeStream(chat, {
 *     onReceipt, onSessionInvalid, onError,
 *   });
 *   await streamer.runAgent({ agentWallet, message, threadId, userAddress });
 *
 * Nothing more. All SDK-event → UI-state wiring lives in this file.
 */

import { useCallback, useEffect, useRef } from "react";
import type {
    AgentRuntimeEvent,
    ChatCompletionChunk,
    ChatCompletionsCreateParams,
    ComposeAttachmentInput,
    ComposeCallOptions,
    Receipt,
    ResponseStreamEvent,
    ResponsesCreateParams,
    SessionBudgetSnapshot,
    SessionInvalidReason,
    ToolCallLifecycleEvent,
    WorkflowRuntimeEvent,
} from "@compose-market/sdk";

import { sdk } from "@/lib/sdk";
import type { UseChatReturn } from "@/hooks/use-chat";

export interface ComposeStreamCallbacks {
    onReceipt?: (receipt: Receipt) => void;
    onBudget?: (snapshot: SessionBudgetSnapshot) => void;
    onSessionInvalid?: (reason: SessionInvalidReason) => void;
    onError?: (err: { code?: string; message: string }) => void;
    onVideoStatus?: (status: { jobId: string; status: "queued" | "processing" | "completed" | "failed"; progress?: number; url?: string; error?: string }) => void;
    /** Called as soon as the SDK emits its terminal done event. */
    onDone?: () => void;
    /** Called once with the final aggregated result after the stream ends. */
    onFinal?: (final: { text: string; requestId: string | null; structuredOutput?: unknown }) => void;
}

type StreamCallOptions = Pick<
    ComposeCallOptions,
    "x402MaxAmountWei" | "idempotencyKey" | "composeRunId" | "composeKey" | "userAddress" | "chainId" | "timeoutMs"
>;

interface AgentChildStreamEvent {
    type: "child";
    event: "start" | "delta" | "tool-start" | "tool-end" | "done" | "error";
    agentWallet?: string;
    subId?: string;
    toolName?: string;
    delta?: string;
    failed?: boolean;
    error?: string;
    display?: { name?: string };
}

interface AgentTraceStreamEvent {
    type: "trace";
    source: "capability" | "model" | "tool" | "agent" | "harness" | "route";
    stage?: string;
    action?: string;
    message?: string;
    display?: { kind?: string; name?: string; target?: string; summary?: string };
}

type AgentStreamEvent =
    | AgentRuntimeEvent
    | { type: "reasoning-delta"; delta: string }
    | AgentChildStreamEvent
    | AgentTraceStreamEvent;

interface ResponseOutputItem {
    type: string;
    role?: "assistant";
    text?: string;
    image_url?: string;
    audio_url?: string;
    video_url?: string;
    embedding?: number[];
    job_id?: string;
    status?: string;
    progress?: number;
    mime_type?: string;
    [key: string]: unknown;
}

export interface AgentStreamArgs {
    agentWallet: string;
    message: string;
    threadId: string;
    userAddress: string;
    cloudPermissions?: string[];
    composeRunId?: string;
    attachment?: ComposeAttachmentInput;
    assistantId: string;
    signal?: AbortSignal;
    options?: StreamCallOptions;
}

export interface WorkflowStreamArgs {
    workflowWallet: string;
    message: string;
    threadId: string;
    userAddress: string;
    composeRunId?: string;
    continuous?: boolean;
    lastEventIndex?: number;
    attachment?: ComposeAttachmentInput;
    assistantId: string;
    signal?: AbortSignal;
    options?: StreamCallOptions;
}

export interface ChatStreamArgs {
    params: ChatCompletionsCreateParams;
    assistantId: string;
    signal?: AbortSignal;
    options?: StreamCallOptions;
}

export interface ResponsesStreamArgs {
    params: ResponsesCreateParams;
    assistantId: string;
    signal?: AbortSignal;
    options?: StreamCallOptions;
}

export interface UseComposeStream {
    runAgent: (args: AgentStreamArgs) => Promise<void>;
    runWorkflow: (args: WorkflowStreamArgs) => Promise<void>;
    runChat: (args: ChatStreamArgs) => Promise<void>;
    runResponses: (args: ResponsesStreamArgs) => Promise<void>;
}

export function useComposeStream(
    chat: UseChatReturn,
    callbacks: ComposeStreamCallbacks = {},
): UseComposeStream {
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    // Global event-bus subscriptions — fire page-level callbacks whenever the
    // SDK detects budget / sessionInvalid / receipt on ANY call, not just the
    // ones owned by this hook instance. This matches existing web UX where
    // the session indicator updates after every billable response globally.
    useEffect(() => {
        const unsubs: Array<() => void> = [
            sdk.events.on("receipt", (event) => callbacksRef.current.onReceipt?.(event.receipt)),
            sdk.events.on("budget", (event) => callbacksRef.current.onBudget?.(event.snapshot)),
            sdk.events.on("sessionInvalid", (event) => callbacksRef.current.onSessionInvalid?.(event.reason)),
            sdk.events.on("toolCallStart", (event: ToolCallLifecycleEvent) => {
                const meta = event as ToolCallLifecycleEvent & {
                    displayName?: string;
                    targetKind?: string;
                    target?: string;
                    display?: { kind?: string; target?: string };
                };
                const displayName = meta.displayName;
                const targetKind = meta.targetKind ?? meta.display?.kind;
                const target = meta.target ?? meta.display?.target;
                chat.startToolActivity(event.toolName, event.summary, displayName);
                chat.setActivityPhase("tool", `Using ${targetKind || displayName || event.toolName}...`);
                const assistantId = chat.currentAssistantIdRef.current;
                if (assistantId) {
                    chat.upsertAssistantToolCall(assistantId, {
                        id: event.toolCallId,
                        name: event.toolName,
                        displayName,
                        targetKind,
                        target,
                        source: event.source,
                        summary: event.summary,
                        arguments: event.arguments,
                        status: "running",
                    });
                }
            }),
            sdk.events.on("toolCallEnd", (event: ToolCallLifecycleEvent) => {
                const meta = event as ToolCallLifecycleEvent & {
                    displayName?: string;
                    targetKind?: string;
                    target?: string;
                    display?: { kind?: string; target?: string };
                };
                const displayName = meta.displayName;
                const targetKind = meta.targetKind ?? meta.display?.kind;
                const target = meta.target ?? meta.display?.target;
                chat.finishToolActivity(event.toolName, event.summary, event.failed ?? false, displayName);
                const assistantId = chat.currentAssistantIdRef.current;
                if (assistantId) {
                    chat.upsertAssistantToolCall(assistantId, {
                        id: event.toolCallId,
                        name: event.toolName,
                        displayName,
                        targetKind,
                        target,
                        source: event.source,
                        summary: event.summary,
                        arguments: event.arguments,
                        status: event.failed ? "error" : "completed",
                        error: event.error,
                    });
                }
                if (event.failed) {
                    chat.setActivityPhase("error", event.error ?? `${displayName || event.toolName} failed`);
                } else {
                    chat.setActivityPhase("thinking", `Processed ${displayName || event.toolName}`);
                }
            }),
        ];
        return () => {
            for (const u of unsubs) u();
        };
    }, [chat]);

    const runAgent = useCallback(async (args: AgentStreamArgs): Promise<void> => {
        chat.currentAssistantIdRef.current = args.assistantId;
        chat.streamedTextRef.current = "";
        chat.setActivityPhase("thinking", "Thinking...");
        const t0 = performance.now();
        let firstEventAt: number | null = null;
        let firstTextAt: number | null = null;

        const stream = sdk.agent.stream(
            {
                agentWallet: args.agentWallet,
                message: args.message,
                threadId: args.threadId,
                userAddress: args.userAddress,
                ...(args.cloudPermissions ? { cloudPermissions: args.cloudPermissions } : {}),
                ...(args.composeRunId ? { composeRunId: args.composeRunId } : {}),
                ...(args.attachment ? { attachment: args.attachment } : {}),
            },
            { ...args.options, signal: args.signal },
        );

        try {
            for await (const event of stream) {
                if (firstEventAt === null) {
                    firstEventAt = performance.now();
                }
                if (firstTextAt === null && event.type === "text-delta") {
                    firstTextAt = performance.now();
                    console.log("[agent-stream-timing]", JSON.stringify({
                        runId: args.composeRunId,
                        firstEventMs: Math.round(firstEventAt - t0),
                        firstTextMs: Math.round(firstTextAt - t0),
                    }));
                }
                dispatchAgentEvent(event, chat, callbacksRef);
                if (event.type === "done") {
                    completeStreamTurn(chat, args.assistantId, callbacksRef);
                }
            }
            const final = await stream.final();
            chat.flushStreamContent(args.assistantId, chat.streamedTextRef.current);
            callbacksRef.current.onFinal?.({
                text: final.text,
                requestId: final.requestId,
            });
            if (!final.text) {
                chat.updateAssistantMessage(args.assistantId, { content: "No response received" });
            }
            clearActivityIfCurrent(chat, args.assistantId);
        } catch (err) {
            handleStreamError(err, chat, args.assistantId, callbacksRef);
        }
    }, [chat]);

    const runWorkflow = useCallback(async (args: WorkflowStreamArgs): Promise<void> => {
        chat.currentAssistantIdRef.current = args.assistantId;
        chat.streamedTextRef.current = "";
        chat.setActivityPhase("thinking", "Thinking...");

        const stream = sdk.workflow.stream(
            {
                workflowWallet: args.workflowWallet,
                message: args.message,
                threadId: args.threadId,
                userAddress: args.userAddress,
                ...(args.composeRunId ? { composeRunId: args.composeRunId } : {}),
                ...(typeof args.continuous === "boolean" ? { continuous: args.continuous } : {}),
                ...(typeof args.lastEventIndex === "number" ? { lastEventIndex: args.lastEventIndex } : {}),
                ...(args.attachment ? { attachment: args.attachment } : {}),
            },
            { ...args.options, signal: args.signal },
        );

        let handledStructuredResult = false;

        try {
            for await (const event of stream) {
                const structured = dispatchWorkflowEvent(event, chat, callbacksRef);
                if (structured) handledStructuredResult = true;
                if (event.type === "done") {
                    completeStreamTurn(chat, args.assistantId, callbacksRef);
                }
            }
            const final = await stream.final();
            chat.flushStreamContent(args.assistantId, chat.streamedTextRef.current);

            if (!handledStructuredResult && final.text) {
                chat.updateAssistantMessage(args.assistantId, { content: final.text });
            }
            if (!final.text && !handledStructuredResult) {
                chat.updateAssistantMessage(args.assistantId, { content: "No response received" });
            }

            callbacksRef.current.onFinal?.({
                text: final.text,
                requestId: final.requestId,
                structuredOutput: final.structuredOutput,
            });
            clearActivityIfCurrent(chat, args.assistantId);
        } catch (err) {
            handleStreamError(err, chat, args.assistantId, callbacksRef);
        }
    }, [chat]);

    const runChat = useCallback(async (args: ChatStreamArgs): Promise<void> => {
        chat.currentAssistantIdRef.current = args.assistantId;
        chat.streamedTextRef.current = "";

        const stream = sdk.inference.chat.completions.stream(args.params, {
            signal: args.signal,
            ...(args.options ?? {}),
        });

        try {
            for await (const chunk of stream) {
                dispatchChatChunk(chunk, chat);
            }
            const final = await stream.final();
            chat.flushStreamContent(args.assistantId, chat.streamedTextRef.current);
            const text = final.chatCompletion.choices[0]?.message.content ?? "";
            if (!text && !final.chatCompletion.choices[0]?.message.tool_calls) {
                chat.updateAssistantMessage(args.assistantId, { content: "No response received" });
            }
            callbacksRef.current.onFinal?.({ text, requestId: final.requestId });
            clearActivityIfCurrent(chat, args.assistantId);
        } catch (err) {
            handleStreamError(err, chat, args.assistantId, callbacksRef);
        }
    }, [chat]);

    const runResponses = useCallback(async (args: ResponsesStreamArgs): Promise<void> => {
        chat.currentAssistantIdRef.current = args.assistantId;
        chat.streamedTextRef.current = "";

        const stream = sdk.inference.responses.stream(args.params, {
            signal: args.signal,
            ...(args.options ?? {}),
        });

        try {
            for await (const event of stream) {
                dispatchResponsesEvent(event, chat);
            }
            const final = await stream.final();
            chat.flushStreamContent(args.assistantId, chat.streamedTextRef.current);
            callbacksRef.current.onFinal?.({
                text: chat.streamedTextRef.current,
                requestId: final.requestId,
            });
            clearActivityIfCurrent(chat, args.assistantId);
        } catch (err) {
            handleStreamError(err, chat, args.assistantId, callbacksRef);
        }
    }, [chat]);

    return { runAgent, runWorkflow, runChat, runResponses };
}

function completeStreamTurn(
    chat: UseChatReturn,
    assistantId: string,
    cbRef: React.MutableRefObject<ComposeStreamCallbacks>,
): void {
    chat.flushStreamContent(assistantId, chat.streamedTextRef.current);
    if (chat.currentAssistantIdRef.current === assistantId) {
        chat.clearActivityState();
    }
    cbRef.current.onDone?.();
}

function clearActivityIfCurrent(chat: UseChatReturn, assistantId: string): void {
    if (chat.currentAssistantIdRef.current === assistantId) {
        chat.clearActivityState();
    }
}

function dispatchAgentEvent(
    event: AgentStreamEvent,
    chat: UseChatReturn,
    cbRef: React.MutableRefObject<ComposeStreamCallbacks>,
): void {
    switch (event.type) {
        case "text-delta": {
            chat.streamedTextRef.current += event.delta;
            chat.scheduleStreamUpdate(chat.streamedTextRef.current);
            chat.setActivityPhase("streaming", "Responding...");
            return;
        }
        case "reasoning-delta": {
            const assistantId = chat.currentAssistantIdRef.current;
            if (assistantId) {
                chat.appendAssistantReasoning(assistantId, event.delta);
            }
            chat.setActivityPhase("thinking", "Thinking...");
            return;
        }
        case "thinking-start":
            chat.setActivityPhase("thinking", event.message);
            {
                const assistantId = chat.currentAssistantIdRef.current;
                if (assistantId) {
                    chat.appendAssistantProgressEvent(assistantId, {
                        id: crypto.randomUUID(),
                        phase: "thinking",
                        message: event.message,
                    });
                }
            }
            return;
        case "thinking-end":
            chat.setActivityPhase("streaming", "Responding...");
            return;
        // tool-start + tool-end are already dispatched via the global
        // sdk.events.toolCallStart/End listener registered in useEffect.
        case "tool-start":
        case "tool-end":
            return;
        case "child": {
            const message = childMessage(event);
            if (message) {
                const assistantId = chat.currentAssistantIdRef.current;
                if (assistantId) {
                    chat.appendAssistantProgressEvent(assistantId, {
                        id: crypto.randomUUID(),
                        phase: "agent",
                        message,
                    });
                }
                chat.setActivityPhase(event.event === "error" ? "error" : "thinking", message);
            }
            return;
        }
        case "trace": {
            const message = traceMessage(event);
            if (message) {
                const assistantId = chat.currentAssistantIdRef.current;
                if (assistantId) {
                    chat.appendAssistantProgressEvent(assistantId, {
                        id: crypto.randomUUID(),
                        phase: "thinking",
                        message,
                    });
                }
                chat.setActivityPhase("thinking", message);
            }
            return;
        }
        case "error": {
            chat.setActivityPhase("error", event.message);
            chat.streamedTextRef.current += event.message;
            chat.scheduleStreamUpdate(chat.streamedTextRef.current);
            cbRef.current.onError?.({ code: event.code, message: event.message });
            return;
        }
        case "done":
            chat.clearActivityState();
            return;
    }
}

type AgentChildEvent = Extract<AgentStreamEvent, { type: "child" }>;

function brief(value: string, max = 160): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function childLabel(event: AgentChildEvent): string {
    if (event.display?.name) return event.display.name;
    if (event.subId) return event.subId;
    if (event.agentWallet && event.agentWallet.length > 12) {
        return `${event.agentWallet.slice(0, 6)}...${event.agentWallet.slice(-4)}`;
    }
    return event.agentWallet || "Child agent";
}

function childMessage(event: AgentChildEvent): string | null {
    const label = childLabel(event);
    if (event.event === "start") return `${label} started`;
    if (event.event === "delta") {
        const delta = brief(event.delta || "");
        return delta ? `${label}: ${delta}` : null;
    }
    if (event.event === "tool-start") return `${label} using ${event.toolName || "tool"}`;
    if (event.event === "tool-end") {
        const status = event.failed ? "failed" : "finished";
        return `${label} ${status} ${event.toolName || "tool"}`;
    }
    if (event.event === "done") return `${label} completed`;
    if (event.event === "error") return `${label} failed${event.error ? `: ${brief(event.error)}` : ""}`;
    return null;
}

type AgentTraceEvent = Extract<AgentStreamEvent, { type: "trace" }>;

function traceMessage(event: AgentTraceEvent): string | null {
    const label = event.display?.summary
        || event.display?.name
        || event.display?.target
        || event.source;
    const stage = event.stage ? ` ${event.stage}` : "";
    const action = event.action ? ` ${event.action}` : "";
    const message = event.message ? `: ${brief(event.message)}` : "";
    return `Trace ${label}${stage}${action}${message}`;
}

function dispatchWorkflowEvent(
    event: WorkflowRuntimeEvent,
    chat: UseChatReturn,
    cbRef: React.MutableRefObject<ComposeStreamCallbacks>,
): boolean {
    switch (event.type) {
        case "start":
        case "step":
        case "agent":
        case "progress": {
            chat.streamedTextRef.current = event.message;
            chat.scheduleStreamUpdate(event.message);
            chat.setActivityPhase("thinking", event.message);
            const assistantId = chat.currentAssistantIdRef.current;
            if (assistantId) {
                chat.appendAssistantProgressEvent(assistantId, {
                    id: crypto.randomUUID(),
                    phase: event.type === "agent" ? "agent" : event.type,
                    message: event.message,
                });
            }
            return false;
        }
        case "tool-start":
        case "tool-end":
            return false;
        case "result": {
            const output = event.output;
            if (output && typeof output === "object" && "type" in output && ("url" in output || "data" in output || "base64" in output)) {
                const assistantId = chat.currentAssistantIdRef.current;
                if (assistantId) {
                    applyOutputItem(chat, assistantId, legacyOutputItem(output as Record<string, unknown>));
                }
                chat.setActivityPhase("streaming", `Generated ${String((output as { type?: unknown }).type ?? "output")}...`);
                return true;
            }
            const text = typeof output === "string" ? output : JSON.stringify(output);
            chat.streamedTextRef.current = text;
            chat.scheduleStreamUpdate(text);
            chat.setActivityPhase("streaming", "Finalizing response...");
            return false;
        }
        case "complete": {
            chat.streamedTextRef.current = event.message;
            chat.scheduleStreamUpdate(event.message);
            chat.setActivityPhase("thinking", event.message);
            const assistantId = chat.currentAssistantIdRef.current;
            if (assistantId) {
                chat.appendAssistantProgressEvent(assistantId, {
                    id: crypto.randomUUID(),
                    phase: "complete",
                    message: event.message,
                });
            }
            return false;
        }
        case "error": {
            chat.streamedTextRef.current = `Error: ${event.message}`;
            chat.scheduleStreamUpdate(chat.streamedTextRef.current);
            chat.setActivityPhase("error", event.message);
            cbRef.current.onError?.({ code: event.code, message: event.message });
            return false;
        }
        case "done":
            chat.clearActivityState();
            return false;
    }
}

function dispatchChatChunk(chunk: ChatCompletionChunk, chat: UseChatReturn): void {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content.length > 0) {
        chat.streamedTextRef.current += delta.content;
        chat.scheduleStreamUpdate(chat.streamedTextRef.current);
        chat.setActivityPhase("streaming", "Responding...");
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        chat.setActivityPhase("thinking", "Thinking...");
        const assistantId = chat.currentAssistantIdRef.current;
        if (assistantId) {
            chat.appendAssistantReasoning(assistantId, delta.reasoning_content);
        }
    }
}

function dispatchResponsesEvent(event: ResponseStreamEvent | Record<string, unknown>, chat: UseChatReturn): void {
    if (event.type === "response.created") {
        return;
    } else if (event.type === "response.output_text.delta" && event.delta) {
        chat.streamedTextRef.current += event.delta;
        chat.scheduleStreamUpdate(chat.streamedTextRef.current);
        chat.setActivityPhase("streaming", "Responding...");
    } else if (event.type === "response.reasoning.delta") {
        chat.setActivityPhase("thinking", "Thinking...");
        const assistantId = chat.currentAssistantIdRef.current;
        if (assistantId) {
            chat.appendAssistantReasoning(assistantId, String(event.delta));
        }
    } else if ((event as { type?: unknown }).type === "response.image_generation_call.partial_image") {
        const imageEvent = event as {
            partial_image_index: number;
            partial_image_b64: string;
        };
        const assistantId = chat.currentAssistantIdRef.current;
        if (assistantId) {
            chat.updateAssistantMessage(assistantId, {
                content: `Refining image… (${imageEvent.partial_image_index + 1})`,
                type: "image",
                imageUrl: `data:image/png;base64,${imageEvent.partial_image_b64}`,
                partialImage: true,
            });
        }
        chat.setActivityPhase("streaming", "Refining image...");
    } else if ((event as { type?: unknown }).type === "response.image_generation_call.completed") {
        const imageEvent = event as {
            revised_prompt?: string;
            mime_type?: string;
            image_b64: string;
        };
        const assistantId = chat.currentAssistantIdRef.current;
        if (assistantId) {
            chat.updateAssistantMessage(assistantId, {
                content: imageEvent.revised_prompt || "Generated image:",
                type: "image",
                imageUrl: `data:${imageEvent.mime_type || "image/png"};base64,${imageEvent.image_b64}`,
                partialImage: false,
            });
        }
        chat.clearActivityState();
    } else if ((event as { type?: unknown }).type === "response.output_item.completed") {
        const outputEvent = event as { item?: ResponseOutputItem };
        const assistantId = chat.currentAssistantIdRef.current;
        if (assistantId && outputEvent.item) {
            applyOutputItem(chat, assistantId, outputEvent.item);
        }
        chat.clearActivityState();
    } else if ((event as { type?: unknown }).type === "response.output_video.status") {
        const videoEvent = event as {
            job_id?: string;
            status?: "queued" | "processing" | "completed" | "failed";
            progress?: number;
            url?: string;
            error?: string;
        };
        const assistantId = chat.currentAssistantIdRef.current;
        if (!assistantId) return;
        if (videoEvent.status === "completed" && videoEvent.url) {
            chat.updateAssistantMessage(assistantId, {
                type: "video",
                content: "Video generated:",
                videoUrl: videoEvent.url,
            });
            chat.clearActivityState();
        } else if (videoEvent.status === "failed") {
            chat.updateAssistantMessage(assistantId, {
                type: "video",
                content: "Video generation failed.",
            });
            chat.setActivityPhase("error", videoEvent.error ?? "Video generation failed");
        } else {
            chat.updateAssistantMessage(assistantId, {
                type: "video",
                content: videoEvent.progress ? `Video ${videoEvent.status ?? "processing"} (${videoEvent.progress}%)` : `Video ${videoEvent.status ?? "processing"}`,
            });
        }
    } else if (event.type === "response.completed") {
        chat.clearActivityState();
    }
}

function legacyOutputItem(output: Record<string, unknown>): ResponseOutputItem {
    const type = String(output.type || "text");
    const url = typeof output.url === "string" ? output.url : undefined;
    const base64 = typeof output.base64 === "string" ? output.base64 : undefined;
    const mimeType = typeof output.mimeType === "string" ? output.mimeType : undefined;
    if (type === "image") {
        return { type: "output_image", image_url: url ?? (base64 ? `data:${mimeType || "image/png"};base64,${base64}` : undefined) };
    }
    if (type === "audio") {
        return { type: "output_audio", audio_url: url ?? (base64 ? `data:${mimeType || "audio/mpeg"};base64,${base64}` : undefined) };
    }
    if (type === "video") {
        return { type: "output_video", video_url: url ?? (base64 ? `data:${mimeType || "video/mp4"};base64,${base64}` : undefined) };
    }
    if (type === "embedding") {
        const embedding = Array.isArray(output.embedding)
            ? output.embedding as number[]
            : Array.isArray(output.embeddings) && Array.isArray(output.embeddings[0])
                ? output.embeddings[0] as number[]
                : undefined;
        return { type: "output_embedding", embedding };
    }
    return { type: "output_text", text: typeof output.content === "string" ? output.content : "" };
}

function applyOutputItem(chat: UseChatReturn, assistantId: string, item: ResponseOutputItem): void {
    if (item.type === "output_image") {
        chat.updateAssistantMessage(assistantId, {
            type: "image",
            content: typeof item.text === "string" ? item.text : "Generated image:",
            imageUrl: typeof item.image_url === "string" ? item.image_url : undefined,
            partialImage: false,
        });
        return;
    }

    if (item.type === "output_audio") {
        chat.updateAssistantMessage(assistantId, {
            type: "audio",
            content: "Generated audio:",
            audioUrl: typeof item.audio_url === "string" ? item.audio_url : undefined,
        });
        return;
    }

    if (item.type === "output_video") {
        chat.updateAssistantMessage(assistantId, {
            type: "video",
            content: item.status && item.status !== "completed" ? `Video ${item.status}` : "Generated video:",
            videoUrl: typeof item.video_url === "string" ? item.video_url : undefined,
        });
        return;
    }

    if (item.type === "output_embedding") {
        const content = Array.isArray(item.embedding) ? JSON.stringify(item.embedding) : "";
        chat.updateAssistantMessage(assistantId, {
            type: "embedding",
            content,
        });
        return;
    }

    if (item.type === "output_text") {
        const text = typeof item.text === "string" ? item.text : "";
        chat.updateAssistantMessage(assistantId, {
            type: "text",
            content: text,
        });
    }
}

function handleStreamError(
    err: unknown,
    chat: UseChatReturn,
    assistantId: string,
    cbRef: React.MutableRefObject<ComposeStreamCallbacks>,
): void {
    if (err instanceof DOMException && err.name === "AbortError") return;
    const message = err instanceof Error ? err.message : String(err);
    chat.setActivityPhase("error", message);
    chat.updateAssistantMessage(assistantId, { content: `Error: ${message}` });
    cbRef.current.onError?.({ message });
}
