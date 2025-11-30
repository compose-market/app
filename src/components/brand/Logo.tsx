import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

/**
 * The Compose.Market Logo
 * Abstract "C" / "M" formed by connected nodes
 */
export function ComposeLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" className={cn("fill-none stroke-current", className)}>
      {/* Abstract construct representing composition */}
      <path d="M30 30 L30 70 L70 70" className="stroke-cyan-400" strokeWidth="4" strokeLinecap="round" />
      <path d="M70 30 L70 50" className="stroke-fuchsia-500" strokeWidth="4" strokeLinecap="round" />
      
      {/* Connection Nodes */}
      <circle cx="30" cy="30" r="6" className="fill-cyan-950 stroke-cyan-400" strokeWidth="2" />
      <circle cx="30" cy="70" r="6" className="fill-cyan-950 stroke-cyan-400" strokeWidth="2" />
      <circle cx="70" cy="70" r="6" className="fill-cyan-950 stroke-cyan-400" strokeWidth="2" />
      <circle cx="70" cy="30" r="6" className="fill-cyan-950 stroke-fuchsia-500" strokeWidth="2" />
      
      {/* Digital Grid Elements */}
      <path d="M30 30 L70 30" className="stroke-cyan-500/30" strokeWidth="1" strokeDasharray="4 4" />
      <path d="M70 70 L70 50" className="stroke-fuchsia-500/50" strokeWidth="1" />
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
  as?: keyof JSX.IntrinsicElements;
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

