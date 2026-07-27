import React from "react";
import { cn } from "@/lib/utils";

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * The Compose.Market Logo
 * Translucent glass-circuit nodes with glowing luminescent energy filaments
 * Matching the official favicon and apple-touch-icon.
 */
export function Logo({ className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("fill-none overflow-visible", className)}
      {...props}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="logo-glow-heavy" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="logo-glow-medium" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="logo-glow-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="logo-glow-extreme" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComponentTransfer in="blur" result="boost">
            <feFuncA type="linear" slope="2" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="boost" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Energy Gradients */}
        <linearGradient id="logo-leftTubeGlow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="45%" stopColor="#14b8a6" />
          <stop offset="85%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>

        <linearGradient id="logo-topTubeGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="70%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>

        <linearGradient id="logo-rightTubeGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="35%" stopColor="#ec4899" />
          <stop offset="75%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>

        <linearGradient id="logo-bottomTubeGlow" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="35%" stopColor="#3b82f6" />
          <stop offset="75%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>

        {/* Node Radial Gradients */}
        <radialGradient id="logo-nodeTLGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#083344" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#083344" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="logo-nodeTRGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fce7f3" />
          <stop offset="40%" stopColor="#ec4899" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#831843" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#831843" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="logo-nodeBRGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="40%" stopColor="#6366f1" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#1e1b4b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="logo-nodeBLGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#d1fae5" />
          <stop offset="40%" stopColor="#10b981" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#064e3b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#064e3b" stopOpacity="0" />
        </radialGradient>

        {/* Glass Sheen Gradients */}
        <linearGradient id="logo-glassHorizSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="20%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="80%" stopColor="#000000" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>

        <linearGradient id="logo-glassVertSheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="20%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="80%" stopColor="#000000" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* GLASS CYLINDER TUBE BACKDROPS */}
      <rect x="33" y="20.5" width="34" height="9" fill="url(#logo-glassHorizSheen)" stroke="rgba(255, 255, 255, 0.35)" strokeWidth="0.75" />
      <rect x="33" y="70.5" width="34" height="9" fill="url(#logo-glassHorizSheen)" stroke="rgba(255, 255, 255, 0.35)" strokeWidth="0.75" />
      <rect x="20.5" y="33" width="9" height="34" fill="url(#logo-glassVertSheen)" stroke="rgba(255, 255, 255, 0.35)" strokeWidth="0.75" />
      <rect x="70.5" y="33" width="9" height="34" fill="url(#logo-glassVertSheen)" stroke="rgba(255, 255, 255, 0.35)" strokeWidth="0.75" />

      {/* ENERGY HALO GLOWS */}
      <path d="M 25 75 C 20.5 62, 29.5 48, 24.5 35 C 22.5 29, 25 25, 25 25" fill="none" stroke="url(#logo-leftTubeGlow)" strokeWidth="5" filter="url(#logo-glow-extreme)" opacity="0.85" />
      <line x1="25" y1="25" x2="75" y2="25" stroke="url(#logo-topTubeGlow)" strokeWidth="2" strokeDasharray="4 3" filter="url(#logo-glow-medium)" opacity="0.75" />
      <path d="M 66 25 C 74 24, 76 24, 76 29 C 74 36, 77 46, 75 60 C 73.5 70, 75 75, 75 75" fill="none" stroke="url(#logo-rightTubeGlow)" strokeWidth="5.5" filter="url(#logo-glow-extreme)" opacity="0.9" />
      <path d="M 75 75 C 62 78.5, 48 71.5, 36 76.5 C 29.5 78.5, 25 75, 25 75" fill="none" stroke="url(#logo-bottomTubeGlow)" strokeWidth="5" filter="url(#logo-glow-extreme)" opacity="0.85" />

      {/* NODE INNER ORB GLOW CORES */}
      <circle cx="25" cy="25" r="7.5" fill="url(#logo-nodeTLGrad)" filter="url(#logo-glow-heavy)" />
      <circle cx="75" cy="25" r="8" fill="url(#logo-nodeTRGrad)" filter="url(#logo-glow-heavy)" />
      <circle cx="75" cy="75" r="7.5" fill="url(#logo-nodeBRGrad)" filter="url(#logo-glow-heavy)" />
      <circle cx="25" cy="75" r="7.5" fill="url(#logo-nodeBLGrad)" filter="url(#logo-glow-heavy)" />

      {/* HIGH-INTENSITY CORE FILAMENTS */}
      <path d="M 25 75 C 20.5 62, 29.5 48, 24.5 35 C 22.5 29, 25 25, 25 25" fill="none" stroke="url(#logo-leftTubeGlow)" strokeWidth="2" filter="url(#logo-glow-medium)" />
      <path d="M 25 75 C 20.5 62, 29.5 48, 24.5 35 C 22.5 29, 25 25, 25 25" fill="none" stroke="#f0fdf4" strokeWidth="1" />

      <path d="M 66 25 C 74 24, 76 24, 76 29 C 74 36, 77 46, 75 60 C 73.5 70, 75 75, 75 75" fill="none" stroke="url(#logo-rightTubeGlow)" strokeWidth="2" filter="url(#logo-glow-medium)" />
      <path d="M 66 25 C 74 24, 76 24, 76 29 C 74 36, 77 46, 75 60 C 73.5 70, 75 75, 75 75" fill="none" stroke="#fdf4ff" strokeWidth="1" />

      <path d="M 75 75 C 62 78.5, 48 71.5, 36 76.5 C 29.5 78.5, 25 75, 25 75" fill="none" stroke="url(#logo-bottomTubeGlow)" strokeWidth="2" filter="url(#logo-glow-medium)" />
      <path d="M 75 75 C 62 78.5, 48 71.5, 36 76.5 C 29.5 78.5, 25 75, 25 75" fill="none" stroke="#eff6ff" strokeWidth="1" />

      {/* FLOATING ENERGY PARTICLES */}
      <circle cx="22" cy="65" r="0.9" fill="#a7f3d0" filter="url(#logo-glow-soft)" />
      <circle cx="28" cy="56" r="1.1" fill="#67e8f9" filter="url(#logo-glow-soft)" />
      <circle cx="22" cy="40" r="0.8" fill="#ffffff" />
      <circle cx="27.5" cy="30" r="1" fill="#22d3ee" filter="url(#logo-glow-soft)" />
      <circle cx="73.5" cy="35" r="1" fill="#f472b6" filter="url(#logo-glow-soft)" />
      <circle cx="77.5" cy="64" r="0.9" fill="#a855f7" filter="url(#logo-glow-soft)" />
      <circle cx="43" cy="74.5" r="0.9" fill="#38bdf8" filter="url(#logo-glow-soft)" />
      <circle cx="58" cy="77" r="0.8" fill="#818cf8" filter="url(#logo-glow-soft)" />

      {/* GLASS SPHERE CORNER CHAMBERS */}
      <circle cx="25" cy="25" r="12.5" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="0.9" />
      <circle cx="25" cy="25" r="10" fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="0.6" />
      <ellipse cx="20.5" cy="20.5" rx="3.5" ry="1.8" transform="rotate(-40 20.5 20.5)" fill="#ffffff" opacity="0.8" />

      <circle cx="75" cy="25" r="12.5" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="0.9" />
      <circle cx="75" cy="25" r="10" fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="0.6" />
      <ellipse cx="70.5" cy="20.5" rx="3.5" ry="1.8" transform="rotate(-40 70.5 20.5)" fill="#ffffff" opacity="0.8" />

      <circle cx="75" cy="75" r="12.5" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="0.9" />
      <circle cx="75" cy="75" r="10" fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="0.6" />
      <ellipse cx="70.5" cy="70.5" rx="3.5" ry="1.8" transform="rotate(-40 70.5 70.5)" fill="#ffffff" opacity="0.8" />

      <circle cx="25" cy="75" r="12.5" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="0.9" />
      <circle cx="25" cy="75" r="10" fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="0.6" />
      <ellipse cx="20.5" cy="70.5" rx="3.5" ry="1.8" transform="rotate(-40 20.5 70.5)" fill="#ffffff" opacity="0.8" />

      {/* TUBE GLASS HIGHLIGHT EDGES */}
      <line x1="33" y1="20.5" x2="67" y2="20.5" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
      <line x1="33" y1="70.5" x2="67" y2="70.5" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
      <line x1="20.5" y1="33" x2="20.5" y2="67" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
      <line x1="70.5" y1="33" x2="70.5" y2="67" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
    </svg>
  );
}

/**
 * 3D Asset: The "Workflow Cube"
 * Symbol of Composability
 */
export function WorkflowCube({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" className={cn("stroke-current fill-none", className)}>
      <path d="M50 5 L90 25 L90 70 L50 90 L10 70 L10 25 Z" className="stroke-cyan-500/30" strokeWidth="1" />
      <path d="M50 5 L50 45 M50 90 L50 45 M90 25 L50 45 L10 25" className="stroke-cyan-500/30" strokeWidth="1" />

      {/* Inner "Kernel" */}
      <path d="M50 30 L70 40 L70 60 L50 70 L30 60 L30 40 Z" className="fill-cyan-500/10 stroke-cyan-400" strokeWidth="2" />

      {/* Connection Nodes */}
      <circle cx="50" cy="30" r="2" className="fill-fuchsia-500" />
      <circle cx="70" cy="40" r="2" className="fill-fuchsia-500" />
      <circle cx="30" cy="60" r="2" className="fill-fuchsia-500" />
    </svg>
  );
}

/**
 * GlitchText component for hover glitch effect
 */
interface GlitchTextProps {
  text: string;
  as?: React.ElementType;
  className?: string;
}

export function GlitchText({ text, as: Component = "span", className }: GlitchTextProps) {
  return (
    <Component className={cn("relative inline-block group", className)}>
      <span className="relative z-10">{text}</span>
      <span className="absolute top-0 left-0 -ml-0.5 translate-x-[2px] text-fuchsia-500 opacity-0 group-hover:opacity-70 animate-pulse z-0 mix-blend-screen">
        {text}
      </span>
      <span className="absolute top-0 left-0 -ml-0.5 -translate-x-[2px] text-cyan-500 opacity-0 group-hover:opacity-70 animate-pulse z-0 mix-blend-screen" style={{ animationDelay: "75ms" }}>
        {text}
      </span>
    </Component>
  );
}
