import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MOCK_AGENTS, MOCK_WORKFLOWS, Agent, Workflow } from "@/lib/mockData";
import { Activity, Box, Cpu, Layers, Star, Terminal, User, Zap } from "lucide-react";

export default function Market() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-2 border-b border-sidebar-border pb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-display font-bold text-white">
            <span className="text-fuchsia-500 mr-2">//</span>
            LIVE FEED
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-fuchsia-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-sm">Discover, Buy, and Lease Autonomous Agents & Workflows.</p>
      </div>

      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="bg-sidebar-accent border border-sidebar-border p-1 mb-8">
          <TabsTrigger value="agents" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold font-mono tracking-wide px-8">
            AGENTS
          </TabsTrigger>
          <TabsTrigger value="workflows" className="data-[state=active]:bg-fuchsia-500 data-[state=active]:text-white font-bold font-mono tracking-wide px-8">
            WORKFLOWS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
  // Determine icon based on agent type
  const TypeIcon = agent.type === 'Finance' ? Activity : 
                   agent.type === 'Utility' ? Terminal :
                   agent.type === 'Social' ? User : Box;

  return (
    <div className="group relative bg-sidebar-accent/50 border border-sidebar-border hover:border-cyan-500/50 transition-all duration-300 backdrop-blur-sm overflow-hidden">
      {/* Card Header (Image/Preview) */}
      <div className="h-32 bg-background relative overflow-hidden border-b border-sidebar-border group-hover:border-cyan-500/30 transition-colors">
        <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity">
          <div className="w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(6,182,212,0.1)_25%,rgba(6,182,212,0.1)_50%,transparent_50%,transparent_75%,rgba(6,182,212,0.1)_75%,rgba(6,182,212,0.1)_100%)] bg-[length:20px_20px]"></div>
        </div>
        
        <div className="absolute inset-0 flex items-center justify-center">
          <TypeIcon className={`w-12 h-12 transition-colors ${
            agent.type === 'Finance' ? 'text-sidebar-border group-hover:text-cyan-400' : 
            agent.type === 'Utility' ? 'text-sidebar-border group-hover:text-fuchsia-400' :
            'text-sidebar-border group-hover:text-yellow-400'
          }`} />
        </div>

        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/80 border border-sidebar-border text-[10px] font-mono text-foreground">
          ERC8004
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-lg font-bold font-display text-foreground group-hover:text-cyan-400 transition-colors truncate">
            {agent.name}
          </h3>
          <p className="text-xs text-muted-foreground font-mono mt-1 line-clamp-2">
            {agent.description}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-background border border-sidebar-border/50">
            <p className="text-[10px] text-muted-foreground uppercase">Reputation</p>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
              <span className="font-mono text-sm text-yellow-500">{agent.reputation}</span>
            </div>
          </div>
          <div className="p-2 bg-background border border-sidebar-border/50">
            <p className="text-[10px] text-muted-foreground uppercase">Cost (x402)</p>
            <span className="font-mono text-sm text-cyan-400">{agent.pricePerUse}</span>
          </div>
        </div>

        <Button className="w-full py-2 bg-sidebar-border hover:bg-cyan-600 hover:text-black text-xs font-bold font-mono uppercase tracking-wider transition-all border border-transparent hover:border-cyan-400">
          HIRE AGENT
        </Button>
      </div>
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  return (
    <Card className="glass-panel border-fuchsia-500/20 hover:border-fuchsia-500/60 transition-all duration-300 group overflow-hidden">
      <CardHeader className="p-5 pb-2">
        <div className="flex justify-between items-start">
          <Badge variant="outline" className="border-fuchsia-500 text-fuchsia-400 font-mono mb-2">ERC7401 NFT</Badge>
          <div className="flex items-center text-yellow-400 text-xs font-bold">
              <Star className="w-3 h-3 mr-1 fill-current" />
              {workflow.rating}
          </div>
        </div>
        <CardTitle className="text-xl font-display font-bold text-white group-hover:text-fuchsia-400 transition-colors">{workflow.name}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2 space-y-4">
        <CardDescription className="line-clamp-2 h-10">{workflow.description}</CardDescription>
        
        <div className="flex -space-x-2 overflow-hidden py-2">
          {workflow.agents.map((id, i) => (
            <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-muted-foreground relative z-10">
              A{i+1}
            </div>
          ))}
          <div className="inline-block h-8 w-8 rounded-full ring-2 ring-background bg-fuchsia-500/20 flex items-center justify-center text-[10px] font-bold text-fuchsia-400">
            +{workflow.agents.length}
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-5 pt-0 flex items-center justify-between border-t border-white/5 mt-2 pt-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Lease Price</span>
          <span className="text-lg font-bold text-white font-mono">{workflow.price} <span className="text-cyan-400 text-sm">USDC</span></span>
        </div>
        <Button size="sm" className="bg-fuchsia-500 text-white hover:bg-fuchsia-600 font-bold font-mono shadow-[0_0_15px_-3px_hsl(var(--accent)/0.5)]">
          LEASE FLOW
        </Button>
      </CardFooter>
    </Card>
  );
}
