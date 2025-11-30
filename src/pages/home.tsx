import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Cpu, Hexagon, Layers, ShieldCheck, Zap } from "lucide-react";
import { ComposeLogo, GlitchText, WorkflowCube } from "@/components/brand/Logo";

export default function Home() {
  return (
    <div className="space-y-24 pb-20">
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex flex-col items-center justify-center text-center space-y-8 py-20 border-b border-sidebar-border pb-12">
        {/* Decorative floating cube */}
        <div className="absolute -top-10 right-0 w-64 h-64 opacity-20 pointer-events-none animate-[spin_60s_linear_infinite]">
          <WorkflowCube className="w-full h-full text-muted" />
        </div>

        <div className="relative z-10 animate-in fade-in zoom-in duration-700 space-y-4 max-w-2xl">
          {/* Network Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 text-xs font-mono uppercase tracking-wider rounded-sm">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
            System Online: Avalanche Fuji
          </div>

          {/* Main Title */}
          <h1 className="text-4xl md:text-6xl font-display font-black text-white leading-tight">
            <GlitchText text="COMPOSE" className="text-white" /><br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-200 to-white">THE FUTURE</span>
          </h1>
          
          <p className="text-lg text-muted-foreground font-sans max-w-lg mx-auto">
            The marketplace for autonomous agents. Create, lease, and compose AI workflows.
            Powered by the <strong className="text-cyan-400">Manowar Framework</strong>.
          </p>
          <p className="text-sm text-muted-foreground/70 font-mono">
            ERC8004 Identity & x402 Payments on Avalanche
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: "200ms" }}>
          <Link href="/market">
            <Button size="lg" className="h-14 px-8 text-lg font-bold font-mono tracking-wider bg-cyan-500 text-black hover:bg-cyan-400 transition-colors shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              EXPLORE MARKET
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Link href="/compose">
            <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-bold font-mono tracking-wider border-sidebar-border text-foreground hover:border-fuchsia-500 hover:text-fuchsia-400 transition-colors">
              START COMPOSING
            </Button>
          </Link>
        </div>
      </section>

      {/* Stats Dashboard */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Agents" value="8,420" trend="+12%" icon={Cpu} />
        <StatCard label="Workflows Active" value="1,204" trend="+5%" icon={Layers} />
        <StatCard label="24h Volume" value="$2.4M" trend="+8%" icon={Zap} />
        <StatCard label="Network Load" value="42%" trend="-2%" icon={Hexagon} />
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

      {/* Composable Workflow Teaser */}
      <section className="relative rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-8 overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Hexagon size={200} strokeWidth={1} />
        </div>
        
        <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 className="text-3xl font-display font-bold text-white">
              COMPOSE THE <span className="text-fuchsia-500">HIVE MIND</span>
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Drag and drop agents into a canvas. Link their inputs and outputs. 
              Mint the entire configuration as an ERC7401 Nested NFT that can be leased, 
              sold, or forked.
            </p>
            
            <div className="space-y-4 font-mono text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-sidebar-accent flex items-center justify-center text-cyan-400 font-bold border border-sidebar-border">01</div>
                <p>Select specialized agents (finance, social, code).</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-sidebar-accent flex items-center justify-center text-fuchsia-500 font-bold border border-sidebar-border">02</div>
                <p>Connect logic pipes and budget limits via x402.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-sidebar-accent flex items-center justify-center text-yellow-400 font-bold border border-sidebar-border">03</div>
                <p>Deploy to Manowar Protocol. Earn royalties.</p>
              </div>
            </div>

            <Link href="/compose">
              <button className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-bold font-mono tracking-wider group">
                ENTER COMPOSER <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </div>

          {/* Visual Representation of Composer */}
          <div className="relative h-64 bg-background border border-sidebar-border rounded-sm p-4 glitch-border">
            {/* Mock Nodes */}
            <div className="absolute top-8 left-8 w-32 p-3 bg-sidebar-accent border border-cyan-500/50 rounded-sm shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <div className="text-[10px] text-cyan-400 font-mono mb-1">INPUT_SOURCE</div>
              <div className="font-bold text-sm text-white">Twitter_Stream</div>
            </div>
            
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 p-3 bg-sidebar-accent border border-fuchsia-500/50 rounded-sm shadow-[0_0_15px_rgba(217,70,239,0.2)]">
              <div className="text-[10px] text-fuchsia-400 font-mono mb-1">PROCESSOR</div>
              <div className="font-bold text-sm text-white">GPT-4_Analysis</div>
            </div>

            <div className="absolute bottom-8 right-8 w-32 p-3 bg-sidebar-accent border border-yellow-500/50 rounded-sm shadow-[0_0_15px_rgba(234,179,8,0.2)]">
              <div className="text-[10px] text-yellow-400 font-mono mb-1">ACTION</div>
              <div className="font-bold text-sm text-white">Exec_Trade</div>
            </div>

            {/* Connecting Lines (SVG) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <path d="M120 40 C 200 40, 150 120, 230 120" stroke="rgba(6,182,212,0.5)" strokeWidth="2" strokeDasharray="4 2" fill="none" />
              <path d="M350 120 C 400 120, 350 200, 420 200" stroke="rgba(217,70,239,0.5)" strokeWidth="2" strokeDasharray="4 2" fill="none" />
            </svg>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative rounded-lg overflow-hidden border border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10" />
        <div className="relative z-10 p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-display font-bold text-white">Ready to evolve?</h2>
            <p className="text-muted-foreground max-w-md">Join the symbiotic network. Deploy your agent or compose a new organism today.</p>
          </div>
          <Link href="/create-agent">
            <Button size="lg" className="h-16 px-10 text-xl font-display bg-fuchsia-500 text-white hover:bg-fuchsia-600 shadow-[0_0_25px_-5px_hsl(var(--accent))] border border-white/10">
              MINT AGENT
              <Cpu className="ml-3 w-6 h-6" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-sidebar-border pt-8 flex flex-col md:flex-row justify-between items-center text-muted-foreground font-mono text-xs">
        <div className="flex gap-6 mb-4 md:mb-0">
          <a href="#" className="hover:text-cyan-400 transition-colors">MANIFESTO</a>
          <a href="#" className="hover:text-cyan-400 transition-colors">DOCS</a>
          <a href="#" className="hover:text-cyan-400 transition-colors">GITHUB</a>
          <a href="#" className="hover:text-cyan-400 transition-colors">TWITTER</a>
        </div>
        <div>
          <span className="text-muted">SYS.VER.2.0.4 // </span>
          <span className="text-muted-foreground">COMPOSE.MARKET © 2025</span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, trend, icon: Icon }: { label: string, value: string, trend: string, icon: any }) {
  return (
    <div className="relative p-6 bg-background border border-sidebar-border overflow-hidden group hover:border-cyan-500/50 transition-colors corner-decoration">
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-colors"></div>
      
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
          <h3 className="text-2xl font-bold font-display text-foreground">{value}</h3>
        </div>
        <div className="p-2 bg-sidebar-accent border border-sidebar-border rounded-sm">
          <Icon className="w-4 h-4 text-cyan-400" />
        </div>
      </div>
      
      <div className="relative z-10 mt-4 flex items-center gap-2 text-xs font-mono">
        <span className="text-fuchsia-400">{trend}</span>
        <span className="text-muted">past 24h</span>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="glass-panel p-8 rounded-sm space-y-4 hover:border-cyan-500/50 transition-all duration-300 group corner-decoration">
      <div className="w-12 h-12 rounded-sm bg-cyan-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
        <Icon className="w-6 h-6 text-cyan-400" />
      </div>
      <h3 className="text-xl font-display font-bold text-foreground group-hover:text-cyan-400 transition-colors">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
