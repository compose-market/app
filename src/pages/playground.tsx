/**
 * Playground — Unified Multi-Model Chat Dashboard
 *
 * Zero-scroll, single-screen layout with:
 * - CapabilityChips for type/provider filtering
 * - ModelBadge for active model display
 * - CommandBar (⌘K) for model selection
 * - MultimodalCanvas for chat
 * - MirrorPane for settings
 *
 * Shared hooks: useChat, useModels, useSession
 */
import { Suspense, lazy, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePostHog } from "@posthog/react";
import { mpTrack } from "@/lib/mixpanel";
import { useActiveWallet, useActiveAccount } from "thirdweb/react";
import { useSession } from "@/hooks/use-session.tsx";
import { SessionBudgetDialog } from "@/components/session";
import { sdk } from "@/lib/sdk";
import { toAttachment, toMessage } from "@/hooks/use-chat";
import type { Message as Message, ComposeCallOptions } from "@compose-market/sdk";
import { useChain } from "@/contexts/ChainContext";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Bot,
  Settings2,
  Sparkles,
  RefreshCw,
  Plug,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MultimodalCanvas } from "@/components/chat";
import { MirrorPane, type ModelParamsSchema } from "@/components/mirror-pane";
import { ModelSelector } from "@/components/model-selector";
import { CapabilityChips } from "@/components/capability-chips";
import { useChat } from "@/hooks/use-chat";
import { useModels } from "@/hooks/use-model";
import { CostReceiptIndicator } from "@/components/receipt-indicator";
import { Switcher, type Option } from "@/components/control";
import { useToast } from "@/hooks/use-toast";
import { useStream } from "@/hooks/use-stream";
import {
  buildFamilyCategories,
  buildTypeCategories,
  formatModelTypeLabel,
  getModelTypeValues,
  getModelValueList,
  type CatalogModel,
} from "@/lib/models";

const PANE_COLLAPSED_KEY = "playground_pane_collapsed";

type PlaygroundTab = "model" | "connectors";

const tabs: Option<PlaygroundTab>[] = [
  { value: "model", label: "Models", icon: Bot },
  { value: "connectors", label: "Connectors", icon: Plug },
];

const LazyConnectorTester = lazy(() =>
  import("@/components/connector-tester").then((module) => ({ default: module.ConnectorTester }))
);

function getDefaultParamValues(schema: ModelParamsSchema | null): Record<string, unknown> {
  if (!schema) return {};
  const values: Record<string, unknown> = { ...(schema.defaults || {}) };
  for (const [key, definition] of Object.entries(schema.params)) {
    if (definition.required === true || values[key] !== undefined) continue;
    if (definition.default !== undefined) {
      values[key] = definition.default;
      continue;
    }
    if (definition.options && definition.options.length > 0) {
      values[key] = definition.options[0];
    }
  }
  return values;
}

function modelOutputType(model: CatalogModel): "text" | "image" | "audio" | "video" | "embedding" {
  if (Array.isArray(model.output)) {
    const output = model.output.filter((value): value is string => typeof value === "string");
    if (output.includes("image")) return "image";
    if (output.includes("video")) return "video";
    if (output.includes("audio")) return "audio";
    if (output.includes("embedding")) return "embedding";
  }
  return "text";
}

// =============================================================================
// Main Component
// =============================================================================

export default function PlaygroundPage() {
  const posthog = usePostHog();
  const wallet = useActiveWallet();
  const account = useActiveAccount();
  const { sessionActive, budgetRemaining, formatBudget, composeKeyToken, ensureComposeKeyToken } = useSession();
  const { paymentChainId } = useChain();
  const { toast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<"model" | "connectors">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "connectors" ? "connectors" : "model";
  });

  const initialConnectorSource = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    if (source === "onchain") return "onchain";
    if (source === "mcp") return "mcp";
    return "mcp";
  }, []);

  const initialConnector = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("connector") || "";
  }, []);

  // ============ Filter State ============
  const [selectedType, setSelectedType] = useState("text-generation");
  const [selectedFamily, setSelectedFamily] = useState("all");

  // ============ Models (single source — filters cascade to all consumers) ============
  const {
    models,
    filteredModels,
    isLoading: modelsLoading,
    forceRefresh: forceRefreshModels,
  } = useModels({
    type: selectedType === "all" ? undefined : selectedType,
    family: selectedFamily === "all" ? undefined : selectedFamily,
  });

  // ── Interconnected filters: each category list reflects the OTHER filter's selection ──
  // Type categories built from models filtered ONLY by family (so type-counts update when family changes)
  const typeCategories = useMemo(() => {
    if (selectedFamily === "all") return buildTypeCategories(models);
    return buildTypeCategories(models.filter((m) => (m.family || m.provider) === selectedFamily));
  }, [models, selectedFamily]);

  // Family categories built from models filtered ONLY by type (so family-counts update when type changes)
  const familyCategories = useMemo(() => {
    if (selectedType === "all") return buildFamilyCategories(models);
    return buildFamilyCategories(models.filter((m) => getModelTypeValues(m).includes(selectedType)));
  }, [models, selectedType]);

  // ── Filter interconnection guards: auto-reset invalid selections ──
  useEffect(() => {
    if (selectedType !== "all" && typeCategories.length > 0) {
      const stillValid = typeCategories.some((c) => c.id === selectedType);
      if (!stillValid) setSelectedType("all");
    }
  }, [typeCategories, selectedType]);

  useEffect(() => {
    if (selectedFamily !== "all" && familyCategories.length > 0) {
      const stillValid = familyCategories.some((c) => c.id === selectedFamily);
      if (!stillValid) setSelectedFamily("all");
    }
  }, [familyCategories, selectedFamily]);

  // ============ Model Selection ============
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o");
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  // Mobile pane sheet
  const [mobilePaneOpen, setMobilePaneOpen] = useState(false);

  // Desktop pane collapse (persisted)
  const [paneCollapsed, setPaneCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(PANE_COLLAPSED_KEY) === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, String(paneCollapsed));
  }, [paneCollapsed]);

  // Model Parameters State
  const [modelParams, setModelParams] = useState<ModelParamsSchema | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const modelParamsCacheRef = useRef<Map<string, ModelParamsSchema | null>>(new Map());

  // Chat state
  const conversationId = useRef(`playground-${Date.now()}`).current;
  const chat = useChat({
    conversationId,
    onError: (err) => setInferenceError(err),
  });
  const { messages, setMessages, scrollContainerRef, messagesEndRef,
    activityState, clearMessages,
    attachedFiles, fileInputRef, handleFileSelect, handleRemoveFile, uploadedCids, cleanupFiles, clearFiles,
    isRecording, recordingSupported, startRecording, stopRecording,
  } = chat;
  const streamer = useStream(chat, {
    onError: (err) => setInferenceError(err.message),
  });

  const [inputValue, setInputValue] = useState("");

  // ============ ⌘K Global Shortcut ============
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-select first model from the filtered list when filters change.
  useEffect(() => {
    if (filteredModels.length > 0 && (!selectedModel || !filteredModels.some((m) => m.modelId === selectedModel))) {
      setSelectedModel(filteredModels[0].modelId);
    }
  }, [filteredModels, selectedModel]);

  // Track conversation context boundary on model switch
  const [conversationStartIndex, setConversationStartIndex] = useState(0);
  const prevModelRef = useRef<string | null>(null);
  const messagesLengthRef = useRef(0);

  useEffect(() => {
    messagesLengthRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (prevModelRef.current !== null && prevModelRef.current !== selectedModel && messagesLengthRef.current > 0) {
      setConversationStartIndex(messagesLengthRef.current);
    }
    prevModelRef.current = selectedModel;
  }, [selectedModel]);

  // Selected model info
  const selectedModelInfo = useMemo(
    () => models.find((m) => m.modelId === selectedModel) || null,
    [models, selectedModel],
  );
  // Fetch model params
  useEffect(() => {
    if (!selectedModel || !selectedModelInfo) {
      setModelParams(null);
      setParamValues({});
      return;
    }
    const cached = modelParamsCacheRef.current.get(selectedModel);
    if (cached !== undefined) {
      setModelParams(cached);
      setParamValues(getDefaultParamValues(cached));
      return;
    }
    const abortController = new AbortController();
    const fetchParams = async () => {
      try {
        const data = await sdk.models.getParams(selectedModel);
        if (abortController.signal.aborted) return;
        const normalizedData = Object.keys(data.params).length > 0 ? (data as unknown as ModelParamsSchema) : null;
        modelParamsCacheRef.current.set(selectedModel, normalizedData);
        setModelParams(normalizedData);
        setParamValues(getDefaultParamValues(normalizedData));
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error("[playground] Failed to fetch model params:", err);
        modelParamsCacheRef.current.set(selectedModel, null);
        setModelParams(null);
        setParamValues({});
      }
    };
    void fetchParams();
    return () => { abortController.abort(); };
  }, [selectedModel, selectedModelInfo]);

  // Refs for hot values used in handleSendMessage (avoids callback churn)
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const attachedFilesRef = useRef(attachedFiles);
  attachedFilesRef.current = attachedFiles;
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
  const selectedModelInfoRef = useRef(selectedModelInfo);
  selectedModelInfoRef.current = selectedModelInfo;
  const systemPromptRef = useRef(systemPrompt);
  systemPromptRef.current = systemPrompt;
  const paramValuesRef = useRef(paramValues);
  paramValuesRef.current = paramValues;
  const conversationStartIndexRef = useRef(conversationStartIndex);
  conversationStartIndexRef.current = conversationStartIndex;

  const handleSendMessage = useCallback(async () => {
    const currentAttachedFiles = attachedFilesRef.current;
    const currentInputValue = inputValueRef.current;
    const currentStreaming = streamingRef.current;
    const currentSelectedModel = selectedModelRef.current;
    const currentSelectedModelInfo = selectedModelInfoRef.current;
    const currentMessages = messagesRef.current;
    const currentSystemPrompt = systemPromptRef.current;
    const currentParamValues = paramValuesRef.current;
    const currentConversationStartIndex = conversationStartIndexRef.current;

    if (currentAttachedFiles.some(f => f.uploading)) return;
    if ((!currentInputValue.trim() && currentAttachedFiles.length === 0) || currentStreaming || !currentSelectedModel || !currentSelectedModelInfo) return;

    if (!sessionActive || budgetRemaining <= 0) {
      toast({
        title: "Session Required",
        description: "Please create a session to continue. Sessions enable faster responses.",
        variant: "destructive"
      });
      setShowSessionDialog(true);
      return;
    }

    const attached = currentAttachedFiles[0];
    const attachments = currentAttachedFiles
      .map(toAttachment)
      .filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment));
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: currentInputValue.trim(),
      timestamp: Date.now(),
      type: attached?.type ?? "text",
      imageUrl: attached?.type === "image" ? attached.url : undefined,
      audioUrl: attached?.type === "audio" ? attached.url : undefined,
      videoUrl: attached?.type === "video" ? attached.url : undefined,
    };

    posthog?.capture("playground_message_sent", {
      model_id: currentSelectedModel,
      has_attachment: currentAttachedFiles.length > 0,
      attachment_type: currentAttachedFiles[0]?.type ?? null,
      chain_id: paymentChainId,
    });

    mpTrack("Launch AI");
    mpTrack("AI Prompt Sent and Prompt Text", {
      "Prompt Text": currentInputValue.trim().slice(0, 500),
    });

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    clearFiles();
    setStreaming(true);
    setInferenceError(null);
    chat.clearActivityState();

    const assistantId = crypto.randomUUID();
    chat.streamedTextRef.current = "";
    chat.currentAssistantIdRef.current = assistantId;

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), type: modelOutputType(currentSelectedModelInfo) },
    ]);

    try {
      if (!wallet || !account) throw new Error("Connect wallet to use inference");

      // Make sure the SDK has the freshly-minted Compose Key JWT cached
      // in-memory before any billable call fires.
      const activeComposeKeyToken = composeKeyToken || sdk.keys.currentToken() || await ensureComposeKeyToken();
      if (sessionActive && budgetRemaining > 0 && !activeComposeKeyToken) {
        throw new Error("Compose session key unavailable. Re-open your session and try again.");
      }
      if (activeComposeKeyToken) {
        sdk.keys.use(activeComposeKeyToken);
      }

      const history = [...currentMessages.slice(currentConversationStartIndex), userMessage];
      const input: Message[] = history.map(toMessage);
      if (currentSystemPrompt.trim()) input.unshift({ role: "system", content: currentSystemPrompt.trim() });

      const callOptions: ComposeCallOptions = {
        ...(activeComposeKeyToken ? { composeKey: activeComposeKeyToken } : {}),
        userAddress: account.address,
        chainId: paymentChainId,
      };
      await streamer.runResponses({
        params: {
          model: currentSelectedModelInfo.modelId,
          input,
          stream: true,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...currentParamValues,
        },
        assistantId,
        options: callOptions,
      });
    } catch (err) {
      const errorMsg = "This request could not be completed.";
      console.error("[playground] inference failed:", err);
      setInferenceError(errorMsg);
      chat.setActivityPhase("error", errorMsg);
      chat.failAssistant(assistantId, errorMsg);
    } finally {
      setStreaming(false);
    }
  }, [wallet, account, budgetRemaining, clearFiles, sessionActive, composeKeyToken, ensureComposeKeyToken, paymentChainId, toast, posthog, chat, setMessages, streamer]);
  const handleClearChat = useCallback(() => {
    clearMessages();
    setInferenceError(null);
    clearFiles();
    setConversationStartIndex(0);
    if (uploadedCids.length > 0) cleanupFiles();
  }, [uploadedCids, cleanupFiles, clearFiles, clearMessages]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="cm-playground">
      {/* ── Top-Level Toolbar: Page info only ─────────────────── */}
      <div className="cm-playground__toolbar">
        <div className="cm-playground__title">
          <Sparkles className="cm-playground__title-icon" />
          <span className="cm-playground__title-text">Playground</span>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PlaygroundTab)}>
          <Switcher
            value={activeTab}
            options={tabs}
            label="Playground section"
            onChange={setActiveTab}
          />
        </Tabs>

        <div className="cm-playground__toolbar-right">
          <CostReceiptIndicator />
          {activeTab === "model" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobilePaneOpen(true)}
              className="cm-shell-button cm-shell-button--ghost cm-shell-button--icon lg:hidden"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Chat + MirrorPane — equi-heighted sibling grid ─────── */}
      {activeTab === "model" && (
        <div className={`cm-split${paneCollapsed ? " cm-split--collapsed" : ""}`}>
          {/* Chat cell — contains its own filter toolbar + caps + canvas */}
          <div className="cm-split__main cm-playground__chat-cell">
            {/* ── Chat-internal toolbar: badge, filters, count ── */}
            <div className="cm-playground__chat-toolbar">
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                open={commandBarOpen}
                onOpenChange={setCommandBarOpen}
                type={selectedType === "all" ? undefined : selectedType}
                family={selectedFamily === "all" ? undefined : selectedFamily}
              />

              <CapabilityChips
                selectedType={selectedType}
                onTypeChange={setSelectedType}
                typeCategories={typeCategories}
                selectedFamily={selectedFamily}
                onFamilyChange={setSelectedFamily}
                familyCategories={familyCategories}
              />

              <span className="cm-playground__model-count">
                {filteredModels.length}/{models.length}
              </span>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => forceRefreshModels()}
                disabled={modelsLoading}
                className="cm-shell-button cm-shell-button--ghost cm-shell-button--icon"
              >
                <RefreshCw className={`h-4 w-4 ${modelsLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* ── Chat-internal input row ── */}
            {selectedModelInfo && (() => {
              const inputs = getModelValueList(selectedModelInfo.input);
              const uniqueInputs = [...new Set(inputs)];
              return uniqueInputs.length > 0 ? (
                <div className="cm-playground__caps-row">
                  <span className="cm-playground__caps-label">Input</span>
                  {uniqueInputs.map((input) => {
                    const formatted = input.charAt(0).toUpperCase() + input.slice(1);
                    return (
                      <span key={input} className="cm-playground__cap-tag">
                        {formatted}
                      </span>
                    );
                  })}
                </div>
              ) : null;
            })()}

            {/* ── The actual chat canvas ── */}
            <MultimodalCanvas
              variant="playground"
              showHeader={false}
              messages={messages}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSend={handleSendMessage}
              sending={streaming}
              activityState={activityState}
              error={inferenceError}
              sessionActive={sessionActive}
              attachedFiles={attachedFiles}
              onFileSelect={() => fileInputRef.current?.click()}
              onRemoveFile={handleRemoveFile}
              fileInputRef={fileInputRef}
              onFileInputChange={handleFileSelect}
              isRecording={isRecording}
              recordingSupported={recordingSupported}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onClearChat={handleClearChat}
              scrollContainerRef={scrollContainerRef}
              messagesEndRef={messagesEndRef}
              height="h-full"
              placeholder={
                !sessionActive
                  ? "Start session"
                  : attachedFiles.length > 0
                    ? "Describe the uploaded file..."
                    : "Send a request..."
              }
              emptyStateIcon={<Bot className="mx-auto mb-4 h-12 w-12 text-cyan-300/50" />}
              emptyStateText={
                selectedModelInfo
                  ? `Start with ${selectedModelInfo.name || selectedModelInfo.modelId}`
                  : "Select a model to begin"
              }
              emptyStateSubtext={
                sessionActive
                  ? `Budget remaining: ${formatBudget(budgetRemaining)}`
                  : "Start a session to begin"
              }
            />
          </div>

          {/* MirrorPane — independent equi-heighted sibling cell */}
          {!paneCollapsed && (
            <div className="cm-split__side cm-playground__pane-cell">
              <button
                onClick={() => setPaneCollapsed(true)}
                className="cm-playground__pane-toggle"
                aria-label="Collapse settings pane"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <MirrorPane
                selectedModel={selectedModel}
                modelInfo={selectedModelInfo || null}
                systemPrompt={systemPrompt}
                onSystemPromptChange={setSystemPrompt}
                modelParams={modelParams}
                paramValues={paramValues}
                onParamValuesChange={setParamValues}
              />
            </div>
          )}
        </div>
      )}

      {/* Expand button when MirrorPane collapsed */}
      {activeTab === "model" && paneCollapsed && (
        <button
          onClick={() => setPaneCollapsed(false)}
          className="cm-playground__pane-expand"
          aria-label="Expand settings pane"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* ── Connectors Tab ──────────────────────────────────────────── */}
      {activeTab === "connectors" && (
        <div className="flex-1 min-h-0">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading connector tester...
              </div>
            }
          >
            <LazyConnectorTester
              initialSource={initialConnectorSource}
              initialConnector={initialConnector}
            />
          </Suspense>
        </div>
      )}

      {/* ── Command Bar (⌘K) ─────────────────────────────────────── */}

      {/* ── Session Dialog ────────────────────────────────────────── */}
      <SessionBudgetDialog
        open={showSessionDialog}
        onOpenChange={setShowSessionDialog}
        showTrigger={false}
      />

      {/* ── Mobile MirrorPane Sheet ───────────────────────────────── */}
      <Sheet open={mobilePaneOpen} onOpenChange={setMobilePaneOpen}>
        <SheetContent side="right" className="cm-shell-panel cm-sheet-panel cm-sheet-panel--inspect p-0">
          <SheetHeader className="border-b border-primary/15 p-4">
            <SheetTitle className="font-display text-cyan-300 flex items-center gap-2 text-base">
              <Settings2 className="h-5 w-5" />
              Model Settings
            </SheetTitle>
          </SheetHeader>
          <div className="cm-sheet-body cm-sheet-body--inspect">
            <MirrorPane
              selectedModel={selectedModel}
              modelInfo={selectedModelInfo || null}
              systemPrompt={systemPrompt}
              onSystemPromptChange={setSystemPrompt}
              modelParams={modelParams}
              paramValues={paramValues}
              onParamValuesChange={setParamValues}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
