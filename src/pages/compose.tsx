import { useState, useCallback, useRef, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { 
  Play, Save, Download, Info, Loader2, CheckCircle2, XCircle, 
  Plug, Trash2, Settings, ChevronRight
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
import type { ConnectorInfo, ConnectorTool, WorkflowStep } from "@/lib/services";

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
// Connector Picker
// =============================================================================

function ConnectorPicker({ 
  onSelect 
}: { 
  onSelect: (connectorId: string, tool: ConnectorTool) => void 
}) {
  const { data: connectors, isLoading: loadingConnectors } = useConnectors();
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const { data: tools, isLoading: loadingTools } = useConnectorTools(selectedConnector);

  const availableConnectors = connectors?.filter(c => c.available) || [];

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-mono text-muted-foreground mb-2 block">SELECT CONNECTOR</Label>
        {loadingConnectors ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading connectors...
          </div>
        ) : availableConnectors.length === 0 ? (
          <div className="text-sm text-muted-foreground">No connectors available</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {availableConnectors.map((connector) => (
              <Button
                key={connector.id}
                variant={selectedConnector === connector.id ? "default" : "outline"}
                className={`justify-start h-auto py-2 ${selectedConnector === connector.id ? "bg-cyan-500 text-black" : ""}`}
                onClick={() => setSelectedConnector(connector.id)}
              >
                <Plug className="w-4 h-4 mr-2" />
                <span className="truncate">{connector.label}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {selectedConnector && (
        <div>
          <Label className="text-xs font-mono text-muted-foreground mb-2 block">SELECT TOOL</Label>
          {loadingTools ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tools...
            </div>
          ) : !tools?.length ? (
            <div className="text-sm text-muted-foreground">No tools available</div>
          ) : (
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {tools.map((tool) => (
                  <Button
                    key={tool.name}
                    variant="ghost"
                    className="w-full justify-start h-auto py-2 text-left"
                    onClick={() => onSelect(selectedConnector, tool)}
                  >
                    <ChevronRight className="w-4 h-4 mr-2 text-muted-foreground" />
                    <div className="flex-1 overflow-hidden">
                      <div className="font-mono text-sm truncate">{tool.name}</div>
                      {tool.description && (
                        <div className="text-[10px] text-muted-foreground truncate">{tool.description}</div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
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
      {/* Sidebar - Connector Picker */}
      <Card className="w-full md:w-72 h-full flex flex-col glass-panel border-cyan-500/20 shrink-0">
        <CardHeader className="pb-2 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display font-bold text-cyan-400">CONNECTORS</CardTitle>
            <ServicesStatus />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-3">
          <ConnectorPicker onSelect={handleAddStep} />
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
