import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MOCK_AGENTS, MOCK_WORKFLOWS, Agent, Workflow } from "@/lib/mockData";
import { Cpu, Layers, Star, Zap, User } from "lucide-react";

export default function Market() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-display font-bold text-white neon-text w-fit">MARKETPLACE</h1>
        <p className="text-muted-foreground font-mono">Discover, Buy, and Lease Autonomous Agents & Workflows.</p>
      </div>

      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="bg-sidebar-accent border border-border p-1 mb-8">
          <TabsTrigger value="agents" className="data-[state=active]:bg-primary data-[state=active]:text-black font-bold font-sans tracking-wide px-8">
            AGENTS
          </TabsTrigger>
          <TabsTrigger value="workflows" className="data-[state=active]:bg-accent data-[state=active]:text-white font-bold font-sans tracking-wide px-8">
            WORKFLOWS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MOCK_AGENTS.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {MOCK_WORKFLOWS.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card className="glass-panel border-primary/20 hover:border-primary/60 transition-all duration-300 group overflow-hidden">
      <CardHeader className="p-0">
        <div className="relative h-40 bg-gradient-to-b from-primary/5 to-transparent flex items-center justify-center group-hover:from-primary/10 transition-all">
          <img src={agent.imageUrl} alt={agent.name} className="w-24 h-24 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.4)] group-hover:scale-110 transition-transform duration-500" />
          <Badge className="absolute top-3 right-3 bg-black/50 backdrop-blur border border-primary/30 text-primary font-mono">
            {agent.type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div>
          <div className="flex justify-between items-start mb-1">
            <CardTitle className="text-xl font-display font-bold text-white truncate pr-2">{agent.name}</CardTitle>
            <div className="flex items-center text-yellow-400 text-xs font-bold bg-yellow-400/10 px-2 py-1 rounded">
              <Star className="w-3 h-3 mr-1 fill-current" />
              {agent.reputation}
            </div>
          </div>
          <CardDescription className="line-clamp-2 h-10">{agent.description}</CardDescription>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1 bg-sidebar-accent p-2 rounded">
            <Cpu className="w-3 h-3 text-primary" />
            <span className="truncate">{agent.model}</span>
          </div>
          <div className="flex items-center gap-1 bg-sidebar-accent p-2 rounded">
            <User className="w-3 h-3 text-primary" />
            <span className="truncate">{agent.owner.slice(0,6)}...</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-5 pt-0 flex items-center justify-between border-t border-white/5 mt-2 pt-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Per Use</span>
          <span className="text-lg font-bold text-white font-mono">{agent.pricePerUse} <span className="text-primary text-sm">x402</span></span>
        </div>
        <Button size="sm" className="bg-primary/20 text-primary hover:bg-primary hover:text-black border border-primary/50 font-bold">
          HIRE AGENT
        </Button>
      </CardFooter>
    </Card>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  return (
    <Card className="glass-panel border-accent/20 hover:border-accent/60 transition-all duration-300 group overflow-hidden">
      <CardHeader className="p-5 pb-2">
        <div className="flex justify-between items-start">
          <Badge variant="outline" className="border-accent text-accent font-mono mb-2">ERC7401 NFT</Badge>
          <div className="flex items-center text-yellow-400 text-xs font-bold">
              <Star className="w-3 h-3 mr-1 fill-current" />
              {workflow.rating}
          </div>
        </div>
        <CardTitle className="text-xl font-display font-bold text-white group-hover:text-accent transition-colors">{workflow.name}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2 space-y-4">
        <CardDescription className="line-clamp-2 h-10">{workflow.description}</CardDescription>
        
        <div className="flex -space-x-2 overflow-hidden py-2">
          {workflow.agents.map((id, i) => (
            <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-muted-foreground relative z-10">
              A{i+1}
            </div>
          ))}
          <div className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
            +{workflow.agents.length}
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-5 pt-0 flex items-center justify-between border-t border-white/5 mt-2 pt-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Lease Price</span>
          <span className="text-lg font-bold text-white font-mono">{workflow.price} <span className="text-primary text-sm">USDC</span></span>
        </div>
        <Button size="sm" className="bg-accent text-white hover:bg-accent/90 font-bold shadow-[0_0_15px_-3px_hsl(var(--accent)/0.5)]">
          LEASE FLOW
        </Button>
      </CardFooter>
    </Card>
  );
}
