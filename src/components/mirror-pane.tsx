/**
 * Mirror Pane Component
 *
 * Side panel showing model details (pricing, limits, I/O) and settings (system prompt, tools).
 * 
 * Styling: uses @compose-market/theme BEM classes (cm-mirror-pane*).
 */
import { useState } from "react";
import {
    ComposeMirrorPane,
    ComposeMirrorPricing,
    ComposeMirrorRow,
    ComposeMirrorSection,
} from "@compose-market/theme/mirror";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Cpu,
    LayoutGrid,
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
        const stringValue = value === undefined ? "" : String(value);
        return (
            <Select value={stringValue} onValueChange={onChange as (value: string) => void}>
                <SelectTrigger className="cm-mirror-pane__field">
                    <SelectValue placeholder={`Select ${key}`} />
                </SelectTrigger>
                <SelectContent>
                    {definition.options.map((option) => (
                        <SelectItem key={`${key}-${option}`} value={String(option)}>
                            {String(option)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    if (definition.type === "boolean") {
        return (
            <div className="cm-mirror-pane__tool-toggle">
                <span className="cm-mirror-pane__param-description">{definition.description || key}</span>
                <Switch checked={Boolean(value)} onCheckedChange={onChange as (checked: boolean) => void} />
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
            <ComposeMirrorPane
                empty
                emptyIcon={<Cpu />}
                emptyText="Select a model to inspect pricing, limits, and settings"
            />
        );
    }

    return (
        <TooltipProvider>
            <ComposeMirrorPane
                title={modelInfo?.name || selectedModel}
                subtitle={(
                    <>
                        {modelInfo?.provider || "unknown"}
                        {modelInfo?.modelId ? (
                            <span className="cm-mirror-pane__model-id"> ({modelInfo.modelId})</span>
                        ) : null}
                    </>
                )}
                icon={<Cpu />}
                badges={typeValues.map((value) => ({
                    label: formatModelTypeLabel(value),
                    tone: "fuchsia" as const,
                }))}
                tabs={[
                    { id: "details", label: "Details", icon: <LayoutGrid />, tone: "cyan" },
                    { id: "custom", label: "Custom", icon: <Settings />, tone: "fuchsia" },
                ]}
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab === "custom" ? "custom" : "details")}
            >
                {activeTab === "details" && (
                    <>
                            {modelInfo?.description && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <p className="cm-mirror-pane__description cm-mirror-pane__description--clamped">
                                            {modelInfo.description}
                                        </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                                        {modelInfo.description}
                                    </TooltipContent>
                                </Tooltip>
                            )}

                            {modelInfo && (
                                <>
                                    {(inputValues.length > 0 || outputValues.length > 0) && (
                                        <ComposeMirrorSection>
                                            {inputValues.length > 0 && (
                                                <div className="cm-mirror-pane__io-row">
                                                    <span className="cm-mirror-pane__io-label">IN</span>
                                                    <div className="cm-mirror-pane__io-badges">
                                                        {inputValues.map((value) => (
                                                            <span key={`in-${value}`} className="cm-mirror-pane__badge" data-tone="cyan">
                                                                {value}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {outputValues.length > 0 && (
                                                <div className="cm-mirror-pane__io-row">
                                                    <span className="cm-mirror-pane__io-label">OUT</span>
                                                    <div className="cm-mirror-pane__io-badges">
                                                        {outputValues.map((value) => (
                                                            <span key={`out-${value}`} className="cm-mirror-pane__badge" data-tone="fuchsia">
                                                                {value}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </ComposeMirrorSection>
                                    )}

                                    {contextEntries.length > 0 && (
                                        <ComposeMirrorSection label="Context Window">
                                            <div className="cm-mirror-pane__kv-grid">
                                                {contextEntries.map((entry) => (
                                                    <ComposeMirrorRow
                                                        key={`ctx-${entry.label}`}
                                                        label={entry.label}
                                                        value={entry.value}
                                                    />
                                                ))}
                                            </div>
                                        </ComposeMirrorSection>
                                    )}

                                    {pricingSections.length > 0 && (
                                        <ComposeMirrorSection label="Pricing">
                                            {pricingSections.map((section, index) => (
                                                <ComposeMirrorPricing key={`price-${section.header}-${index}`} unit={section.unit}>
                                                    {section.entries.map((entry) => (
                                                        <ComposeMirrorRow
                                                            key={`${section.header}-${entry.label}`}
                                                            label={entry.label}
                                                            value={entry.value}
                                                        />
                                                    ))}
                                                </ComposeMirrorPricing>
                                            ))}
                                        </ComposeMirrorSection>
                                    )}
                                </>
                            )}
                    </>
                )}

                {activeTab === "custom" && (
                        <div className="cm-mirror-pane__custom-content">
                            <div className="cm-mirror-pane__custom-section">
                                <Label className="cm-mirror-pane__section-label">SYSTEM PROMPT</Label>
                                <Textarea
                                    value={systemPrompt}
                                    onChange={(event) => onSystemPromptChange(event.target.value)}
                                    placeholder="Optional system prompt..."
                                    className="cm-mirror-pane__text-area"
                                />
                            </div>

                            {/* Optional Pricing */}
                            {optionalPricingSections.length > 0 && (
                                <div className="cm-mirror-pane__tool-group cm-mirror-pane__tool-group--fuchsia">
                                    <Label className="cm-mirror-pane__tool-group-label">OPTIONAL PRICING</Label>
                                    <div className="cm-mirror-pane__custom-content">
                                        {optionalPricingSections.map((section, index) => (
                                            <div key={`${section.header}-${section.unit}-${index}`} className="cm-mirror-pane__pricing-block">
                                                <div className="cm-mirror-pane__pricing-header">
                                                    <span className="cm-mirror-pane__pricing-name">{section.header}</span>
                                                    {section.unit && (
                                                        <span className="cm-mirror-pane__badge" data-tone="fuchsia">
                                                            {section.unit}
                                                        </span>
                                                    )}
                                                </div>
                                                {section.entries.map((entry) => (
                                                    <ComposeMirrorRow
                                                        key={`${section.header}-${entry.label}`}
                                                        label={entry.label}
                                                        value={entry.value}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* No params state */}
                            {!hasOptionalParams && optionalPricingSections.length === 0 && (
                                <div className="cm-mirror-pane__no-params">
                                    No optional parameters exposed for this model.
                                </div>
                            )}

                            {/* Dynamic model params */}
                            {hasOptionalParams && modelParams && (
                                <>
                                    {Object.entries(modelParams.params).filter(([, definition]) => definition.required !== true).map(([key, definition]) => (
                                        <div key={key} className="cm-mirror-pane__custom-section">
                                            <Label className="cm-mirror-pane__section-label">
                                                {key}
                                            </Label>
                                            {renderParamInput(
                                                key,
                                                definition,
                                                paramValues[key],
                                                (nextValue) => onParamValuesChange?.({ ...paramValues, [key]: nextValue }),
                                            )}
                                            {definition.description && (
                                                <p className="cm-mirror-pane__param-description">{definition.description}</p>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                )}
            </ComposeMirrorPane>
        </TooltipProvider>
    );
}

export function MirrorPaneSkeleton() {
    return (
        <ComposeMirrorPane>
            <p className="cm-mirror-pane__param-description">Loading model details...</p>
        </ComposeMirrorPane>
    );
}
