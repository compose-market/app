import { useState, useCallback, useRef } from "react";
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Connection, 
  Edge, 
  Node, 
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType
} from "@xyflow/react";
import { MOCK_AGENTS, Agent } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Cpu, Save, Play, DollarSign, Trash2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// --- Custom Agent Node ---
function AgentNode({ data }: { data: { agent: Agent } }) {
  return (
    <div className="w-64 rounded-lg border-2 border-primary/50 bg-card/90 backdrop-blur-md shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)] overflow-hidden group hover:border-primary transition-colors">
      {/* Input Handle */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-primary !border-2 !border-black" />
      
      <div className="h-2 bg-primary/20 w-full relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/50 animate-pulse" />
      </div>
      
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded bg-primary/10 p-1 border border-primary/30">
            <img src={data.agent.imageUrl} alt="icon" className="w-full h-full object-contain" />
          </div>
          <div className="overflow-hidden">
            <h3 className="font-bold font-display text-sm truncate">{data.agent.name}</h3>
            <p className="text-[10px] text-muted-foreground truncate font-mono">{data.agent.type}</p>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
           <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">
             {data.agent.pricePerUse} x402
           </Badge>
           <Info className="w-3 h-3 text-muted-foreground cursor-help" />
        </div>
      </div>

      {/* Output Handle */}
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-accent !border-2 !border-black" />
    </div>
  );
}

const nodeTypes = {
  agentNode: AgentNode,
};

let id = 0;
const getId = () => `dndnode_${id++}`;

function ComposeFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // FIX: Added generic types <Node> and <Edge>
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { toast } = useToast();
  const [workflowName, setWorkflowName] = useState("");
  const [leasePrice, setLeasePrice] = useState("");

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' } 
    }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const agentId = event.dataTransfer.getData('agentId');
      
      if (typeof type === 'undefined' || !type || !agentId) {
        return;
      }

      const agent = MOCK_AGENTS.find(a => a.id === agentId);
      if (!agent) return;

      // Check if reactFlowInstance is initialized
      if (!reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getId(),
        type: 'agentNode',
        position,
        data: { label: agent.name, agent: agent },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );

  const handleSave = () => {
    if (!workflowName || !leasePrice) {
        toast({
            title: "Error",
            description: "Please provide a name and price for your workflow.",
            variant: "destructive"
        });
        return;
    }
    
    toast({
      title: "Workflow Minted!",
      description: `"${workflowName}" has been minted as a Nested NFT (ERC7401) for ${leasePrice} USDC.`,
    });
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col md:flex-row gap-4 pb-4">
      {/* Sidebar */}
      <Card className="w-full md:w-64 h-full flex flex-col glass-panel border-primary/20 shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display font-bold text-white">AGENTS</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-3 space-y-3">
           <div className="text-xs text-muted-foreground mb-2">Drag agents to canvas</div>
           {MOCK_AGENTS.map((agent) => (
             <div 
               key={agent.id}
               className="bg-card border border-border p-3 rounded cursor-grab hover:border-primary/50 hover:bg-accent/5 transition-colors group"
               onDragStart={(event) => {
                 event.dataTransfer.setData('application/reactflow', 'agentNode');
                 event.dataTransfer.setData('agentId', agent.id);
                 event.dataTransfer.effectAllowed = 'move';
               }}
               draggable
             >
               <div className="flex items-center gap-2">
                 <Cpu className="w-4 h-4 text-primary group-hover:text-accent" />
                 <span className="font-bold text-sm">{agent.name}</span>
               </div>
               <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                 <span>{agent.type}</span>
                 <span className="font-mono text-primary">{agent.pricePerUse} x402</span>
               </div>
             </div>
           ))}
        </CardContent>
      </Card>

      {/* Canvas Area */}
      <div className="flex-1 h-full relative rounded-xl border border-primary/20 overflow-hidden shadow-2xl bg-black/40">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
           <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-accent text-white hover:bg-accent/90 font-bold shadow-lg shadow-accent/20">
                  <Save className="w-4 h-4 mr-2" />
                  MINT WORKFLOW NFT
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-primary/20 text-foreground">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">Mint Nested NFT Workflow</DialogTitle>
                  <DialogDescription>
                    Compose these {nodes.length} agents into a single tradeable asset (ERC7401).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Workflow Name</Label>
                    <Input 
                        placeholder="e.g. Crypto Arbitrage Bot V1" 
                        value={workflowName} 
                        onChange={(e) => setWorkflowName(e.target.value)}
                        className="bg-background/50 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Lease Price (USDC)</Label>
                    <Input 
                        type="number" 
                        placeholder="50.00" 
                        value={leasePrice}
                        onChange={(e) => setLeasePrice(e.target.value)}
                        className="bg-background/50 font-mono"
                    />
                  </div>
                  <div className="p-4 bg-primary/10 rounded border border-primary/20 text-xs font-mono space-y-1">
                    <div className="flex justify-between">
                      <span>Agents Count:</span>
                      <span>{nodes.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. Gas:</span>
                      <span>0.04 AVAX</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSave} className="w-full bg-primary text-black font-bold">CONFIRM MINT</Button>
                </DialogFooter>
              </DialogContent>
           </Dialog>
        </div>

        <ReactFlowProvider>
          <div className="h-full w-full" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background color="hsl(var(--primary))" gap={20} size={1} className="opacity-10" />
              <Controls className="bg-card border-border fill-foreground" />
              <MiniMap 
                className="bg-card border-border" 
                maskColor="hsl(var(--background)/0.8)"
                nodeColor="hsl(var(--primary))"
              />
            </ReactFlow>
          </div>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default ComposeFlow;
