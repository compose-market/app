import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
    AttachmentInput,
    ChatCompletionsCreateParams,
    ComposeCallOptions,
    Receipt,
    ResponsesCreateParams,
    SessionBudgetSnapshot,
    SessionInvalidReason,
    StreamEvent,
} from "@compose-market/sdk";

import { sdk } from "@/lib/sdk";
import type { Artifact, Plan, UseChatReturn } from "@/hooks/use-chat";

export interface StreamCallbacks {
    onReceipt?: (receipt: Receipt) => void;
    onBudget?: (snapshot: SessionBudgetSnapshot) => void;
    onSessionInvalid?: (reason: SessionInvalidReason) => void;
    onError?: (err: { code?: string; message: string }) => void;
    onVideoStatus?: (status: { jobId: string; status: "queued" | "processing" | "completed" | "failed"; progress?: number; url?: string; error?: string }) => void;
    onDone?: () => void;
    onFinal?: (final: { text: string; requestId: string | null; structuredOutput?: unknown }) => void;
}

type StreamCallOptions = Pick<
    ComposeCallOptions,
    "x402MaxAmountWei" | "idempotencyKey" | "composeRunId" | "composeKey" | "userAddress" | "chainId" | "timeoutMs"
>;

export interface AgentStreamArgs {
    agentWallet: string;
    message: string;
    threadId: string;
    userAddress: string;
    cloudPermissions?: string[];
    composeRunId?: string;
    attachment?: AttachmentInput;
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
    attachment?: AttachmentInput;
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

export interface UseStream {
    runAgent: (args: AgentStreamArgs) => Promise<void>;
    runWorkflow: (args: WorkflowStreamArgs) => Promise<void>;
    runChat: (args: ChatStreamArgs) => Promise<void>;
    runResponses: (args: ResponsesStreamArgs) => Promise<void>;
}

export function useStream(
    chat: UseChatReturn,
    callbacks: StreamCallbacks = {},
): UseStream {
    const chatRef = useRef(chat);
    chatRef.current = chat;
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    useEffect(() => {
        const unsubs: Array<() => void> = [
            sdk.events.on("receipt", (event) => callbacksRef.current.onReceipt?.(event.receipt)),
            sdk.events.on("budget", (event) => callbacksRef.current.onBudget?.(event.snapshot)),
            sdk.events.on("sessionInvalid", (event) => callbacksRef.current.onSessionInvalid?.(event.reason)),
        ];
        return () => {
            for (const unsub of unsubs) unsub();
        };
    }, []);

    const runAgent = useCallback(async (args: AgentStreamArgs): Promise<void> => {
        const c = chatRef.current;
        c.currentAssistantIdRef.current = args.assistantId;
        c.streamedTextRef.current = "";
        c.setActivityPhase("thinking", "Starting agent");

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
                dispatch(event, chatRef.current, callbacksRef);
                if (event.kind === "run" && event.status === "completed") {
                    complete(chatRef.current, args.assistantId, callbacksRef);
                }
            }
            const final = await stream.final();
            finish(chatRef.current, args.assistantId, final.text, final.requestId, callbacksRef);
        } catch (err) {
            fail(err, chatRef.current, args.assistantId, callbacksRef);
        }
    }, []);

    const runWorkflow = useCallback(async (args: WorkflowStreamArgs): Promise<void> => {
        const c = chatRef.current;
        c.currentAssistantIdRef.current = args.assistantId;
        c.streamedTextRef.current = "";
        c.setActivityPhase("thinking", "Starting workflow");

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

        try {
            for await (const event of stream) {
                dispatch(event, chatRef.current, callbacksRef);
                if (event.kind === "run" && event.status === "completed") {
                    complete(chatRef.current, args.assistantId, callbacksRef);
                }
            }
            const final = await stream.final();
            finish(chatRef.current, args.assistantId, final.text, final.requestId, callbacksRef, final.structuredOutput);
        } catch (err) {
            fail(err, chatRef.current, args.assistantId, callbacksRef);
        }
    }, []);

    const runChat = useCallback(async (args: ChatStreamArgs): Promise<void> => {
        const c = chatRef.current;
        c.currentAssistantIdRef.current = args.assistantId;
        c.streamedTextRef.current = "";

        const stream = sdk.inference.chat.completions.stream(args.params, {
            signal: args.signal,
            ...(args.options ?? {}),
        });

        try {
            for await (const event of stream) {
                dispatch(event as StreamEvent, chatRef.current, callbacksRef);
            }
            const final = await stream.final();
            const text = final.chatCompletion.choices[0]?.message.content ?? chatRef.current.streamedTextRef.current;
            finish(chatRef.current, args.assistantId, text, final.requestId, callbacksRef);
        } catch (err) {
            fail(err, chatRef.current, args.assistantId, callbacksRef);
        }
    }, []);

    const runResponses = useCallback(async (args: ResponsesStreamArgs): Promise<void> => {
        const c = chatRef.current;
        c.currentAssistantIdRef.current = args.assistantId;
        c.streamedTextRef.current = "";

        const stream = sdk.inference.responses.stream(args.params, {
            signal: args.signal,
            ...(args.options ?? {}),
        });

        try {
            for await (const event of stream) {
                dispatch(event as StreamEvent, chatRef.current, callbacksRef);
            }
            const final = await stream.final();
            finish(chatRef.current, args.assistantId, chatRef.current.streamedTextRef.current, final.requestId, callbacksRef);
        } catch (err) {
            fail(err, chatRef.current, args.assistantId, callbacksRef);
        }
    }, []);

    return useMemo(() => ({ runAgent, runWorkflow, runChat, runResponses }), [runAgent, runWorkflow, runChat, runResponses]);
}

function dispatch(
    event: StreamEvent,
    chat: UseChatReturn,
    cbRef: React.MutableRefObject<StreamCallbacks>,
): void {
    const assistantId = chat.currentAssistantIdRef.current;
    if (!assistantId) return;

    chat.applyAssistantStreamEvent(assistantId, event);
    const direct = isDirectModelEvent(event);

    if (event.kind === "text" && event.delta) {
        chat.streamedTextRef.current += event.delta;
        chat.scheduleStreamUpdate(chat.streamedTextRef.current);
        if (!direct) {
            chat.setActivityPhase("streaming", "Responding");
        }
        return;
    }

    if (event.kind === "reasoning") {
        if (!direct) {
            chat.setActivityPhase("thinking", event.display?.summary || event.display?.title || "Reasoning");
        }
        return;
    }

    if (event.kind === "approval") {
        const plan = planFromEvent(event);
        chat.updateAssistantMessage(assistantId, {
            proposal: plan,
            content: chat.streamedTextRef.current,
        });
        chat.setActivityPhase("thinking", plan.decision ? `Plan ${plan.decision}` : "Awaiting plan decision");
        return;
    }

    if (event.kind === "artifact") {
        const item = artifactFromEvent(event);
        chat.upsertAssistantArtifact(assistantId, item);
        if (!item.url && item.responseId && (item.inline || (item.artifactType === "embedding" && !item.embedding))) {
            chat.upsertAssistantArtifact(assistantId, { ...item, hydrating: true });
            void hydrateArtifact(chat, assistantId, item);
        }
        const video = event.payload;
        if (item.artifactType === "video" && typeof video?.jobId === "string" && typeof video?.status === "string") {
            cbRef.current.onVideoStatus?.({
                jobId: video.jobId,
                status: video.status as "queued" | "processing" | "completed" | "failed",
                progress: typeof video.progress === "number" ? video.progress : undefined,
                url: typeof video.url === "string" ? video.url : undefined,
                error: typeof video.error === "string" ? video.error : undefined,
            });
        }
        if (!direct) {
            chat.setActivityPhase("streaming", `Generated ${item.artifactType}`);
        }
        return;
    }

    if (event.kind === "error") {
        const message = event.display?.summary || "Stream error";
        chat.setActivityPhase("error", message);
        cbRef.current.onError?.({ message });
        return;
    }

    if (event.kind === "receipt" || event.kind === "payment") return;
    if (event.kind === "debug") return;
    if (direct) return;

    const title = event.display?.title || event.kind;
    const summary = event.display?.summary || title;
    if (event.status === "failed") {
        chat.setActivityPhase("error", summary);
    } else if (event.status === "completed") {
        chat.setActivityPhase("thinking", `${title} completed`);
    } else {
        chat.setActivityPhase(event.kind === "tool" || event.kind === "model" || event.kind === "connector" ? "tool" : "thinking", summary);
    }
}

function complete(
    chat: UseChatReturn,
    assistantId: string,
    cbRef: React.MutableRefObject<StreamCallbacks>,
): void {
    chat.flushStreamContent(assistantId, chat.streamedTextRef.current);
    if (chat.currentAssistantIdRef.current === assistantId) {
        chat.clearActivityState();
    }
    cbRef.current.onDone?.();
}

function finish(
    chat: UseChatReturn,
    assistantId: string,
    text: string,
    requestId: string | null,
    cbRef: React.MutableRefObject<StreamCallbacks>,
    structuredOutput?: unknown,
): void {
    const finalText = text || chat.streamedTextRef.current;
    chat.flushStreamContent(assistantId, finalText);
    callbacks(cbRef).onFinal?.({ text: finalText, requestId, structuredOutput });
    if (chat.currentAssistantIdRef.current === assistantId) {
        chat.clearActivityState();
    }
}

function callbacks(ref: React.MutableRefObject<StreamCallbacks>): StreamCallbacks {
    return ref.current;
}

function fail(
    err: unknown,
    chat: UseChatReturn,
    assistantId: string,
    cbRef: React.MutableRefObject<StreamCallbacks>,
): void {
    if (err instanceof DOMException && err.name === "AbortError") return;
    const message = err instanceof Error ? err.message : String(err);
    chat.setActivityPhase("error", message);
    chat.failAssistant(assistantId, message);
    cbRef.current.onError?.({ message });
}

function planFromEvent(event: StreamEvent): Plan {
    const payload = event.payload ?? {};
    return {
        type: event.raw && typeof event.raw === "object" && "type" in event.raw && event.raw.type === "harness_plan_decided"
            ? "harness_plan_decided"
            : "harness_plan_proposed",
        proposalId: str(payload.proposalId) ?? event.id,
        version: num(payload.version) ?? 1,
        state: str(payload.state) ?? event.status ?? "pending",
        decision: decision(payload.decision),
        rootComposeRunId: event.rootId,
        composeRunId: event.runId,
        proposal: payload.proposal,
        markdown: str(payload.markdown),
        approver: str(payload.approver),
        reason: str(payload.reason),
        feedback: str(payload.feedback),
        ts: event.ts,
        updatedAt: event.ts,
    };
}

function decision(value: unknown): Plan["decision"] | undefined {
    return value === "approved" || value === "rejected" || value === "changes_requested" ? value : undefined;
}

function artifactFromEvent(event: StreamEvent): Artifact {
    const payload = event.payload ?? {};
    const kind = artifactKind(payload.artifactType ?? payload.type);
    const mimeType = str(payload.mimeType) ?? str(payload.mime_type);
    const base64 = str(payload.base64) ?? str(payload.data);
    const url = str(payload.url)
        ?? (base64 ? `data:${mimeType || defaultMime(kind)};base64,${base64}` : undefined);
    return {
        id: event.id,
        artifactType: kind,
        url,
        inline: payload.inline === true,
        partial: payload.partial === true,
        embedding: embedding(payload.embedding ?? payload.embeddings),
        mimeType,
        bytes: num(payload.bytes),
        responseId: str(payload.responseId) ?? str(payload.response_id),
        outputIndex: num(payload.outputIndex) ?? num(payload.output_index),
        status: event.status,
        progress: num(payload.progress),
        jobId: str(payload.jobId) ?? str(payload.job_id),
        sourceTool: str(payload.sourceTool),
        source: payload.source === "child" ? "child" : "agent",
        runKey: str(payload.runKey),
        raw: payload,
    };
}

function isDirectModelEvent(event: StreamEvent): boolean {
    return event.source === "inference" || event.source === "responses" || event.source === "chat";
}

function artifactKind(value: unknown): Artifact["artifactType"] {
    const raw = typeof value === "string" ? value.toLowerCase() : "";
    if (raw === "image" || raw === "output_image") return "image";
    if (raw === "audio" || raw === "output_audio") return "audio";
    if (raw === "video" || raw === "output_video") return "video";
    if (raw === "embedding" || raw === "output_embedding") return "embedding";
    if (raw === "realtime" || raw === "output_realtime" || raw === "realtime_session") return "realtime";
    if (raw === "file") return "file";
    return "artifact";
}

function defaultMime(kind: Artifact["artifactType"]): string {
    if (kind === "image") return "image/png";
    if (kind === "audio") return "audio/mpeg";
    if (kind === "video") return "video/mp4";
    return "application/octet-stream";
}

async function hydrateArtifact(chat: UseChatReturn, assistantId: string, item: Artifact): Promise<void> {
    if (!item.responseId) return;
    try {
        const response = await sdk.inference.responses.get(item.responseId);
        const output = Array.isArray(response.output) ? response.output : [];
        for (const raw of output) {
            const view = hydrateOutputItem(raw, item.artifactType, item.mimeType);
            if (!view) continue;
            const url = outputItemUrl(view);
            chat.upsertAssistantArtifact(assistantId, {
                ...item,
                ...(url ? { url } : {}),
                ...(view.embedding ? { embedding: view.embedding } : {}),
                raw: { ...(item.raw ?? {}), hydrated: view },
                hydrating: false,
            });
            return;
        }
        chat.upsertAssistantArtifact(assistantId, { ...item, hydrating: false });
    } catch (error) {
        chat.upsertAssistantArtifact(assistantId, {
            ...item,
            hydrating: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

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

function hydrateOutputItem(
    raw: Record<string, unknown>,
    kind: Artifact["artifactType"],
    fallbackMime?: string,
): ResponseOutputItem | null {
    const type = typeof raw.type === "string" ? raw.type : "";
    const normalized = type === "output_image"
        ? "image"
        : type === "output_audio"
            ? "audio"
            : type === "output_video"
                ? "video"
                : type === "output_embedding"
                    ? "embedding"
                    : "";
    if (normalized && normalized !== kind) return null;
    if (kind === "image") {
        const url = mediaUrl(raw, "image", mediaMime(raw, fallbackMime, "image/png"));
        return url ? { type: "output_image", image_url: url, text: typeof raw.text === "string" ? raw.text : undefined } : null;
    }
    if (kind === "audio") {
        const url = mediaUrl(raw, "audio", mediaMime(raw, fallbackMime, "audio/mpeg"));
        return url ? { type: "output_audio", audio_url: url } : null;
    }
    if (kind === "video") {
        const url = mediaUrl(raw, "video", mediaMime(raw, fallbackMime, "video/mp4"));
        return url ? { type: "output_video", video_url: url, status: typeof raw.status === "string" ? raw.status : undefined } : null;
    }
    if (kind === "embedding") {
        const embedding = Array.isArray(raw.embedding) ? raw.embedding as number[] : undefined;
        return embedding ? { type: "output_embedding", embedding } : null;
    }
    return null;
}

function mediaMime(raw: Record<string, unknown>, fallback: string | undefined, defaultValue: string): string {
    return fallback ?? (typeof raw.mime_type === "string" ? raw.mime_type : defaultValue);
}

function mediaUrl(raw: Record<string, unknown>, kind: "image" | "audio" | "video", mimeType: string): string | undefined {
    const key = kind === "image" ? "image_url" : kind === "audio" ? "audio_url" : "video_url";
    const value = raw[key] ?? raw.url;
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
        return (value as { url: string }).url;
    }
    const data = typeof raw.data === "string" ? raw.data : typeof raw.base64 === "string" ? raw.base64 : undefined;
    return data ? `data:${mimeType};base64,${data}` : undefined;
}

function outputItemUrl(item: ResponseOutputItem): string | undefined {
    if (typeof item.image_url === "string") return item.image_url;
    if (typeof item.audio_url === "string") return item.audio_url;
    if (typeof item.video_url === "string") return item.video_url;
    for (const key of ["image_url", "audio_url", "video_url", "url"] as const) {
        const value = item[key];
        if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
            return (value as { url: string }).url;
        }
    }
    return undefined;
}

function str(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function embedding(value: unknown): Artifact["embedding"] | undefined {
    if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
        return value as number[];
    }
    if (Array.isArray(value) && value.every((item) => Array.isArray(item) && item.every((entry) => typeof entry === "number" && Number.isFinite(entry)))) {
        return value as number[][];
    }
    return undefined;
}
