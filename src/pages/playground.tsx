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
import { toComposeAttachment, toComposeMessage } from "@/hooks/use-chat";
import type { ChatMessage, ComposeCallOptions } from "@compose-market/sdk";
import { useChain } from "@/contexts/ChainContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CommandBar } from "@/components/command-bar";
import { ModelBadge } from "@/components/model-badge";
import { CapabilityChips } from "@/components/capability-chips";
import { useChat } from "@/hooks/use-chat";
import { useModels } from "@/hooks/use-model";
import { CostReceiptIndicator } from "@/components/receipt-indicator";
import { ToolTimeline } from "@/components/tool-timeline";
import { useToast } from "@/hooks/use-toast";
import { useComposeStream } from "@/hooks/use-stream";
import {
  buildProviderCategories,
  buildTypeCategories,
  formatModelTypeLabel,
  getModelTypeValues,
} from "@/lib/models";

const PANE_COLLAPSED_KEY = "playground_pane_collapsed";

const LazyPluginTester = lazy(() =>
  import("@/components/plugin-tester").then((module) => ({ default: module.PluginTester }))
);

function getDefaultParamValues(schema: ModelParamsSchema | null): Record<string, unknown> {
  if (!schema) return {};
  return schema.defaults || {};
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
  const [activeTab, setActiveTab] = useState<"model" | "plugins">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "plugins" ? "plugins" : "model";
  });

  const initialPluginSource = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    return source === "tools" || source === "onchain" ? source : "tools";
  }, []);

  const initialPlugin = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("plugin") || "";
  }, []);

  // ============ Filter State ============
  const [selectedType, setSelectedType] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");

  // ============ Models (single source — filters cascade to all consumers) ============
  const {
    models,
    filteredModels,
    isLoading: modelsLoading,
    forceRefresh: forceRefreshModels,
  } = useModels({
    type: selectedType === "all" ? undefined : selectedType,
    provider: selectedProvider === "all" ? undefined : selectedProvider,
  });

  // ── Interconnected filters: each category list reflects the OTHER filter's selection ──
  // Type categories built from models filtered ONLY by provider (so type-counts update when provider changes)
  const typeCategories = useMemo(() => {
    if (selectedProvider === "all") return buildTypeCategories(models);
    return buildTypeCategories(models.filter((m) => m.provider === selectedProvider));
  }, [models, selectedProvider]);

  // Provider categories built from models filtered ONLY by type (so provider-counts update when type changes)
  const providerCategories = useMemo(() => {
    if (selectedType === "all") return buildProviderCategories(models);
    return buildProviderCategories(models.filter((m) => getModelTypeValues(m).includes(selectedType)));
  }, [models, selectedType]);

  // ── Filter interconnection guards: auto-reset invalid selections ──
  useEffect(() => {
    if (selectedType !== "all" && typeCategories.length > 0) {
      const stillValid = typeCategories.some((c) => c.id === selectedType);
      if (!stillValid) setSelectedType("all");
    }
  }, [typeCategories, selectedType]);

  useEffect(() => {
    if (selectedProvider !== "all" && providerCategories.length > 0) {
      const stillValid = providerCategories.some((c) => c.id === selectedProvider);
      if (!stillValid) setSelectedProvider("all");
    }
  }, [providerCategories, selectedProvider]);

  // ============ Model Selection ============
  const [selectedModel, setSelectedModel] = useState<string>("");
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
  const streamer = useComposeStream(chat, {
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

  useEffect(() => {
    if (prevModelRef.current !== null && prevModelRef.current !== selectedModel && messages.length > 0) {
      setConversationStartIndex(messages.length);
    }
    prevModelRef.current = selectedModel;
  }, [selectedModel, messages.length]);

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

  // ==========================================================================
  // Handlers (unchanged from original)
  // ==========================================================================

  const handleSendMessage = useCallback(async () => {
    if (attachedFiles.some(f => f.uploading)) return;
    if ((!inputValue.trim() && attachedFiles.length === 0) || streaming || !selectedModel || !selectedModelInfo) return;

    if (!sessionActive || budgetRemaining <= 0) {
      toast({
        title: "Session Required",
        description: "Please create a session to continue. Sessions enable faster responses.",
        variant: "destructive"
      });
      setShowSessionDialog(true);
      return;
    }

    const attached = attachedFiles[0];
    const attachments = attachedFiles
      .map(toComposeAttachment)
      .filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment));
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: inputValue.trim(),
      timestamp: Date.now(),
      type: attached?.type ?? "text",
      imageUrl: attached?.type === "image" ? attached.url : undefined,
      audioUrl: attached?.type === "audio" ? attached.url : undefined,
      videoUrl: attached?.type === "video" ? attached.url : undefined,
    };

    posthog?.capture("playground_message_sent", {
      model_id: selectedModel,
      has_attachment: attachedFiles.length > 0,
      attachment_type: attachedFiles[0]?.type ?? null,
      chain_id: paymentChainId,
    });

    mpTrack("Launch AI");
    mpTrack("AI Prompt Sent and Prompt Text", {
      "Prompt Text": inputValue.trim().slice(0, 500),
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
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), type: "text" },
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

      const history = [...messages.slice(conversationStartIndex), userMessage];
      const input: ChatMessage[] = history.map(toComposeMessage);
      if (systemPrompt.trim()) input.unshift({ role: "system", content: systemPrompt.trim() });

      const callOptions: ComposeCallOptions = {
        ...(activeComposeKeyToken ? { composeKey: activeComposeKeyToken } : {}),
        userAddress: account.address,
        chainId: paymentChainId,
      };
      await streamer.runResponses({
        params: {
          model: selectedModelInfo.modelId,
          input,
          stream: true,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...paramValues,
        },
        assistantId,
        options: callOptions,
      });
    } catch (err) {
      const errorMsg = "This request could not be completed.";
      console.error("[playground] inference failed:", err);
      setInferenceError(errorMsg);
      chat.setActivityPhase("error", errorMsg);
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${errorMsg}` } : m)
      );
    } finally {
      setStreaming(false);
    }
  }, [inputValue, streaming, selectedModel, selectedModelInfo, messages, systemPrompt, wallet, account, budgetRemaining, attachedFiles, clearFiles, sessionActive, composeKeyToken, ensureComposeKeyToken, paymentChainId, paramValues, toast, setShowSessionDialog, posthog, chat, setMessages, conversationStartIndex, streamer]);
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "model" | "plugins")}>
          <TabsList className="cm-shell-tab-strip">
            <TabsTrigger value="model" className="cm-shell-tab">
              <Bot className="h-4 w-4" />
              Models
            </TabsTrigger>
            <TabsTrigger value="plugins" className="cm-shell-tab">
              <Plug className="h-4 w-4" />
              Plugins
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="cm-playground__toolbar-right">
          <ToolTimeline />
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
        <div className={`cm-playground__grid${paneCollapsed ? " cm-playground__grid--collapsed" : ""}`}>
          {/* Chat cell — contains its own filter toolbar + caps + canvas */}
          <div className="cm-playground__chat-cell">
            {/* ── Chat-internal toolbar: badge, filters, count ── */}
            <div className="cm-playground__chat-toolbar">
              <ModelBadge
                model={selectedModelInfo}
                onClick={() => setCommandBarOpen(true)}
              />

              <CapabilityChips
                selectedType={selectedType}
                onTypeChange={setSelectedType}
                typeCategories={typeCategories}
                selectedProvider={selectedProvider}
                onProviderChange={setSelectedProvider}
                providerCategories={providerCategories}
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

            {/* ── Chat-internal capabilities row ── */}
            {selectedModelInfo && (() => {
              const caps = getModelTypeValues(selectedModelInfo);
              const uniqueCaps = [...new Set(caps)];
              return uniqueCaps.length > 0 ? (
                <div className="cm-playground__caps-row">
                  <span className="cm-playground__caps-label">Capabilities</span>
                  {uniqueCaps.map((cap) => {
                    return (
                      <span key={cap} className="cm-playground__cap-tag">
                        {formatModelTypeLabel(cap)}
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
                  ? "Start a session first"
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
            <div className="cm-playground__pane-cell">
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

      {/* ── Plugins Tab ──────────────────────────────────────────── */}
      {activeTab === "plugins" && (
        <div className="flex-1 min-h-0">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading plugin tester...
              </div>
            }
          >
            <LazyPluginTester
              sessionActive={sessionActive}
              budgetRemaining={budgetRemaining}
              formatBudget={formatBudget}
              initialSource={initialPluginSource}
              initialPlugin={initialPlugin}
            />
          </Suspense>
        </div>
      )}

      {/* ── Command Bar (⌘K) ─────────────────────────────────────── */}
      <CommandBar
        open={commandBarOpen}
        onOpenChange={setCommandBarOpen}
        value={selectedModel}
        onSelect={setSelectedModel}
        type={selectedType === "all" ? undefined : selectedType}
        provider={selectedProvider === "all" ? undefined : selectedProvider}
      />

      {/* ── Session Dialog ────────────────────────────────────────── */}
      <SessionBudgetDialog
        open={showSessionDialog}
        onOpenChange={setShowSessionDialog}
        showTrigger={false}
      />

      {/* ── Mobile MirrorPane Sheet ───────────────────────────────── */}
      <Sheet open={mobilePaneOpen} onOpenChange={setMobilePaneOpen}>
        <SheetContent side="right" className="cm-shell-panel p-0 overflow-y-auto w-[min(28rem,calc(100vw-1rem))]">
          <SheetHeader className="border-b border-primary/15 p-4">
            <SheetTitle className="font-display text-cyan-300 flex items-center gap-2 text-base">
              <Settings2 className="h-5 w-5" />
              Model Settings
            </SheetTitle>
          </SheetHeader>
          <div className="p-3 sm:p-4">
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
