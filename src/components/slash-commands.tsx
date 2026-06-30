import { useMemo, useState, useEffect, useCallback } from "react";
import { Terminal, Target, Users, Shield, FileText, Folder, Receipt, Layers } from "lucide-react";

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

interface SlashCommandPopoverProps {
    input: string;
    onSelect: (command: SlashCommand) => void;
    onDismiss: () => void;
}

export function SlashCommandPopover({ input, onSelect, onDismiss }: SlashCommandPopoverProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const query = useMemo(() => {
        if (!input.startsWith("/")) return null;
        const parts = input.slice(1).split(/\s+/);
        return parts[0]?.toLowerCase() ?? "";
    }, [input]);

    const matches = useMemo(() => {
        if (query === null) return [];
        if (query === "") return SLASH_COMMANDS;
        return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(query));
    }, [query]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (matches.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % matches.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + matches.length) % matches.length);
        } else if (e.key === "Tab" || (e.key === "Enter" && matches.length > 0)) {
            e.preventDefault();
            onSelect(matches[selectedIndex]);
        } else if (e.key === "Escape") {
            e.preventDefault();
            onDismiss();
        }
    }, [matches, selectedIndex, onSelect, onDismiss]);

    useEffect(() => {
        if (query === null || matches.length === 0) return;
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [query, matches, handleKeyDown]);

    if (query === null || matches.length === 0) return null;

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
                                    onSelect(cmd);
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
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

export function isSlashCommand(input: string): boolean {
    return input.startsWith("/") && input.length > 0;
}

export function parseSlashCommand(input: string): { command: string; args: string } | null {
    const match = input.trim().match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
    if (!match) return null;
    return { command: match[1].toLowerCase(), args: (match[2] ?? "").trim() };
}
