/**
 * Enhanced Renderer Component
 * 
 * Renders rich content with support for:
 * - Markdown (GitHub-like)
 * - Syntax-highlighted code blocks with copy button
 * - Mermaid diagrams
 * - LaTeX/KaTeX math expressions
 * - Video/Audio embedding (YouTube, direct files)
 * - Link previews
 */
import React, { useState, useEffect, memo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";

// Initialize Mermaid with dark theme
mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    themeVariables: {
        primaryColor: "#06b6d4",
        primaryTextColor: "#fff",
        primaryBorderColor: "#0891b2",
        lineColor: "#64748b",
        secondaryColor: "#6366f1",
        tertiaryColor: "#1e1e1e",
        background: "#1e1e1e",
        mainBkg: "#1e1e1e",
        nodeBorder: "#0891b2",
    },
});

interface RendererProps {
    content: string;
    className?: string;
}

// =============================================================================
// Mermaid Diagram Component
// =============================================================================

function MermaidDiagram({ code }: { code: string }) {
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string>("");

    useEffect(() => {
        const renderDiagram = async () => {
            try {
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const { svg } = await mermaid.render(id, code);
                setSvg(svg);
                setError("");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to render diagram");
            }
        };
        renderDiagram();
    }, [code]);

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 my-3">
                <p className="text-red-400 text-sm">Diagram error: {error}</p>
                <pre className="text-xs text-zinc-500 mt-2 overflow-auto">{code}</pre>
            </div>
        );
    }

    return (
        <div
            className="my-3 p-4 bg-zinc-900 rounded-lg overflow-auto flex justify-center"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}

// =============================================================================
// Video/Audio Embedding
// =============================================================================

function MediaEmbed({ url }: { url: string }) {
    // YouTube
    const youtubeMatch = url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
    );
    if (youtubeMatch) {
        return (
            <div className="my-3 aspect-video rounded-lg overflow-hidden">
                <iframe
                    src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
        );
    }

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
        return (
            <div className="my-3 aspect-video rounded-lg overflow-hidden">
                <iframe
                    src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                    className="w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                />
            </div>
        );
    }

    // Direct video files
    if (/\.(mp4|webm|ogg)$/i.test(url)) {
        return (
            <video controls className="my-3 w-full rounded-lg">
                <source src={url} />
                Your browser does not support video.
            </video>
        );
    }

    // Audio files
    if (/\.(mp3|wav|ogg|m4a)$/i.test(url)) {
        return (
            <audio controls className="my-3 w-full">
                <source src={url} />
                Your browser does not support audio.
            </audio>
        );
    }

    return null;
}

// =============================================================================
// Link Preview Component
// =============================================================================

function LinkPreview({ url, children }: { url: string; children: React.ReactNode }) {
    const [expanded, setExpanded] = useState(false);

    // Extract domain for display
    let domain = "";
    try {
        domain = new URL(url).hostname.replace("www.", "");
    } catch {
        domain = url;
    }

    // Check if it's a media link first
    const media = MediaEmbed({ url });
    if (media) return media;

    return (
        <span className="inline">
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 inline-flex items-center gap-1"
            >
                {children}
                <ExternalLink className="w-3 h-3 inline" />
            </a>
        </span>
    );
}

// =============================================================================
// Code Block Component
// =============================================================================

function CodeBlock({
    inline,
    className,
    children,
    ...props
}: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
}) {
    const [copied, setCopied] = useState(false);

    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const codeString = String(children).replace(/\n$/, "");

    const handleCopy = async () => {
        await navigator.clipboard.writeText(codeString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Inline code
    if (inline) {
        return (
            <code
                className="bg-zinc-800 text-cyan-300 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
            >
                {children}
            </code>
        );
    }

    // Mermaid diagrams
    if (language === "mermaid") {
        return <MermaidDiagram code={codeString} />;
    }

    // Regular code block
    return (
        <div className="relative group my-3">
            <div className="absolute right-2 top-2 flex items-center gap-2 z-10">
                {language && (
                    <span className="text-xs text-zinc-500 font-mono uppercase">
                        {language}
                    </span>
                )}
                <button
                    onClick={handleCopy}
                    className="p-1.5 rounded bg-zinc-700/80 hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                    title="Copy code"
                >
                    {copied ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                        <Copy className="w-3.5 h-3.5" />
                    )}
                </button>
            </div>

            <SyntaxHighlighter
                style={oneDark}
                language={language || "text"}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    fontSize: "0.875rem",
                    background: "rgb(30 30 30)",
                }}
                {...props}
            >
                {codeString}
            </SyntaxHighlighter>
        </div>
    );
}

// =============================================================================
// Main Renderer
// =============================================================================

function RendererInner({ content, className }: RendererProps) {
    if (!content) {
        return <span className="text-zinc-500">...</span>;
    }

    return (
        <div className={cn("renderer-content text-sm", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    code: CodeBlock as any,

                    // Headings
                    h1: ({ children }) => (
                        <h1 className="text-xl font-bold mt-4 mb-2 text-white">{children}</h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-lg font-semibold mt-3 mb-2 text-white">{children}</h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-base font-semibold mt-2 mb-1 text-white">{children}</h3>
                    ),

                    // Paragraphs
                    p: ({ children }) => (
                        <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                    ),

                    // Lists
                    ul: ({ children }) => (
                        <ul className="list-disc list-inside mb-2 space-y-1 pl-2">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal list-inside mb-2 space-y-1 pl-2">{children}</ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,

                    // Links - with media detection
                    a: ({ href, children }) => {
                        if (href) {
                            return <LinkPreview url={href}>{children}</LinkPreview>;
                        }
                        return <span>{children}</span>;
                    },

                    // Images
                    img: ({ src, alt }) => (
                        <img
                            src={src}
                            alt={alt || "Image"}
                            className="max-w-full rounded-lg my-2"
                            loading="lazy"
                        />
                    ),

                    // Tables
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-3">
                            <table className="w-full border-collapse border border-zinc-700 text-sm">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-zinc-800">{children}</thead>,
                    th: ({ children }) => (
                        <th className="border border-zinc-700 px-3 py-2 text-left font-semibold text-white">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="border border-zinc-700 px-3 py-2">{children}</td>
                    ),
                    tr: ({ children }) => <tr className="even:bg-zinc-800/50">{children}</tr>,

                    // Blockquotes
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-cyan-500 pl-4 my-2 italic text-zinc-400">
                            {children}
                        </blockquote>
                    ),

                    // Horizontal rule
                    hr: () => <hr className="border-zinc-700 my-4" />,

                    // Text formatting
                    strong: ({ children }) => (
                        <strong className="font-semibold text-white">{children}</strong>
                    ),
                    em: ({ children }) => <em className="italic">{children}</em>,
                    del: ({ children }) => (
                        <del className="line-through text-zinc-500">{children}</del>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

// Export both names for compatibility
export const Renderer = memo(RendererInner);
export const MarkdownRenderer = Renderer;
