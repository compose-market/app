import { useMemo } from "react";
import { Terminal, Target, Users, Shield, FileText, Folder, Receipt, Layers, X } from "lucide-react";

export interface SlashCommand {
    name: string;
    description: string;
    args?: string;
    icon: React.ComponentType<{ className?: string }>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
    {
        name: "plan",
        description: "Create a multi-step plan with tasks",
        args: "<prompt>",
        icon: Layers,
    },
    {
        name: "goal",
        description: "Pin a durable goal the agent works toward",
        args: "<objective>",
        icon: Target,
    },
    {
        name: "mode",
        description: "Switch execution mode",
        args: "solo | swarm",
        icon: Users,
    },
    {
        name: "sandbox",
        description: "Force sandboxed/isolation execution",
        args: "on | off",
        icon: Shield,
    },
    {
        name: "proof",
        description: "Force proof-of-execution mode",
        args: "on | off",
        icon: Shield,
    },
    {
        name: "thread",
        description: "List past conversation threads",
        icon: FileText,
    },
    {
        name: "artifacts",
        description: "List past generated media",
        icon: Folder,
    },
    {
        name: "receipt",
        description: "List x402 payment receipts",
        icon: Receipt,
    },
];

export const selectableSlashCommandNames = ["plan", "goal", "sandbox", "proof"] as const;

const selectableSlashCommandNameSet = new Set<string>(selectableSlashCommandNames);

export function isSelectableSlashCommandName(name: string): boolean {
    return selectableSlashCommandNameSet.has(name.trim().replace(/^\/+/u, "").toLowerCase());
}

export function nextSelectedSlashCommands(selected: string[], name: string): string[] {
    const normalized = name.trim().replace(/^\/+/u, "").toLowerCase();
    if (!isSelectableSlashCommandName(normalized) || selected.includes(normalized)) return selected;
    return [...selected, normalized];
}

export function withoutSelectedSlashCommand(selected: string[], name: string): string[] {
    const normalized = name.trim().replace(/^\/+/u, "").toLowerCase();
    return selected.filter((command) => command !== normalized);
}

export function clearSlashCommandToken(input: string): string {
    if (!input.startsWith("/")) return input;
    return input.replace(/^\/[a-z0-9_-]*\s*/iu, "");
}

function slashCommandQuery(input: string): string | null {
    if (!input.startsWith("/")) return null;
    const parts = input.slice(1).split(/\s+/);
    return parts[0]?.toLowerCase() ?? "";
}

export function slashCommandMatches(input: string): SlashCommand[] {
    const query = slashCommandQuery(input);
    if (query === null) return [];
    if (query === "") return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(query));
}

interface SlashCommandPopoverProps {
    input: string;
    selectedIndex: number;
    onSelect: (command: SlashCommand) => void;
    onHighlight: (index: number) => void;
}

export function SlashCommandPopover({ input, selectedIndex, onSelect, onHighlight }: SlashCommandPopoverProps) {
    const matches = useMemo(() => slashCommandMatches(input), [input]);

    if (matches.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
            <div className="rounded-lg border border-primary/20 bg-popover shadow-lg overflow-hidden">
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/50 flex items-center gap-1.5">
                    <Terminal className="w-3 h-3" />
                    Slash commands
                </div>
                <div className="max-h-64 overflow-y-auto">
                    {matches.map((cmd, index) => {
                        const Icon = cmd.icon;
                        return (
                            <button
                                key={cmd.name}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onSelect(cmd);
                                }}
                                onMouseEnter={() => onHighlight(index)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                    index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-sm font-medium">/{cmd.name}</span>
                                        {cmd.args && (
                                            <span className="text-xs text-muted-foreground font-mono">{cmd.args}</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export function SelectedSlashCommandBadges({
    selected,
    onRemove,
}: {
    selected: string[];
    onRemove: (name: string) => void;
}) {
    if (selected.length === 0) return null;
    return (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {selected.map((name) => (
                <span
                    key={name}
                    className="inline-flex h-6 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 text-xs font-mono text-primary"
                >
                    /{name}
                    <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-primary/80 hover:bg-primary/15 hover:text-primary"
                        aria-label={`Remove /${name}`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemove(name);
                        }}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
        </div>
    );
}

export function isSlashCommand(input: string): boolean {
    return input.startsWith("/") && input.length > 0;
}

export function parseSlashCommand(input: string): { command: string; args: string } | null {
    const match = input.trim().match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
    if (!match) return null;
    return { command: match[1].toLowerCase(), args: (match[2] ?? "").trim() };
}
