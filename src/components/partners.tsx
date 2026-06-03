import { useRef, useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

function scheduleDeferredRender(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    const id = idleWindow.requestIdleCallback(callback, { timeout: 1_500 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }

  const timeoutId = globalThis.setTimeout(callback, 600);
  return () => globalThis.clearTimeout(timeoutId);
}

/* ── Partnership Badge ─────────────────────────────────────────────── */

interface PartnershipBadgeProps {
  src: string;
  alt: string;
  className?: string;
  glowColor?: "cyan" | "green" | "purple" | "blue";
  link?: string;
}

export function PartnershipBadge({
  src,
  alt,
  className,
  glowColor = "cyan",
  link,
}: PartnershipBadgeProps) {
  const content = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
    />
  );

  if (link) {
    return <a href={link} target="_blank" rel="noopener noreferrer" className={cn("cm-partner-badge", className)} data-tone={glowColor}>{content}</a>;
  }

  return <div className={cn("cm-partner-badge", className)} data-tone={glowColor}>{content}</div>;
}

/* ── Partner Logo Data ─────────────────────────────────────────────── */

interface PartnerLogo {
  src: string;
  alt: string;
  name: string;
}

const partnerLogos: PartnerLogo[] = [
  { src: "/partners/11labs.png", alt: "ElevenLabs", name: "ElevenLabs" },
  { src: "/partners/aiven.png", alt: "AIven", name: "AIven" },
  { src: "/partners/algolia.svg", alt: "Algolia", name: "Algolia" },
  { src: "/partners/alibaba.png", alt: "Alibaba Cloud", name: "Alibaba Cloud" },
  { src: "/partners/anam.png", alt: "Anam", name: "Anam" },
  { src: "/partners/apify.svg", alt: "Apify", name: "Apify" },
  { src: "/partners/asicloud.png", alt: "ASI:Cloud", name: "ASI:Cloud" },
  { src: "/partners/avalanche.svg", alt: "Avalanche", name: "Avalanche" },
  { src: "/partners/azure-ai.png", alt: "Azure AI", name: "Azure AI" },
  { src: "/partners/cartesia.png", alt: "Cartesia", name: "Cartesia" },
  // { src: "/partners/chaingpt.png", alt: "ChainGPT", name: "ChainGPT" },
  { src: "/partners/chroma.png", alt: "ChromaDB", name: "ChromaDB" },
  { src: "/partners/cloudflare.png", alt: "Cloudflare", name: "Cloudflare" },
  { src: "/partners/composio.png", alt: "Composio", name: "Composio" },
  { src: "/partners/confluent.png", alt: "Confluent", name: "Confluent" },
  { src: "/partners/confidence.png", alt: "Confidence", name: "Confidence" },
  // { src: "/partners/contextual-ai.png", alt: "Contextual AI", name: "Contextual AI" },
  { src: "/partners/couchbase.png", alt: "Couchbase", name: "Couchbase" },
  { src: "/partners/datadog.png", alt: "Datadog", name: "Datadog" },
  { src: "/partners/daytona.svg", alt: "Daytona", name: "Daytona" },
  { src: "/partners/deepgram.png", alt: "Deepgram", name: "Deepgram" },
  { src: "/partners/digitalocean.png", alt: "DigitalOcean", name: "DigitalOcean" },
  // { src: "/partners/fal.png", alt: "Fal AI", name: "Fal AI" },
  { src: "/partners/fireworks-ai.png", alt: "Fireworks AI", name: "Fireworks AI" },
  // { src: "/partners/framer.png", alt: "Framer", name: "Framer" },
  // { src: "/partners/huggingface.png", alt: "Hugging Face", name: "Hugging Face" },
  { src: "/partners/intercom.png", alt: "Intercom", name: "Intercom" },
  { src: "/partners/lambda.png", alt: "Lambda AI", name: "Lambda AI" },
  // { src: "/partners/langchain.png", alt: "LangChain", name: "LangChain" },
  { src: "/partners/linkup.png", alt: "Linkup", name: "Linkup" },
  { src: "/partners/massive.png", alt: "Massive", name: "Massive" },
  { src: "/partners/mem0.png", alt: "Mem0", name: "Mem0" },
  { src: "/partners/mixpanel.png", alt: "Mixpanel", name: "Mixpanel" },
  { src: "/partners/modal.png", alt: "Modal", name: "Modal" },
  { src: "/partners/mongodb.png", alt: "MongoDB", name: "MongoDB" },
  { src: "/partners/neo4j.png", alt: "Neo4j", name: "Neo4j" },
  { src: "/partners/neon.png", alt: "Neon", name: "Neon" },
  { src: "/partners/nvidia.png", alt: "NVIDIA", name: "NVIDIA" },
  { src: "/partners/openai.png", alt: "OpenAI", name: "OpenAI" },
  { src: "/partners/perplexity.png", alt: "Perplexity", name: "Perplexity" },
  { src: "/partners/posthog.png", alt: "PostHog", name: "PostHog" },
  // { src: "/partners/qdrant.svg", alt: "Qdrant", name: "Qdrant" },
  { src: "/partners/quicknode.png", alt: "Quicknode", name: "Quicknode" },
  { src: "/partners/redis.png", alt: "Redis", name: "Redis" },
  { src: "/partners/roboflow.png", alt: "Roboflow", name: "Roboflow" },
  { src: "/partners/telnyx.png", alt: "Telnyx", name: "Telnyx" },
  { src: "/partners/temporal.png", alt: "Temporal", name: "Temporal" },
  { src: "/partners/thirdweb.png", alt: "Thirdweb", name: "Thirdweb" },
  { src: "/partners/vertex-ai.png", alt: "Vertex AI", name: "Vertex AI" },
];

/* ── Infinite Marquee ──────────────────────────────────────────────── */

function LogoItem({ logo }: { logo: PartnerLogo }) {
  return (
    <div className="cm-partner-logo">
      <img
        src={logo.src}
        alt={logo.alt}
        title={logo.name}
        draggable={false}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
    </div>
  );
}

function PartnerLogoMarquee() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Split logos into two rows for visual interest
  const midpoint = Math.ceil(partnerLogos.length / 2);
  const topLogos = partnerLogos.slice(0, midpoint);
  const bottomLogos = partnerLogos.slice(midpoint);

  return (
    <div
      ref={containerRef}
      className="cm-partner-marquee"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* Top row — scrolls left */}
      <div className="flex w-max">
        <div
          className="marquee-track flex gap-2.5 sm:gap-3"
          style={{
            animationDuration: "80s",
            animationPlayState: isPaused ? "paused" : "running",
          } as CSSProperties}
        >
          {topLogos.map((logo, i) => (
            <LogoItem key={`top-a-${i}`} logo={logo} />
          ))}
          {/* Duplicate for seamless loop */}
          {topLogos.map((logo, i) => (
            <LogoItem key={`top-b-${i}`} logo={logo} />
          ))}
        </div>
      </div>

      {/* Bottom row — scrolls right (reverse direction) */}
      <div className="flex w-max mt-2.5 sm:mt-3">
        <div
          className="marquee-track-reverse flex gap-2.5 sm:gap-3"
          style={{
            animationDuration: "90s",
            animationPlayState: isPaused ? "paused" : "running",
          } as CSSProperties}
        >
          {bottomLogos.map((logo, i) => (
            <LogoItem key={`bot-a-${i}`} logo={logo} />
          ))}
          {/* Duplicate for seamless loop */}
          {bottomLogos.map((logo, i) => (
            <LogoItem key={`bot-b-${i}`} logo={logo} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Partnership Section ───────────────────────────────────────────── */

export function PartnershipSection({ className }: { className?: string }) {
  const [showMarquee, setShowMarquee] = useState(false);

  useEffect(() => {
    return scheduleDeferredRender(() => {
      setShowMarquee(true);
    });
  }, []);

  return (
    <section className={cn("cm-partners w-full", className)}>
      {/* Badges row — "Backed by" text (1/4 left) + badges (3/4 right) */}
      <div className="cm-glass neon-border w-full">
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-3 sm:py-4 md:py-5">
          <div className="cm-partners__backing">
            {/* Left — "Backed By" title — takes ~1/4 */}
            <div className="cm-partners__copy">
              <span className="cm-partners__label">Backed By</span>
              <div className="cm-partners__title">
                THE LEADERS BUILDING AI
              </div>
            </div>

            {/* Right — Badge images (equal sized) — takes ~2/4 */}
            <div className="cm-partners__badges">
              <PartnershipBadge
                src="/partners/badges/nvidia-badge.png"
                alt="NVIDIA Inception Program"
                glowColor="green"
                link="https://www.nvidia.com/en-us/startups/"
                className="w-full h-full"
              />
              <PartnershipBadge
                src="/partners/badges/microsoft-badge.png"
                alt="Microsoft for Startups"
                glowColor="blue"
                link="https://www.microsoft.com/en-us/startups"
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Partner logos marquee — full width, edge to edge */}
      <div className="w-full py-3 sm:py-4 md:py-5 pb-4 sm:pb-5 md:pb-6">
        {showMarquee ? (
          <PartnerLogoMarquee />
        ) : (
          <div
            aria-hidden="true"
            className="h-[5.25rem] sm:h-[5.75rem] md:h-[6.25rem] w-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent"
          />
        )}
      </div>
    </section>
  );
}
