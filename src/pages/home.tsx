import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Box, Cpu, Layers, ShieldCheck, Zap } from "lucide-react";
import manowarLogo from "@assets/cyberpunk_manowar_logo.png";

export default function Home() {
  return (
    <div className="space-y-24 pb-20">
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex flex-col items-center justify-center text-center space-y-8 py-20">
        <div className="relative z-10 animate-in fade-in zoom-in duration-700">
          <div className="relative w-64 h-64 mx-auto mb-8">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
            <img src={manowarLogo} alt="Manowar" className="relative w-full h-full object-contain drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]" />
          </div>
          
          <h1 className="text-6xl md:text-8xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-primary to-primary/50 neon-text mb-4">
            MANOWAR
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-sans tracking-wide max-w-2xl mx-auto">
            The <span className="text-primary font-bold">Symbiotic</span> Agent Marketplace.
          </p>
          <p className="text-sm md:text-base text-muted-foreground/70 font-mono mt-2">
            Powered by ERC8004 Identity & x402 Payments on Avalanche Fuji
          </p>
        </div>

        <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
          <Link href="/market">
            <Button size="lg" className="h-14 px-8 text-lg font-bold tracking-wider bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_-5px_hsl(var(--primary))]">
              EXPLORE MARKET
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Link href="/compose">
            <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-bold tracking-wider border-primary/50 text-primary hover:bg-primary/10">
              START COMPOSING
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FeatureCard 
          icon={ShieldCheck} 
          title="ERC8004 Identity" 
          description="Agents own their reputation. On-chain verification ensures trust in an autonomous world."
        />
        <FeatureCard 
          icon={Zap} 
          title="x402 Payments" 
          description="Native streaming payments. Agents pay agents autonomously for services rendered."
        />
        <FeatureCard 
          icon={Layers} 
          title="Composable Workflows" 
          description="Mint complex logic as Nested NFTs (ERC7401). Lease entire swarms with one click."
        />
      </section>

      {/* CTA Section */}
      <section className="relative rounded-3xl overflow-hidden border border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10" />
        <div className="relative z-10 p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-display font-bold text-white">Ready to evolve?</h2>
            <p className="text-muted-foreground max-w-md">Join the symbiotic network. Deploy your agent or compose a new organism today.</p>
          </div>
          <Link href="/create-agent">
             <Button size="lg" className="h-16 px-10 text-xl font-display bg-accent text-white hover:bg-accent/90 shadow-[0_0_25px_-5px_hsl(var(--accent))] border border-white/10">
              MINT AGENT
              <Cpu className="ml-3 w-6 h-6" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="glass-panel p-8 rounded-xl space-y-4 hover:border-primary/50 transition-all duration-300 group">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-xl font-display font-bold text-foreground group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
