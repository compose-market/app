import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Link } from "wouter";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Play, Save, Download, Info, Loader2, CheckCircle2, XCircle, 
  Plug, Trash2, Settings, ChevronRight, Bot, ExternalLink, Filter, Star, Shield
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ServicesStatus } from "@/components/services-status";
import { 
  useConnectors, 
  useConnectorTools, 
  useWorkflowExecution,
  useWorkflowExport,
  useWorkflowBuilder 
} from "@/hooks/use-services";
import { useAgents } from "@/hooks/use-agents";
import { 
  useRegistryServers,
  useRegistrySearch,
  type RegistryServer,
} from "@/hooks/use-registry";
import type { ConnectorInfo, ConnectorTool, WorkflowStep } from "@/lib/services";
import { type Agent, type AgentRegistryId, AGENT_REGISTRIES, formatInteractions, getReadmeExcerpt, COMMON_TAGS } from "@/lib/agents";

// =============================================================================
// Node Types
// =============================================================================

interface StepNodeData extends Record<string, unknown> {
  step: WorkflowStep;
  connector?: ConnectorInfo;
  tool?: ConnectorTool;
  status?: "pending" | "running" | "success" | "error";
  error?: string;
}

function StepNode({ data }: { data: StepNodeData }) {
  const statusColors = {
    pending: "border-sidebar-border",
    running: "border-cyan-500 shadow-[0_0_20px_-5px_hsl(188_95%_43%/0.5)]",
    success: "border-green-500",
    error: "border-red-500",
  };

  return (
    <div className={`w-72 rounded-sm border-2 bg-card/90 backdrop-blur-md overflow-hidden group transition-all ${statusColors[data.status || "pending"]}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-black" />
      
      <div className={`h-1.5 w-full ${data.status === "running" ? "bg-cyan-500 animate-pulse" : data.status === "success" ? "bg-green-500" : data.status === "error" ? "bg-red-500" : "bg-sidebar-border"}`} />
      
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-sm bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30">
            <Plug className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="overflow-hidden flex-1">
            <h3 className="font-bold font-display text-sm truncate text-foreground">{data.step.name}</h3>
            <p className="text-[10px] text-muted-foreground truncate font-mono">
              {data.step.connectorId}/{data.step.toolName}
            </p>
          </div>
          {data.status === "running" && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
          {data.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {data.status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
        </div>
        
        {data.error && (
          <div className="text-[10px] text-red-400 font-mono bg-red-500/10 p-1.5 rounded mt-2 truncate">
            {data.error}
          </div>
        )}
        
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-sidebar-border">
          <Badge variant="outline" className="text-[10px] h-5 border-cyan-500/30 text-cyan-400 font-mono">
            {data.step.saveAs}
          </Badge>
          <Info className="w-3 h-3 text-muted-foreground cursor-help" />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-fuchsia-500 !border-2 !border-black" />
    </div>
  );
}

const nodeTypes = {
  stepNode: StepNode,
};

// =============================================================================
// Connector Picker (Unified search across all sources)
// =============================================================================

function ConnectorPicker({ 
  onSelect 
}: { 
  onSelect: (connectorId: string, tool: ConnectorTool) => void 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServer, setSelectedServer] = useState<RegistryServer | null>(null);
  
  // Fetch all servers with search
  const { data: searchData, isLoading: isSearching } = useRegistrySearch(
    searchQuery, 
    30
  );
  
  // Fetch all servers when no search
  const { data: allData, isLoading: isLoadingAll } = useRegistryServers({
    limit: 50,
  });
  
  const servers = searchQuery.trim() 
    ? searchData?.servers || [] 
    : allData?.servers || [];
  const isLoading = searchQuery.trim() ? isSearching : isLoadingAll;

  const handleToolSelect = (tool: { name: string; description?: string }) => {
    if (!selectedServer) return;
    
    const connectorTool: ConnectorTool = {
      name: tool.name,
      description: tool.description || "",
      inputSchema: { type: "object", properties: {} },
    };
    
    onSelect(selectedServer.registryId, connectorTool);
    setSelectedServer(null);
  };

  const getOriginBadge = (origin: string) => {
    switch (origin) {
      case "internal": return <Badge variant="default" className="text-[8px] h-4 px-1">Compose</Badge>;
      case "glama": return <Badge variant="secondary" className="text-[8px] h-4 px-1">MCP</Badge>;
      case "goat": return <Badge variant="outline" className="text-[8px] h-4 px-1 border-green-500/50 text-green-400">GOAT</Badge>;
      case "eliza": return <Badge variant="outline" className="text-[8px] h-4 px-1 border-fuchsia-500/50 text-fuchsia-400">Eliza</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div>
        <Label className="text-[10px] font-mono text-muted-foreground mb-1.5 block">
          SEARCH TOOLS
        </Label>
        <Input
          placeholder="Search connectors, plugins, MCPs..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedServer(null);
          }}
          className="h-8 text-xs bg-background/50 border-sidebar-border"
        />
      </div>

      {/* Server/Plugin List */}
      <div>
        <Label className="text-[10px] font-mono text-muted-foreground mb-1.5 block">
          SELECT CONNECTOR
        </Label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading...
          </div>
        ) : servers.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {searchQuery ? "No matches found" : "No tools available"}
          </div>
        ) : (
          <ScrollArea className="h-40">
            <div className="space-y-1 pr-2">
              {servers.map((server) => (
                <button
                  key={server.registryId}
                  onClick={() => setSelectedServer(server)}
                  className={`w-full text-left p-2 rounded-sm border transition-all ${
                    selectedServer?.registryId === server.registryId
                      ? "border-cyan-500/50 bg-cyan-500/10"
                      : "border-sidebar-border hover:border-cyan-500/30 hover:bg-background/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Plug className="w-3 h-3 text-cyan-400" />
                    <span className="font-mono text-xs truncate flex-1">{server.name}</span>
                    {getOriginBadge(server.origin)}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 ml-5">
                    {server.description}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Tools from selected server */}
      {selectedServer && selectedServer.tools && selectedServer.tools.length > 0 && (
        <div>
          <Label className="text-[10px] font-mono text-muted-foreground mb-1.5 block">
            SELECT TOOL ({selectedServer.tools.length})
          </Label>
          <ScrollArea className="h-32">
            <div className="space-y-1 pr-2">
              {selectedServer.tools.map((tool) => (
                <Button
                  key={tool.name}
                  variant="ghost"
                  className="w-full justify-start h-auto py-2 text-left hover:bg-cyan-500/10"
                  onClick={() => handleToolSelect(tool)}
                >
                  <ChevronRight className="w-3 h-3 mr-2 text-cyan-400" />
                  <div className="flex-1 overflow-hidden">
                    <div className="font-mono text-xs truncate">{tool.name}</div>
                    {tool.description && (
                      <div className="text-[10px] text-muted-foreground truncate">{tool.description}</div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Agents Picker
// =============================================================================

function AgentsPicker({ 
  onSelect 
}: { 
  onSelect: (agent: Agent) => void 
}) {
  const [selectedTag, setSelectedTag] = useState("all");
  const { data, isLoading, error } = useAgents({
    tags: selectedTag !== "all" ? [selectedTag] : undefined,
    status: "active",
    limit: 20,
    sort: "interactions",
    direction: "desc",
  });

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>(COMMON_TAGS);
    if (data?.tags) {
      data.tags.forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  }, [data?.tags]);

  return (
    <div className="space-y-4">
      {/* Filter by Tag */}
      <div>
        <Label className="text-xs font-mono text-muted-foreground mb-2 block">FILTER BY TAG</Label>
        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-full bg-background/50 border-sidebar-border text-sm">
            <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {availableTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agent List */}
      <div>
        <Label className="text-xs font-mono text-muted-foreground mb-2 block">SELECT AGENT</Label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading agents...
          </div>
        ) : error ? (
          <div className="text-xs text-red-400 font-mono">
            Failed to load agents
          </div>
        ) : !data?.agents.length ? (
          <div className="text-sm text-muted-foreground">No agents found</div>
        ) : (
          <ScrollArea className="h-56">
            <div className="space-y-2 pr-2">
              {data.agents.map((agent) => (
                <AgentPickerCard key={agent.id} agent={agent} onSelect={onSelect} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Browse More Link */}
      <div className="pt-2 border-t border-sidebar-border">
        <Link href="/agents">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-fuchsia-400 hover:text-fuchsia-300 p-0 h-auto w-full justify-start"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Browse all agents →
          </Button>
        </Link>
      </div>
    </div>
  );
}

function AgentPickerCard({ 
  agent, 
  onSelect 
}: { 
  agent: Agent; 
  onSelect: (a: Agent) => void 
}) {
  const initials = agent.name
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      onClick={() => onSelect(agent)}
      className="w-full p-2 rounded-sm border border-sidebar-border bg-background/30 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5 transition-all text-left group"
    >
      <div className="flex items-start gap-2">
        <Avatar className="w-8 h-8 border border-sidebar-border group-hover:border-fuchsia-500/50">
          <AvatarImage src={agent.avatarUrl || undefined} alt={agent.name} />
          <AvatarFallback className="bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs font-medium truncate group-hover:text-fuchsia-400 transition-colors">
              {agent.name}
            </span>
            {agent.verified && (
              <Shield className="w-3 h-3 text-green-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 text-yellow-400" />
              {agent.rating.toFixed(1)}
            </span>
            <span>{formatInteractions(agent.totalInteractions)} uses</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

let nodeId = 0;
const getNodeId = () => `step_${nodeId++}`;

function ComposeFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { toast } = useToast();
  
  // Workflow state
  const { workflow, addStep, setMetadata } = useWorkflowBuilder();
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [inputJson, setInputJson] = useState("{}");
  
  // Execution state
  const { execute, isRunning, logs, result, error: execError, reset: resetExecution } = useWorkflowExecution();
  const { exportAsZip, isExporting } = useWorkflowExport();

  // Build workflow from nodes
  const currentWorkflow = useMemo(() => {
    const steps: WorkflowStep[] = nodes.map((node) => ({
      ...(node.data as StepNodeData).step,
      id: node.id,
    }));
    
    return {
      id: workflow.id,
      name: workflowName || "Untitled Workflow",
      description: workflowDescription,
      steps,
    };
  }, [nodes, workflow.id, workflowName, workflowDescription]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: 'hsl(188 95% 43%)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(188 95% 43%)' } 
    }, eds)),
    [setEdges],
  );

  // Add step from connector picker
  const handleAddStep = useCallback((connectorId: string, tool: ConnectorTool) => {
    const id = getNodeId();
    const step: WorkflowStep = {
      id,
      name: tool.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      type: "connectorTool",
      connectorId,
      toolName: tool.name,
      inputTemplate: {},
      saveAs: `steps.${tool.name}`,
    };

    const newNode: Node = {
      id,
      type: "stepNode",
      position: { x: 250, y: nodes.length * 150 + 50 },
      data: { step, status: "pending" } as StepNodeData,
    };

    setNodes((nds) => [...nds, newNode]);
    
    toast({
      title: "Step Added",
      description: `Added "${step.name}" to workflow`,
    });
  }, [nodes.length, setNodes, toast]);

  // Add step from agent registry
  const handleAddAgentStep = useCallback((agent: Agent) => {
    const id = getNodeId();
    const protocolName = agent.protocols?.[0]?.name || "default";
    const step: WorkflowStep = {
      id,
      name: agent.name,
      type: "connectorTool",
      connectorId: agent.registry,
      toolName: protocolName,
      inputTemplate: { agentAddress: agent.address },
      saveAs: `steps.${agent.name.toLowerCase().replace(/\s+/g, "_")}`,
    };

    const newNode: Node = {
      id,
      type: "stepNode",
      position: { x: 250, y: nodes.length * 150 + 50 },
      data: { step, status: "pending" } as StepNodeData,
    };

    setNodes((nds) => [...nds, newNode]);
    
    const registryName = AGENT_REGISTRIES[agent.registry]?.name || agent.registry;
    toast({
      title: "Agent Added",
      description: `Added "${agent.name}" from ${registryName}`,
    });
  }, [nodes.length, setNodes, toast]);
  
  // Check for agent selection from Agents page on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("selectedAgent");
    if (stored) {
      try {
        const agentData = JSON.parse(stored);
        // Create a minimal agent object for the handler
        handleAddAgentStep({
          id: agentData.id || agentData.address,
          address: agentData.address,
          name: agentData.name,
          description: agentData.description || "",
          registry: agentData.registry || "agentverse",
          protocols: agentData.protocols || [],
          avatarUrl: agentData.avatarUrl,
          totalInteractions: 0,
          recentInteractions: 0,
          rating: 0,
          status: "active",
          type: "hosted",
          featured: false,
          verified: false,
          category: agentData.category || "",
          tags: agentData.tags || [],
          owner: "",
          createdAt: "",
          updatedAt: "",
        });
        sessionStorage.removeItem("selectedAgent");
      } catch {
        // Ignore parse errors
      }
    }
  }, [handleAddAgentStep]);

  // Run workflow
  const handleRun = useCallback(async () => {
    if (currentWorkflow.steps.length === 0) {
      toast({
        title: "No Steps",
        description: "Add at least one step to run the workflow",
        variant: "destructive",
      });
      return;
    }

    let input = {};
    try {
      input = JSON.parse(inputJson);
    } catch {
      toast({
        title: "Invalid Input",
        description: "Input must be valid JSON",
        variant: "destructive",
      });
      return;
    }

    // Reset node statuses
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...(n.data as StepNodeData), status: "pending", error: undefined } as StepNodeData,
    })));

    try {
      // Mark first step as running
      setNodes((nds) => {
        const updated = [...nds];
        if (updated[0]) {
          updated[0] = { ...updated[0], data: { ...(updated[0].data as StepNodeData), status: "running" } as StepNodeData };
        }
        return updated;
      });

      const result = await execute(currentWorkflow, input);
      
      // Update node statuses based on logs
      setNodes((nds) => nds.map((n) => {
        const log = result.logs.find((l) => l.stepId === n.id);
        return {
          ...n,
          data: {
            ...(n.data as StepNodeData),
            status: log?.status || "pending",
            error: log?.error,
          } as StepNodeData,
        };
      }));

      toast({
        title: result.success ? "Workflow Complete" : "Workflow Failed",
        description: result.success 
          ? `Executed ${result.logs.length} steps successfully`
          : `Failed at step: ${result.logs.find(l => l.status === "error")?.name}`,
        variant: result.success ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Execution Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [currentWorkflow, inputJson, execute, setNodes, toast]);

  // Export workflow
  const handleExport = useCallback(async () => {
    if (currentWorkflow.steps.length === 0) {
      toast({
        title: "No Steps",
        description: "Add at least one step to export the workflow",
        variant: "destructive",
      });
      return;
    }

    try {
      await exportAsZip({
        workflow: currentWorkflow,
        projectName: workflowName,
        description: workflowDescription,
      });
      
      toast({
        title: "Export Complete",
        description: "Your workflow project has been downloaded",
      });
    } catch (err) {
      toast({
        title: "Export Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [currentWorkflow, workflowName, workflowDescription, exportAsZip, toast]);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col md:flex-row gap-4 pb-4">
      {/* Sidebar - Picker Tabs */}
      <Card className="w-full md:w-80 h-full flex flex-col glass-panel border-cyan-500/20 shrink-0">
        <CardHeader className="pb-2 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display font-bold text-cyan-400">ADD STEPS</CardTitle>
            <ServicesStatus />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <Tabs defaultValue="connectors" className="h-full flex flex-col">
            <TabsList className="w-full rounded-none border-b border-sidebar-border bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="connectors" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-cyan-500 data-[state=active]:bg-transparent data-[state=active]:text-cyan-400 py-2.5 font-mono text-xs"
              >
                <Plug className="w-3 h-3 mr-1.5" />
                CONNECTORS
              </TabsTrigger>
              <TabsTrigger 
                value="agents" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-fuchsia-500 data-[state=active]:bg-transparent data-[state=active]:text-fuchsia-400 py-2.5 font-mono text-xs"
              >
                <Bot className="w-3 h-3 mr-1.5" />
                AGENTS
              </TabsTrigger>
            </TabsList>
            <TabsContent value="connectors" className="flex-1 overflow-y-auto p-3 mt-0">
              <ConnectorPicker onSelect={handleAddStep} />
            </TabsContent>
            <TabsContent value="agents" className="flex-1 overflow-y-auto p-3 mt-0">
              <AgentsPicker onSelect={handleAddAgentStep} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Canvas Area */}
      <div className="flex-1 h-full relative rounded-sm border border-cyan-500/20 overflow-hidden shadow-2xl bg-black/40">
        {/* Toolbar */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {/* Run Button */}
          <Button 
            onClick={handleRun}
            disabled={isRunning || nodes.length === 0}
            className="bg-green-500 text-white hover:bg-green-600 font-bold font-mono shadow-lg"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {isRunning ? "RUNNING..." : "RUN"}
          </Button>

          {/* Export Button */}
          <Button
            onClick={handleExport}
            disabled={isExporting || nodes.length === 0}
            className="bg-fuchsia-500 text-white hover:bg-fuchsia-600 font-bold font-mono shadow-lg"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            EXPORT
          </Button>

          {/* Settings Dialog */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-sidebar-border">
                <Settings className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-card border-sidebar-border">
              <SheetHeader>
                <SheetTitle className="font-display text-cyan-400">Workflow Settings</SheetTitle>
                <SheetDescription>Configure workflow metadata and input</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label className="font-mono text-xs">WORKFLOW NAME</Label>
                  <Input
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="My Workflow"
                    className="bg-background/50 font-mono border-sidebar-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs">DESCRIPTION</Label>
                  <Textarea
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="What does this workflow do?"
                    className="bg-background/50 font-mono border-sidebar-border resize-none"
                    rows={3}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="font-mono text-xs">INPUT (JSON)</Label>
                  <Textarea
                    value={inputJson}
                    onChange={(e) => setInputJson(e.target.value)}
                    placeholder='{"key": "value"}'
                    className="bg-background/50 font-mono border-sidebar-border resize-none text-xs"
                    rows={5}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Access in steps as {"{{input.key}}"}
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Step Count Badge */}
        <div className="absolute top-4 left-4 z-10">
          <Badge variant="outline" className="font-mono border-cyan-500/30 text-cyan-400">
            {nodes.length} step{nodes.length !== 1 ? "s" : ""}
          </Badge>
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
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background color="hsl(188 95% 43%)" gap={20} size={1} className="opacity-10" />
              <Controls className="bg-card border-sidebar-border fill-foreground" />
              <MiniMap 
                className="bg-card border-sidebar-border" 
                maskColor="hsl(222 47% 3% / 0.8)"
                nodeColor="hsl(188 95% 43%)"
              />
            </ReactFlow>
          </div>
        </ReactFlowProvider>

        {/* Empty State */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-2">
              <Plug className="w-12 h-12 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground font-mono text-sm">
                Select a connector and tool to add steps
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ComposeFlow;
