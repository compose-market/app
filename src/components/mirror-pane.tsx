/**
 * Mirror Pane Component
 *
 * Side panel showing model details (pricing, limits, I/O) and settings (system prompt, tools).
 * 
 * Styling: uses @compose-market/theme BEM classes (cm-mirror-pane*).
 */
import { useState } from "react";
import {
    MirrorPane as MirrorPaneShell,
    MirrorPricing,
    MirrorRow,
    MirrorSection,
} from "@compose-market/theme/mirror";
import { Excerpt, Hint } from "@compose-market/theme/shell";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Cpu,
    DollarSign,
    LayoutGrid,
    LogIn,
    LogOut,
    Settings,
} from "lucide-react";
import type { CanonicalModality } from "@compose-market/sdk";
import {
    formatModelTypeLabel,
    getDefaultModelPricingSections,
    getModelContextWindowEntries,
    getOptionalModelPricingSections,
    getModelTypeValues,
    getModelValueList,
    type CatalogModel,
} from "@/lib/models";
import { typeIcon, typeLabel } from "@compose-market/theme/icons/react";

export interface ParamDefinition {
    type: "string" | "integer" | "number" | "boolean" | "array" | "object";
    required: boolean;
    default?: string | number | boolean;
    options?: Array<string | number>;
    description?: string;
}

export interface ModelParamsSchema {
    modelId: string;
    type: CanonicalModality | null;
    params: Record<string, ParamDefinition>;
    defaults: Record<string, unknown>;
    provider: string | null;
}

export interface MirrorPaneProps {
    selectedModel: string;
    modelInfo: CatalogModel | null;
    systemPrompt: string;
    onSystemPromptChange: (value: string) => void;
    modelParams?: ModelParamsSchema | null;
    paramValues?: Record<string, unknown>;
    onParamValuesChange?: (values: Record<string, unknown>) => void;
}

function renderParamInput(
    key: string,
    definition: ParamDefinition,
    value: unknown,
    onChange: (nextValue: unknown) => void,
) {
    if (definition.options && definition.options.length > 0) {
        const selected = value === undefined
            ? definition.default ?? definition.options[0]
            : value;
        return (
            <div className="cm-mirror-pane__option-grid" role="radiogroup" aria-label={key}>
                {definition.options.map((option) => {
                    const active = String(selected) === String(option);
                    return (
                        <button
                            key={`${key}-${option}`}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className="cm-mirror-pane__option"
                            data-active={active ? "true" : "false"}
                            onClick={() => onChange(option)}
                        >
                            <Hint label={String(option)}>
                                <span>{String(option)}</span>
                            </Hint>
                        </button>
                    );
                })}
            </div>
        );
    }

    if (definition.type === "boolean") {
        const checked = value === undefined ? Boolean(definition.default) : Boolean(value);
        return (
            <div className="cm-mirror-pane__tool-toggle">
                <span className="cm-mirror-pane__field-value">
                    <span className="cm-mirror-pane__field-main">{checked ? "Enabled" : "Disabled"}</span>
                </span>
                <Switch checked={checked} onCheckedChange={onChange as (checked: boolean) => void} />
            </div>
        );
    }

    return (
        <Input
            type={definition.type === "integer" || definition.type === "number" ? "number" : "text"}
            value={value === undefined ? "" : String(value)}
            onChange={(event) => {
                const rawValue = event.target.value;
                if (definition.type === "integer") {
                    onChange(rawValue === "" ? undefined : Number.parseInt(rawValue, 10));
                    return;
                }
                if (definition.type === "number") {
                    onChange(rawValue === "" ? undefined : Number.parseFloat(rawValue));
                    return;
                }
                onChange(rawValue);
            }}
            className="cm-mirror-pane__field"
        />
    );
}

function flow(value: string): "input" | "output" | null {
    const id = value.toLowerCase();
    if (id.includes("input") || id.includes("prompt")) return "input";
    if (id.includes("output") || id.includes("completion") || id.includes("response")) return "output";
    return null;
}

function iconLabel(label: string, kind: "input" | "output" | "price", variant: "section" | "metric" = "metric") {
    const iconClass = "cm-mirror-pane__icon-svg";
    const icon = kind === "input"
        ? <LogIn className={iconClass} />
        : kind === "output"
            ? <LogOut className={iconClass} />
            : <DollarSign className={iconClass} />;

    return (
        <Hint label={label}>
            <span
                className={`cm-mirror-pane__icon-label ${variant === "section" ? "cm-mirror-pane__icon-label--section" : ""}`}
                aria-label={label}
            >
                {icon}
            </span>
        </Hint>
    );
}

function formatId(value: string): string {
    const id = value.toLowerCase().split(":")[0].trim().replace(/^output[_-]/, "").replace(/^input[_-]/, "");
    if (id.includes("speech")) return "audio";
    return id;
}

function formatLabel(value: string): string {
    const id = formatId(value).replace(/[_-]+/g, " ");
    if (id === "audio") return "Audio";
    if (id === "text") return "Text";
    if (id === "image") return "Image";
    if (id === "video") return "Video";
    return typeLabel(id.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "));
}

function tone(value: string): "cyan" | "fuchsia" | "green" {
    const id = formatId(value);
    if (id.includes("image") || id.includes("video")) return "fuchsia";
    if (id.includes("audio")) return "green";
    return "cyan";
}

function FormatBadge({ value }: { value: string }) {
    const id = formatId(value);
    const label = formatLabel(value);

    return (
        <Hint label={label}>
            <span className="cm-mirror-pane__format-badge" data-tone={tone(value)} aria-label={label}>
                {typeIcon(id, "cm-mirror-pane__format-icon")}
            </span>
        </Hint>
    );
}

function FieldValue({ value }: { value: string }) {
    return (
        <Hint label={value}>
            <span className="cm-mirror-pane__field-value">
                <span className="cm-mirror-pane__field-main">{value}</span>
            </span>
        </Hint>
    );
}

function labelIcon(label: string, fallback: "price" | "input" = "input") {
    const kind = flow(label) || fallback;
    return iconLabel(label, kind);
}

export function MirrorPane({
    selectedModel,
    modelInfo,
    systemPrompt,
    onSystemPromptChange,
    modelParams,
    paramValues = {},
    onParamValuesChange,
}: MirrorPaneProps) {
    const [activeTab, setActiveTab] = useState<"details" | "custom">("details");
    const typeValues = modelInfo ? getModelTypeValues(modelInfo) : [];
    const hasOptionalParams = Boolean(modelParams && Object.keys(modelParams.params).length > 0);
    const inputValues = modelInfo ? getModelValueList(modelInfo.input) : [];
    const outputValues = modelInfo ? getModelValueList(modelInfo.output) : [];
    const contextEntries = modelInfo ? getModelContextWindowEntries(modelInfo) : [];
    const pricingSections = modelInfo ? getDefaultModelPricingSections(modelInfo) : [];
    const optionalPricingSections = modelInfo ? getOptionalModelPricingSections(modelInfo) : [];

    if (!selectedModel) {
        return (
            <MirrorPaneShell
                empty
                emptyIcon={<Cpu />}
                emptyText="Select a model to inspect pricing, limits, and settings"
            />
        );
    }

    return (
        <MirrorPaneShell
            title={activeTab === "details" ? (
                <Hint label={modelInfo?.name || selectedModel}>
                    <span className="cm-mirror-pane__title-text">{modelInfo?.name || selectedModel}</span>
                </Hint>
            ) : undefined}
            subtitle={activeTab === "details" ? (
                <span className="cm-mirror-pane__model-meta-row">
                    <Hint label={modelInfo?.provider || "unknown"}>
                        <span className="cm-mirror-pane__provider">{modelInfo?.provider || "unknown"}</span>
                    </Hint>
                    <span className="cm-mirror-pane__type-list">
                        {typeValues.map((value) => (
                            <Hint key={value} label={formatModelTypeLabel(value)}>
                                <span className="cm-mirror-pane__type-badge" data-tone={tone(value)}>
                                    {typeIcon(value, "cm-mirror-pane__type-icon")}
                                    <span>{formatModelTypeLabel(value)}</span>
                                </span>
                            </Hint>
                        ))}
                    </span>
                </span>
            ) : undefined}
            icon={activeTab === "details" ? <Cpu /> : undefined}
            tabs={[
                { id: "details", label: "Details", icon: <LayoutGrid />, tone: "cyan" },
                { id: "custom", label: "Custom", icon: <Settings />, tone: "fuchsia" },
            ]}
            activeTab={activeTab}
            onTabChange={(tab: string) => setActiveTab(tab === "custom" ? "custom" : "details")}
        >
            {activeTab === "details" && (
                <div className="cm-mirror-pane__details">
                    {modelInfo?.description && (
                        <div className="cm-mirror-pane__description">
                            <Hint label={modelInfo.description}>
                                <span className="cm-mirror-pane__description-hint">
                                    <Excerpt title={modelInfo.name || selectedModel} text={modelInfo.description} lines={2}>
                                        {modelInfo.description}
                                    </Excerpt>
                                </span>
                            </Hint>
                        </div>
                    )}

                    {modelInfo && (
                        <>
                            {(inputValues.length > 0 || outputValues.length > 0) && (
                                <MirrorSection label={<span className="cm-mirror-pane__section-text">Capability</span>} className="cm-mirror-pane__section--capability">
                                    <div className="cm-mirror-pane__lane-grid">
                                        {inputValues.length > 0 && (
                                            <div className="cm-mirror-pane__io-row cm-mirror-pane__metric-cell">
                                                <span className="cm-mirror-pane__io-label">{iconLabel("Input", "input")}</span>
                                                <div className="cm-mirror-pane__io-badges">
                                                    {inputValues.map((value) => (
                                                        <FormatBadge key={`in-${value}`} value={value} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {outputValues.length > 0 && (
                                            <div className="cm-mirror-pane__io-row cm-mirror-pane__metric-cell">
                                                <span className="cm-mirror-pane__io-label">{iconLabel("Output", "output")}</span>
                                                <div className="cm-mirror-pane__io-badges">
                                                    {outputValues.map((value) => (
                                                        <FormatBadge key={`out-${value}`} value={value} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </MirrorSection>
                            )}

                            {contextEntries.length > 0 && (
                                <MirrorSection label={<span className="cm-mirror-pane__section-text">Context</span>} className="cm-mirror-pane__section--context">
                                    <div className="cm-mirror-pane__kv-grid">
                                        {contextEntries.map((entry) => (
                                            <MirrorRow
                                                key={`ctx-${entry.label}`}
                                                label={labelIcon(entry.label, "input")}
                                                value={<FieldValue value={entry.value} />}
                                            />
                                        ))}
                                    </div>
                                </MirrorSection>
                            )}

                            {pricingSections.length > 0 && (
                                <MirrorSection label={iconLabel("Price", "price", "section")} className="cm-mirror-pane__section--pricing">
                                    {pricingSections.map((section, index) => (
                                        <MirrorPricing key={`price-${section.header}-${index}`} unit={section.unit}>
                                            {section.entries.map((entry) => (
                                                <MirrorRow
                                                    key={`${section.header}-${entry.label}`}
                                                    label={labelIcon(entry.label, "price")}
                                                    value={<FieldValue value={entry.value} />}
                                                />
                                            ))}
                                        </MirrorPricing>
                                    ))}
                                </MirrorSection>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeTab === "custom" && (
                <div className="cm-mirror-pane__custom-content">
                    <MirrorSection label={<span className="cm-mirror-pane__section-text">System</span>} className="cm-mirror-pane__section--custom">
                        <Textarea
                            value={systemPrompt}
                            onChange={(event) => onSystemPromptChange(event.target.value)}
                            placeholder="Optional system prompt..."
                            className="cm-mirror-pane__text-area"
                        />
                    </MirrorSection>

                    {/* Optional Pricing */}
                    {optionalPricingSections.length > 0 && (
                        <MirrorSection label={iconLabel("Price", "price", "section")} className="cm-mirror-pane__section--pricing">
                            {optionalPricingSections.map((section, index) => (
                                <MirrorPricing key={`optional-price-${section.header}-${index}`} unit={section.unit}>
                                    {section.entries.map((entry) => (
                                        <MirrorRow
                                            key={`${section.header}-${entry.label}`}
                                            label={labelIcon(entry.label, "price")}
                                            value={<FieldValue value={entry.value} />}
                                        />
                                    ))}
                                </MirrorPricing>
                            ))}
                        </MirrorSection>
                    )}

                    {/* Dynamic model params */}
                    {hasOptionalParams && modelParams && (
                        <>
                            {Object.entries(modelParams.params).filter(([, definition]) => definition.required !== true).map(([key, definition]) => (
                                <MirrorSection key={key} label={<span className="cm-mirror-pane__section-text">{key}</span>} className="cm-mirror-pane__section--param">
                                    <div className="cm-mirror-pane__param-body">
                                        {renderParamInput(
                                            key,
                                            definition,
                                            paramValues[key],
                                            (nextValue) => onParamValuesChange?.({ ...paramValues, [key]: nextValue }),
                                        )}
                                        {definition.description && (
                                            <Hint label={definition.description}>
                                                <span className="cm-mirror-pane__param-description">
                                                    <Excerpt title={key} text={definition.description} lines={2}>
                                                        {definition.description}
                                                    </Excerpt>
                                                </span>
                                            </Hint>
                                        )}
                                    </div>
                                </MirrorSection>
                            ))}
                        </>
                    )}

                    {/* No params state */}
                    {!hasOptionalParams && optionalPricingSections.length === 0 && (
                        <div className="cm-mirror-pane__no-params">
                            No optional parameters exposed for this model.
                        </div>
                    )}
                </div>
            )}
        </MirrorPaneShell>
    );
}

export function MirrorPaneSkeleton() {
    return (
        <MirrorPaneShell>
            <p className="cm-mirror-pane__param-description">Loading model details...</p>
        </MirrorPaneShell>
    );
}
