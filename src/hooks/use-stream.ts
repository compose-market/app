import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
    AttachmentInput,
    ChatCompletionsCreateParams,
    CallOptions,
    Receipt,
    ResponsesCreateParams,
    ActivityEvent,
    ModelEvent,
    RunEvent,
    SessionBudgetSnapshot,
    SessionInvalidReason,
    PlanProposalEvent,
    AgentStreamControls,
} from "@compose-market/sdk";
import { parseToolEvent } from "@compose-market/sdk";

import { sdk } from "@/lib/sdk";
import { noticeId, type Artifact, type Plan, type UseChatReturn } from "@/hooks/use-chat";
import { getModelTypeValues, type CatalogModel } from "@/lib/models";

export interface StreamCallbacks {
    onResponseId?: (responseId: string) => void;
    onReceipt?: (receipt: Receipt) => void;
    onBudget?: (snapshot: SessionBudgetSnapshot) => void;
    onSessionInvalid?: (reason: SessionInvalidReason) => void;
    onError?: (err: { code?: string; message: string }) => void;
    onVideoStatus?: (status: { jobId: string; status: "queued" | "processing" | "completed" | "failed"; progress?: number; url?: string; error?: string }) => void;
    onDone?: () => void;
    onFinal?: (final: { text: string; requestId: string | null; structuredOutput?: unknown }) => void;
    onPlanEvent?: (event: PlanProposalEvent) => void;
}

export type StreamCallOptions = Pick<
    CallOptions,
    "x402MaxAmountWei" | "idempotencyKey" | "runId" | "key" | "userAddress" | "chainId" | "timeoutMs"
>;

export interface AgentStreamArgs extends AgentStreamControls {
    agentWallet: string;
    message: string;
    threadId: string;
    userAddress: string;
    agentCard?: unknown;
    cloudPermissions?: string[];
    runId?: string;
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
    runId?: string;
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

export interface ResponsesAppendArgs {
    responseId: string;
    input: unknown;
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    options?: StreamCallOptions;
}

export interface UseStream {
    runAgent: (args: AgentStreamArgs) => Promise<void>;
    runWorkflow: (args: WorkflowStreamArgs) => Promise<void>;
    runChat: (args: ChatStreamArgs) => Promise<void>;
    runResponses: (args: ResponsesStreamArgs) => Promise<void>;
    appendResponses: (args: ResponsesAppendArgs) => Promise<void>;
}

interface LiveResponse {
    model: string;
    responseId: string;
    assistantId: string;
    options?: StreamCallOptions;
    controller: AbortController;
    cleanup: () => void;
}

interface OpeningResponse {
    promise: Promise<LiveResponse>;
    controller: AbortController;
    cleanup: () => void;
}

const realtime = new Map<string, boolean>();

function modelId(params: ResponsesCreateParams): string | null {
    const value = (params as { model?: unknown }).model;
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function isRealtimeModel(model: string): Promise<boolean> {
    const cached = realtime.get(model);
    if (cached !== undefined) return cached;
    try {
        const card = await sdk.models.get(model) as CatalogModel;
        const active = getModelTypeValues(card).includes("realtime");
        realtime.set(model, active);
        return active;
    } catch {
        realtime.set(model, false);
        return false;
    }
}

function paramsWithoutInput(params: ResponsesCreateParams): Record<string, unknown> {
    const body = { ...(params as Record<string, unknown>) };
    delete body.model;
    delete body.input;
    delete body.stream;
    delete body.attachments;
    return body;
}

function latestInput(input: unknown): unknown {
    if (!Array.isArray(input)) return input;
    for (let index = input.length - 1; index >= 0; index -= 1) {
        const item = input[index];
        if (item && typeof item === "object" && !Array.isArray(item) && (item as { role?: unknown }).role === "user") {
            return [item];
        }
    }
    return input.slice(-1);
}

function abort(controller: AbortController): void {
    if (!controller.signal.aborted) controller.abort();
}

function linked(signal: AbortSignal | undefined, controller: AbortController): () => void {
    if (!signal) return () => undefined;
    if (signal.aborted) {
        abort(controller);
        return () => undefined;
    }
    const onabort = () => abort(controller);
    signal.addEventListener("abort", onabort, { once: true });
    return () => signal.removeEventListener("abort", onabort);
}

function removePlaceholder(chat: UseChatReturn, assistantId: string): void {
    chat.setMessages((prev) => prev.filter((message) => {
        if (message.id !== assistantId) return true;
        return Boolean(
            message.content
            || message.blocks?.length
            || message.artifacts?.length
            || message.activity
            || message.imageUrl
            || message.audioUrl
            || message.videoUrl
        );
    }));
}

export function useStream(
    chat: UseChatReturn,
    callbacks: StreamCallbacks = {},
): UseStream {
    const chatRef = useRef(chat);
    chatRef.current = chat;
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;
    const textBlockRef = useRef<string | null>(null);
    const blockSeqRef = useRef(0);
    const liveRef = useRef<Map<string, LiveResponse>>(new Map());
    const openingRef = useRef<Map<string, OpeningResponse>>(new Map());

    const closeRealtime = useCallback((cancel: boolean): void => {
        const live = Array.from(liveRef.current.values());
        const opening = Array.from(openingRef.current.values());
        liveRef.current.clear();
        openingRef.current.clear();

        for (const item of opening) {
            item.cleanup();
            abort(item.controller);
        }

        for (const item of live) {
            item.cleanup();
            abort(item.controller);
            if (cancel) {
                void sdk.inference.responses.cancel(item.responseId, item.options).catch(() => undefined);
            }
        }

        if (live.length > 0 || opening.length > 0) {
            chatRef.current.setRealtimeSession(null);
        }
    }, []);

    useEffect(() => {
        const unsubs: Array<() => void> = [
            sdk.events.on("receipt", (event) => callbacksRef.current.onReceipt?.(event.receipt)),
            sdk.events.on("budget", (event) => callbacksRef.current.onBudget?.(event.snapshot)),
            sdk.events.on("sessionInvalid", (event) => callbacksRef.current.onSessionInvalid?.(event.reason)),
            sdk.events.on("planProposed", (event) => {
                callbacksRef.current.onPlanEvent?.(event);
            }),
            sdk.events.on("approvalRequested", (event) => {
                callbacksRef.current.onPlanEvent?.(event);
            }),
            sdk.events.on("approvalDecided", (event) => {
                callbacksRef.current.onPlanEvent?.(event);
            }),
            sdk.events.on("planFeedbackRequested", (event) => {
                callbacksRef.current.onPlanEvent?.(event);
            }),
            sdk.events.on("toolCallStart", (event) => {
                if (event.source === "agent" || event.source === "workflow") {
                    chatRef.current.startToolActivity(event.toolName, event.summary, event.displayName);
                }
            }),
            sdk.events.on("toolCallEnd", (event) => {
                if (event.source === "agent" || event.source === "workflow") {
                    chatRef.current.finishToolActivity(event.toolName, event.summary, event.failed, event.displayName);
                }
            }),
            sdk.events.on("agentArtifact", (event) => {
                const assistantId = chatRef.current.currentAssistantIdRef.current;
                if (!assistantId) return;
                chatRef.current.upsertAssistantArtifact(assistantId, {
                    id: `${event.responseId ?? event.runKey ?? "artifact"}:${Date.now()}`,
                    artifactType: event.artifactType,
                    url: event.url,
                    inline: event.inline,
                    mimeType: event.mimeType,
                    bytes: event.bytes,
                    responseId: event.responseId,
                    status: event.status,
                    jobId: event.jobId,
                    sourceTool: event.sourceTool,
                    source: event.source,
                    runKey: event.runKey,
                } as any);
            }),
        ];
        return () => {
            for (const unsub of unsubs) unsub();
        };
    }, []);

    useEffect(() => {
        const unload = () => closeRealtime(true);
        window.addEventListener("beforeunload", unload);
        return () => {
            window.removeEventListener("beforeunload", unload);
            closeRealtime(true);
        };
    }, [closeRealtime]);

    const runAgent = useCallback(async (args: AgentStreamArgs): Promise<void> => {
        const c = chatRef.current;
        c.currentAssistantIdRef.current = args.assistantId;
        c.streamedTextRef.current = "";
        textBlockRef.current = null;
        c.setActivityPhase("thinking", "Starting agent");

        const stream = sdk.agent.stream(
            {
                agentWallet: args.agentWallet,
                message: args.message,
                threadId: args.threadId,
                userAddress: args.userAddress,
                ...(args.agentCard ? { agentCard: args.agentCard } : {}),
                ...(args.cloudPermissions ? { cloudPermissions: args.cloudPermissions } : {}),
                ...(args.runId ? { runId: args.runId } : {}),
                ...(args.attachment ? { attachment: args.attachment } : {}),
                ...(args.mode ? { mode: args.mode } : {}),
                ...(args.scope ? { scope: args.scope } : {}),
                ...(args.action ? { action: args.action } : {}),
                ...(args.plan !== undefined ? { plan: args.plan } : {}),
                ...(args.sandbox !== undefined ? { sandbox: args.sandbox } : {}),
                ...(args.proof !== undefined ? { proof: args.proof } : {}),
                ...(args.constraints ? { constraints: args.constraints } : {}),
            },
            { ...args.options, signal: args.signal },
        );

        try {
            for await (const event of stream) {
                route(event, chatRef.current, callbacksRef, textBlockRef, blockSeqRef);
                if (event.domain === "activity" && event.type === "activity.run" && event.status === "completed") {
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
        textBlockRef.current = null;
        c.setActivityPhase("thinking", "Starting workflow");

        const stream = sdk.workflow.stream(
            {
                workflowWallet: args.workflowWallet,
                message: args.message,
                threadId: args.threadId,
                userAddress: args.userAddress,
                ...(args.runId ? { runId: args.runId } : {}),
                ...(typeof args.continuous === "boolean" ? { continuous: args.continuous } : {}),
                ...(typeof args.lastEventIndex === "number" ? { lastEventIndex: args.lastEventIndex } : {}),
                ...(args.attachment ? { attachment: args.attachment } : {}),
            },
            { ...args.options, signal: args.signal },
        );

        try {
            for await (const event of stream) {
                route(event, chatRef.current, callbacksRef, textBlockRef, blockSeqRef);
                if (event.domain === "activity" && event.type === "activity.run" && event.status === "completed") {
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
        textBlockRef.current = null;

        const stream = sdk.inference.chat.completions.stream(args.params, {
            signal: args.signal,
            ...(args.options ?? {}),
        });

        try {
            for await (const event of stream) {
                dispatchModel(event, chatRef.current, callbacksRef, textBlockRef, blockSeqRef);
            }
            const final = await stream.final();
            const text = final.chatCompletion.choices[0]?.message.content ?? chatRef.current.streamedTextRef.current;
            finish(chatRef.current, args.assistantId, text, final.requestId, callbacksRef);
        } catch (err) {
            fail(err, chatRef.current, args.assistantId, callbacksRef);
        }
    }, []);

    const append = useCallback(async (args: ResponsesStreamArgs, active: LiveResponse): Promise<void> => {
        const input = latestInput((args.params as { input?: unknown }).input);
        await sdk.inference.responses.append(active.responseId, {
            input,
            params: paramsWithoutInput(args.params),
        }, {
            signal: args.signal,
            ...(args.options ?? active.options ?? {}),
        });
    }, []);

    const runRealtimeResponses = useCallback(async (args: ResponsesStreamArgs, model: string): Promise<void> => {
        let responseId: string | null = null;
        let ready = false;
        const controller = new AbortController();
        const cleanup = linked(args.signal, controller);
        const settle: {
            resolve?: (response: LiveResponse) => void;
            reject?: (reason: unknown) => void;
        } = {};
        const started = new Promise<LiveResponse>((resolve, reject) => {
            settle.resolve = resolve;
            settle.reject = reject;
        });
        const opening: OpeningResponse = { promise: started, controller, cleanup };
        openingRef.current.set(model, opening);

        const stream = sdk.inference.responses.stream(args.params, {
            signal: controller.signal,
            ...(args.options ?? {}),
        });

        void (async () => {
            try {
                for await (const event of stream) {
                    if (event.responseId && !responseId) {
                        const id = event.responseId;
                        responseId = id;
                        const active: LiveResponse = {
                            model,
                            responseId: id,
                            assistantId: args.assistantId,
                            options: args.options,
                            controller,
                            cleanup,
                        };
                        liveRef.current.set(model, active);
                        if (openingRef.current.get(model) === opening) {
                            openingRef.current.delete(model);
                        }
                        chatRef.current.setRealtimeSession({
                            append: async (input, params) => {
                                await sdk.inference.responses.append(id, { input, ...(params ? { params } : {}) }, args.options);
                            },
                            close: async () => {
                                liveRef.current.delete(model);
                                cleanup();
                                abort(controller);
                                chatRef.current.setRealtimeSession(null);
                                await sdk.inference.responses.cancel(id, args.options);
                            },
                        });
                        if (!ready) {
                            ready = true;
                            settle.resolve?.(active);
                        }
                    }
                    dispatchModel(event, chatRef.current, callbacksRef, textBlockRef, blockSeqRef);
                }
                const final = await stream.final();
                if (!ready) {
                    ready = true;
                    if (openingRef.current.get(model) === opening) {
                        openingRef.current.delete(model);
                    }
                    cleanup();
                    settle.reject?.(new Error("Realtime stream did not return a response id"));
                    return;
                }
                liveRef.current.delete(model);
                cleanup();
                chatRef.current.setRealtimeSession(null);
                finish(chatRef.current, args.assistantId, chatRef.current.streamedTextRef.current, final.requestId, callbacksRef);
            } catch (err) {
                if (openingRef.current.get(model) === opening) {
                    openingRef.current.delete(model);
                }
                liveRef.current.delete(model);
                cleanup();
                chatRef.current.setRealtimeSession(null);
                if (!ready) {
                    ready = true;
                    settle.reject?.(err);
                    return;
                }
                fail(err, chatRef.current, args.assistantId, callbacksRef);
            }
        })();

        await started;
    }, []);

    const runResponses = useCallback(async (args: ResponsesStreamArgs): Promise<void> => {
        const model = modelId(args.params);
        const active = model ? liveRef.current.get(model) : undefined;
        if (model && active) {
            const c = chatRef.current;
            removePlaceholder(c, args.assistantId);
            c.currentAssistantIdRef.current = active.assistantId;
            await append(args, active);
            return;
        }
        const opening = model ? openingRef.current.get(model) : undefined;
        if (model && opening) {
            const opened = await opening.promise;
            const c = chatRef.current;
            removePlaceholder(c, args.assistantId);
            c.currentAssistantIdRef.current = opened.assistantId;
            await append(args, opened);
            return;
        }

        if (model && await isRealtimeModel(model)) {
            const opened = liveRef.current.get(model);
            if (opened) {
                const c = chatRef.current;
                removePlaceholder(c, args.assistantId);
                c.currentAssistantIdRef.current = opened.assistantId;
                await append(args, opened);
                return;
            }
            const pending = openingRef.current.get(model);
            if (pending) {
                const ready = await pending.promise;
                const c = chatRef.current;
                removePlaceholder(c, args.assistantId);
                c.currentAssistantIdRef.current = ready.assistantId;
                await append(args, ready);
                return;
            }

            const c = chatRef.current;
            c.currentAssistantIdRef.current = args.assistantId;
            c.streamedTextRef.current = "";
            textBlockRef.current = null;
            await runRealtimeResponses(args, model);
            return;
        }

        const c = chatRef.current;
        c.currentAssistantIdRef.current = args.assistantId;
        c.streamedTextRef.current = "";
        textBlockRef.current = null;

        const stream = sdk.inference.responses.stream(args.params, {
            signal: args.signal,
            ...(args.options ?? {}),
        });

        try {
            for await (const event of stream) {
                if (event.responseId) {
                    callbacksRef.current.onResponseId?.(event.responseId);
                }
                dispatchModel(event, chatRef.current, callbacksRef, textBlockRef, blockSeqRef);
            }
            const final = await stream.final();
            finish(chatRef.current, args.assistantId, chatRef.current.streamedTextRef.current, final.requestId, callbacksRef);
        } catch (err) {
            fail(err, chatRef.current, args.assistantId, callbacksRef);
        }
    }, [append, runRealtimeResponses]);

    const appendResponses = useCallback(async (args: ResponsesAppendArgs): Promise<void> => {
        await sdk.inference.responses.append(args.responseId, {
            input: args.input,
            ...(args.params ? { params: args.params } : {}),
        }, {
            signal: args.signal,
            ...(args.options ?? {}),
        });
    }, []);

    return useMemo(() => ({ runAgent, runWorkflow, runChat, runResponses, appendResponses }), [runAgent, runWorkflow, runChat, runResponses, appendResponses]);
}

function route(
    event: RunEvent,
    chat: UseChatReturn,
    cbRef: React.MutableRefObject<StreamCallbacks>,
    textBlockRef: React.MutableRefObject<string | null>,
    blockSeqRef: React.MutableRefObject<number>,
): void {
    if (event.domain === "model") {
        dispatchModel(event, chat, cbRef, textBlockRef, blockSeqRef);
    } else {
        dispatchActivity(event, chat, cbRef, textBlockRef, blockSeqRef);
    }
}

function dispatchModel(
    event: ModelEvent,
    chat: UseChatReturn,
    cbRef: React.MutableRefObject<StreamCallbacks>,
    textBlockRef: React.MutableRefObject<string | null>,
    blockSeqRef: React.MutableRefObject<number>,
): void {
    const assistantId = chat.currentAssistantIdRef.current;
    if (!assistantId) return;

    chat.applyAssistantModelEvent(assistantId, event);

    if (event.type === "model.text.delta" && event.delta) {
        const blockId = textBlockRef.current ?? nextBlock("text", blockSeqRef);
        textBlockRef.current = blockId;
        chat.appendAssistantBlockText(assistantId, blockId, "text", event.delta);
        chat.streamedTextRef.current += event.delta;
        chat.scheduleStreamUpdate(chat.streamedTextRef.current);
        chat.setActivityPhase("streaming", "Responding");
        return;
    }

    if (event.type === "model.text.done" && event.text) {
        const current = chat.streamedTextRef.current;
        const append = event.text.startsWith(current) ? event.text.slice(current.length) : current.includes(event.text) ? "" : event.text;
        if (append) {
            const blockId = textBlockRef.current ?? nextBlock("text", blockSeqRef);
            textBlockRef.current = blockId;
            chat.appendAssistantBlockText(assistantId, blockId, "text", append);
            chat.streamedTextRef.current += append;
            chat.scheduleStreamUpdate(chat.streamedTextRef.current);
        }
        return;
    }

    if (event.type === "model.reasoning.delta" && event.delta) {
        const blockId = `reasoning:${event.responseId ?? "main"}`;
        chat.appendAssistantBlockText(assistantId, blockId, "reasoning", event.delta);
        chat.setActivityPhase("thinking", "Reasoning");
        return;
    }

    if (event.type === "model.asset") {
        textBlockRef.current = null;
        const item = artifactFromModelEvent(event);
        chat.upsertAssistantArtifact(assistantId, item);
        if (item.partial !== true && !item.url && item.responseId && (item.inline || (item.artifactType === "embedding" && !item.embedding))) {
            chat.upsertAssistantArtifact(assistantId, { ...item, hydrating: true });
            void hydrateArtifact(chat, assistantId, item);
        }
        if (item.artifactType === "video" && item.jobId && item.status) {
            cbRef.current.onVideoStatus?.({
                jobId: item.jobId,
                status: item.status as "queued" | "processing" | "completed" | "failed",
                progress: item.progress,
                url: item.url,
                error: item.error,
            });
        }
        chat.setActivityPhase("streaming", `Generated ${item.artifactType}`);
        return;
    }

    if (event.type === "model.error") {
        textBlockRef.current = null;
        const message = event.error?.message || "Model stream error";
        chat.upsertAssistantBlock(assistantId, { id: noticeId("error", message), type: "notice", tone: "error", text: message });
        chat.setActivityPhase("error", message);
        cbRef.current.onError?.({ message });
        return;
    }
}

function dispatchActivity(
    event: ActivityEvent,
    chat: UseChatReturn,
    cbRef: React.MutableRefObject<StreamCallbacks>,
    textBlockRef: React.MutableRefObject<string | null>,
    blockSeqRef: React.MutableRefObject<number>,
): void {
    const assistantId = chat.currentAssistantIdRef.current;
    if (!assistantId) return;

    chat.applyAssistantActivityEvent(assistantId, event);

    if (event.type === "activity.message" && event.delta && !event.parentId) {
        const blockId = textBlockRef.current ?? nextBlock("text", blockSeqRef);
        textBlockRef.current = blockId;
        chat.appendAssistantBlockText(assistantId, blockId, "text", event.delta);
        chat.streamedTextRef.current += event.delta;
        chat.scheduleStreamUpdate(chat.streamedTextRef.current);
        return;
    }

    if (event.type !== "activity.trace") textBlockRef.current = null;

    if (event.type === "activity.plan") {
        const plan = planFromActivityEvent(event);
        chat.updateAssistantMessage(assistantId, {
            proposal: plan,
            content: chat.streamedTextRef.current,
        });
        chat.upsertAssistantBlock(assistantId, { id: `plan`, type: "plan", planId: plan.proposalId });
        chat.setActivityPhase("thinking", plan.decision ? `Plan ${plan.decision}` : "Awaiting plan decision");
        return;
    }

    if (event.type === "activity.error") {
        const message = str(event.payload?.message) ?? "Activity stream error";
        chat.upsertAssistantBlock(assistantId, { id: noticeId("error", message), type: "notice", tone: "error", text: message });
        chat.setActivityPhase("error", message);
        cbRef.current.onError?.({ message });
        return;
    }

    if (event.type === "activity.trace") return;

    const title = event.target?.name || event.name || event.kind;
    const summary = event.target?.summary || str(event.payload?.message) || title;
    if (event.status === "failed") {
        chat.setActivityPhase("error", summary);
    } else if (event.status === "completed") {
        chat.setActivityPhase("thinking", `${title} completed`);
    } else {
        chat.setActivityPhase(event.kind === "tool" ? "tool" : "thinking", summary);
    }
}

function nextBlock(type: "text" | "reasoning", ref: React.MutableRefObject<number>): string {
    ref.current += 1;
    return `${type}:${ref.current}`;
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
    if (err instanceof Error && err.name === "AbortError") return;
    const message = err instanceof Error ? err.message : String(err);
    chat.setActivityPhase("error", message);
    chat.failAssistant(assistantId, message);
    cbRef.current.onError?.({ message });
}

function planFromActivityEvent(event: ActivityEvent): Plan {
    const payload = event.payload ?? {};
    const rawType = event.raw && typeof event.raw === "object" && "type" in event.raw
        ? (event.raw as Record<string, unknown>).type as string
        : "";
    const planType: Plan["type"] = rawType === "approval.decided"
        ? "approval.decided"
        : rawType === "plan.feedback_requested"
            ? "plan.feedback_requested"
            : rawType === "approval.requested"
                ? "approval.requested"
                : "plan.proposed";
    return {
        type: planType,
        proposalId: str(payload.proposalId) ?? event.id,
        version: num(payload.version) ?? 1,
        state: str(payload.state) ?? event.status ?? "pending",
        decision: decision(payload.decision),
        rootRunId: event.rootId,
        runId: event.runId,
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

function artifactFromModelEvent(event: ModelEvent): Artifact {
    const asset = event.asset ?? { kind: "artifact" as const };
    const raw = asset.raw ?? {};
    const kind = artifactKind(asset.kind ?? raw.artifactType ?? raw.type);
    const mimeType = asset.mimeType ?? str(raw.mimeType) ?? str(raw.mime_type);
    const base64 = asset.base64 ?? str(raw.base64) ?? str(raw.data);
    const live = kind === "audio" && asset.partial === true && Boolean(base64);
    const url = live
        ? undefined
        : asset.url ?? str(raw.url) ?? (base64 ? `data:${mimeType || defaultMime(kind)};base64,${base64}` : undefined);
    return {
        id: event.id,
        artifactType: kind,
        url,
        inline: asset.inline === true,
        partial: asset.partial === true,
        embedding: embedding(asset.embedding ?? raw.embedding ?? raw.embeddings),
        mimeType,
        bytes: num(raw.bytes),
        responseId: asset.responseId ?? event.responseId ?? str(raw.responseId) ?? str(raw.response_id),
        outputIndex: asset.outputIndex ?? event.outputIndex ?? num(raw.outputIndex) ?? num(raw.output_index),
        status: asset.status ?? event.status,
        progress: asset.progress ?? num(raw.progress),
        jobId: asset.jobId ?? str(raw.jobId) ?? str(raw.job_id),
        sourceTool: event.toolCallId,
        ...(event.runId ? { source: "agent" as const } : {}),
        runKey: event.runId,
        raw: { ...raw, ...asset },
    };
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
