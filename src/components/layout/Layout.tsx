import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Menu, X } from "lucide-react";
import { ComposeLogo } from "@/components/brand/Logo";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Parallax effect on mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-fuchsia-500/30 selection:text-fuchsia-200 overflow-x-hidden">
      {/* Background Grid Layer with Parallax */}
      <div 
        className="fixed inset-0 bg-grid-pattern pointer-events-none z-0" 
        style={{ transform: `translate(${mousePos.x * 10}px, ${mousePos.y * 10}px)` }}
      />
      
      {/* Gradient Overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-background via-transparent to-background z-0 pointer-events-none" />
      
      {/* Scanline Effect */}
      <div className="scanline fixed inset-0 z-50 pointer-events-none" />

      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar */}
      <aside className={`fixed md:hidden w-64 h-full bg-background/95 border-r border-sidebar-border flex flex-col backdrop-blur-md transition-transform duration-300 z-40 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-sidebar-border flex items-center gap-3">
          <ComposeLogo className="w-10 h-10 text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
          <div>
            <h1 className="font-display font-black text-xl tracking-tighter text-foreground leading-none">
              COMPOSE<br/>
              <span className="text-cyan-400">.MARKET</span>
            </h1>
            <p className="font-mono text-[8px] text-fuchsia-500 tracking-widest mt-1">POWERED BY MANOWAR</p>
          </div>
        </div>
        {/* Mobile nav would go here - using same links as Sidebar */}
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background border-b border-sidebar-border flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <ComposeLogo className="w-8 h-8 text-cyan-400" />
          <span className="font-display font-bold text-white tracking-tight">COMPOSE.MARKET</span>
        </div>
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)} 
          className="p-2 text-muted-foreground border border-sidebar-border rounded-sm hover:border-cyan-500/50 transition-colors"
        >
          {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Desktop TopBar */}
      <div className="hidden md:block">
        <TopBar />
      </div>
      
      {/* Main Content */}
      <main className="md:pl-64 pt-16 min-h-screen relative overflow-hidden">
        <div className="relative z-10 p-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
