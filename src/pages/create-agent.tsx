import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Cpu, DollarSign, ShieldCheck, Upload, ExternalLink, Sparkles, Plug, Search, X, ChevronRight, Loader2, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { AVAILABLE_MODELS, type AIModel } from "@/lib/models";
import { useRegistryServers, useRegistrySearch, type RegistryServer, type ServerOrigin } from "@/hooks/use-registry";
import { 
  uploadAgentAvatar, 
  uploadAgentCard, 
  getIpfsUri, 
  getIpfsUrl,
  fileToDataUrl,
  isPinataConfigured,
  type AgentCard 
} from "@/lib/pinata";
import { 
  getAgentFactoryContract, 
  computeDnaHash, 
  usdcToWei,
  getContractAddress 
} from "@/lib/contracts";
import { CHAIN_IDS, CHAIN_CONFIG } from "@/lib/thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { TransactionButton, useSendTransaction } from "thirdweb/react";
import { prepareContractCall } from "thirdweb";
import { accountAbstraction } from "@/lib/thirdweb";

interface SelectedHFModel {
  id: string;
  name: string;
  provider: string;
  priceMultiplier: number;
  contextLength: number;
}

interface SelectedPlugin {
  id: string;
  name: string;
  description: string;
  origin: ServerOrigin;
}

// Plugins that can be tested via the runtime
const EXECUTABLE_PLUGINS = ["goat-erc20", "goat-coingecko"];

const formSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(10),
  model: z.string(),
  pricePerUse: z.string(),
  endpoint: z.string().url(),
  isCloneable: z.boolean(),
  units: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateAgent() {
  const { toast } = useToast();
  const account = useActiveAccount();
  const { mutateAsync: sendTransaction, isPending: isSending } = useSendTransaction();
  
  const [selectedHFModel, setSelectedHFModel] = useState<SelectedHFModel | null>(null);
  const [selectedPlugins, setSelectedPlugins] = useState<SelectedPlugin[]>([]);
  const [pluginSearch, setPluginSearch] = useState("");
  const [showPluginPicker, setShowPluginPicker] = useState(false);
  
  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [mintStep, setMintStep] = useState<"idle" | "uploading" | "minting" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check for selected HF model from models page
  useEffect(() => {
    const stored = sessionStorage.getItem("selectedHFModel");
    if (stored) {
      try {
        const model = JSON.parse(stored) as SelectedHFModel;
        setSelectedHFModel(model);
        sessionStorage.removeItem("selectedHFModel");
      } catch {
        // Ignore parse errors
      }
    }
  }, []);
  
  // Fetch plugins/MCPs
  const { data: searchData, isLoading: isSearching } = useRegistrySearch(
    pluginSearch,
    20
  );
  
  const { data: defaultPlugins, isLoading: isLoadingDefault } = useRegistryServers({
    origin: "goat,eliza",
    limit: 20,
  });
  
  const availablePlugins = pluginSearch.trim()
    ? searchData?.servers.filter(s => s.origin === "goat" || s.origin === "eliza") || []
    : defaultPlugins?.servers || [];
  
  const isLoadingPlugins = pluginSearch.trim() ? isSearching : isLoadingDefault;
  
  const addPlugin = (server: RegistryServer) => {
    if (selectedPlugins.some(p => p.id === server.registryId)) return;
    setSelectedPlugins(prev => [...prev, {
      id: server.registryId,
      name: server.name,
      description: server.description,
      origin: server.origin,
    }]);
    setPluginSearch("");
    setShowPluginPicker(false);
  };
  
  const removePlugin = (id: string) => {
    setSelectedPlugins(prev => prev.filter(p => p.id !== id));
  };
  
  const getOriginColor = (origin: ServerOrigin) => {
    switch (origin) {
      case "goat": return "border-green-500/50 text-green-400 bg-green-500/10";
      case "eliza": return "border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-500/10";
      default: return "border-cyan-500/50 text-cyan-400 bg-cyan-500/10";
    }
  };
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      model: "asi1-mini",
      pricePerUse: "0.01",
      endpoint: "https://",
      isCloneable: false,
      units: "",
    },
  });
  
  // Update form when HF model is selected
  useEffect(() => {
    if (selectedHFModel) {
      form.setValue("model", selectedHFModel.id);
    }
  }, [selectedHFModel, form]);

  // Handle avatar file selection
  const handleAvatarSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 5MB",
        variant: "destructive",
      });
      return;
    }
    
    setAvatarFile(file);
    const dataUrl = await fileToDataUrl(file);
    setAvatarPreview(dataUrl);
  }, [toast]);

  // Prepare transaction data for minting
  const [preparedTx, setPreparedTx] = useState<{
    dnaHash: `0x${string}`;
    units: bigint;
    price: bigint;
    cloneable: boolean;
    agentCardUri: string;
  } | null>(null);

  // Handle form validation and IPFS upload before minting
  const prepareForMint = async (values: FormValues): Promise<boolean> => {
    if (!isPinataConfigured()) {
      toast({
        title: "IPFS not configured",
        description: "Pinata JWT is missing. Check environment variables.",
        variant: "destructive",
      });
      return false;
    }

    try {
      setMintStep("uploading");
      
      // 1. Upload avatar to IPFS (if provided)
      let avatarUri = "none";
      if (avatarFile) {
        const avatarCid = await uploadAgentAvatar(avatarFile, values.name);
        avatarUri = getIpfsUri(avatarCid);
      }
      
      // 2. Build and upload Agent Card to IPFS
      const chainId = CHAIN_IDS.avalancheFuji;
      const modelId = selectedHFModel?.id || values.model;
      const skills = selectedPlugins.map(p => p.id);
      
      const agentCard: AgentCard = {
        schemaVersion: "1.0.0",
        name: values.name,
        description: values.description,
        skills,
        avatar: avatarUri,
        dnaHash: "", // Will be computed on-chain
        chain: chainId,
        model: modelId,
        price: usdcToWei(parseFloat(values.pricePerUse)).toString(),
        units: values.units ? parseInt(values.units) : 0,
        cloneable: values.isCloneable,
        endpoint: values.endpoint,
        protocols: [{ name: "x402", version: "1.0" }],
        plugins: selectedPlugins.map(p => ({
          registryId: p.id,
          name: p.name,
          origin: p.origin,
        })),
        createdAt: new Date().toISOString(),
        creator: account?.address || "",
      };
      
      const cardCid = await uploadAgentCard(agentCard);
      const agentCardUri = getIpfsUri(cardCid);
      
      // 3. Compute DNA hash
      const dnaHash = computeDnaHash(skills, chainId, modelId);
      const priceWei = usdcToWei(parseFloat(values.pricePerUse));
      const units = values.units ? BigInt(values.units) : BigInt(0);
      
      setPreparedTx({
        dnaHash,
        units,
        price: priceWei,
        cloneable: values.isCloneable,
        agentCardUri,
      });
      
      setMintStep("minting");
      return true;
    } catch (error) {
      console.error("Prepare error:", error);
      setMintStep("idle");
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload to IPFS",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleMintSuccess = (result: { transactionHash: string }) => {
    const chainId = CHAIN_IDS.avalancheFuji;
    toast({
      title: "Agent Minted Successfully!",
      description: (
        <div className="space-y-1">
          <p>{form.getValues("name")} deployed to Avalanche Fuji.</p>
          <a 
            href={`${CHAIN_CONFIG[chainId].explorer}/tx/${result.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline text-xs flex items-center gap-1"
          >
            View transaction <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ),
    });
    
    // Reset form
    form.reset();
    setSelectedPlugins([]);
    setSelectedHFModel(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setPreparedTx(null);
    setMintStep("idle");
  };

  const handleMintError = (error: Error) => {
    console.error("Mint error:", error);
    setMintStep("idle");
    setPreparedTx(null);
    toast({
      title: "Minting Failed",
      description: error.message || "Unknown error occurred",
      variant: "destructive",
    });
  };

  // Legacy submit for form validation only
  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    await prepareForMint(values);
  };

  const isProcessing = mintStep !== "idle" && mintStep !== "done";

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {/* Page Header */}
      <div className="mb-8 space-y-2 border-b border-sidebar-border pb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-display font-bold text-white">
            <span className="text-fuchsia-500 mr-2">//</span>
            MINT NEW AGENT
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-fuchsia-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-sm">Deploy a new autonomous entity with ERC8004 Identity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card className="glass-panel border-cyan-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-bold font-display text-cyan-400">
                    <Cpu className="w-5 h-5" />
                    AGENT IDENTITY
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-foreground">Agent Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Alpha Sniper V1" {...field} className="bg-background/50 font-mono border-sidebar-border focus:border-cyan-500" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-foreground">Purpose & Capabilities</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe what this agent does..." 
                            className="resize-none bg-background/50 min-h-[100px] border-sidebar-border focus:border-cyan-500" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-foreground">LLM Model</FormLabel>
                          {selectedHFModel ? (
                            <div className="space-y-2">
                              <div className="p-3 rounded-sm bg-cyan-500/10 border border-cyan-500/30">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-mono font-bold text-cyan-400 text-sm">{selectedHFModel.name}</p>
                                    <p className="text-xs text-muted-foreground font-mono">
                                      via {selectedHFModel.provider} · ${selectedHFModel.priceMultiplier.toFixed(2)}/1M tokens
                                    </p>
                                  </div>
                                  <Sparkles className="w-4 h-4 text-cyan-400" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedHFModel(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  Use built-in model
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-background/50 border-sidebar-border">
                                    <SelectValue placeholder="Select a model" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {AVAILABLE_MODELS.filter((m, i, arr) => 
                                    // Remove duplicate asi1-mini entries
                                    arr.findIndex(x => x.id === m.id) === i
                                  ).map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                      {model.name} (${model.priceMultiplier}/1M tokens)
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Link href="/models">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-cyan-400 hover:text-cyan-300 p-0 h-auto"
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Browse HuggingFace models →
                                </Button>
                              </Link>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endpoint"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-foreground">Service Endpoint</FormLabel>
                          <FormControl>
                            <Input placeholder="https://api.myagent.com/v1" {...field} className="bg-background/50 font-mono border-sidebar-border focus:border-cyan-500" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Plugin/Capability Picker */}
              <Card className="glass-panel border-green-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-bold font-display text-green-400">
                    <Plug className="w-5 h-5" />
                    PLUGINS & CAPABILITIES
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Selected Plugins */}
                  {selectedPlugins.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedPlugins.map(plugin => (
                        <Badge
                          key={plugin.id}
                          variant="outline"
                          className={`${getOriginColor(plugin.origin)} pl-2 pr-1 py-1 text-xs font-mono`}
                        >
                          {plugin.name}
                          <button
                            type="button"
                            onClick={() => removePlugin(plugin.id)}
                            className="ml-1 p-0.5 rounded hover:bg-white/10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Plugin Search */}
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search GOAT, ElizaOS plugins..."
                        value={pluginSearch}
                        onChange={(e) => {
                          setPluginSearch(e.target.value);
                          setShowPluginPicker(true);
                        }}
                        onFocus={() => setShowPluginPicker(true)}
                        className="pl-10 bg-background/50 font-mono border-sidebar-border focus:border-green-500"
                      />
                    </div>
                    
                    {/* Dropdown Results */}
                    {showPluginPicker && (
                      <div className="absolute z-50 w-full mt-1 bg-sidebar border border-sidebar-border rounded-sm shadow-lg">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border">
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">
                            {pluginSearch ? "Search Results" : "Popular Plugins"}
                          </span>
                          <Link href="/registry">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-[10px] text-green-400 hover:text-green-300 h-auto py-0.5 px-1"
                            >
                              See all <ChevronRight className="w-3 h-3 ml-0.5" />
                            </Button>
                          </Link>
                        </div>
                        <ScrollArea className="h-48">
                          {isLoadingPlugins ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : availablePlugins.length === 0 ? (
                            <div className="py-8 text-center text-xs text-muted-foreground">
                              No plugins found
                            </div>
                          ) : (
                            <div className="p-1">
                              {availablePlugins.map(server => {
                                const isSelected = selectedPlugins.some(p => p.id === server.registryId);
                                const isExecutable = EXECUTABLE_PLUGINS.includes(server.registryId);
                                return (
                                  <button
                                    key={server.registryId}
                                    type="button"
                                    onClick={() => addPlugin(server)}
                                    disabled={isSelected}
                                    className={`w-full text-left p-2 rounded-sm text-xs transition-all ${
                                      isSelected
                                        ? "opacity-50 cursor-not-allowed"
                                        : "hover:bg-green-500/10"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={`${getOriginColor(server.origin)} text-[9px] px-1 py-0`}
                                      >
                                        {server.origin === "goat" ? "GOAT" : "Eliza"}
                                      </Badge>
                                      <span className="font-mono text-foreground truncate flex-1">
                                        {server.name}
                                      </span>
                                      {isExecutable && (
                                        <Badge variant="outline" className="text-[8px] px-1 py-0 border-cyan-500/30 text-cyan-400">
                                          <Play className="w-2 h-2 mr-0.5" />
                                          Testable
                                        </Badge>
                                      )}
                                      {isSelected && <span className="text-green-400 text-[10px]">Added</span>}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 ml-12">
                                      {server.description}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </ScrollArea>
                        <div className="px-3 py-2 border-t border-sidebar-border">
                          <button
                            type="button"
                            onClick={() => setShowPluginPicker(false)}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-[10px] text-muted-foreground">
                    Add DeFi tools (GOAT) or AI capabilities (ElizaOS) to your agent.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-panel border-fuchsia-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-bold font-display text-fuchsia-400">
                    <DollarSign className="w-5 h-5" />
                    FINANCIAL SPECS (x402)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="pricePerUse"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-foreground">Price Per Request (USDC)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.001" {...field} className="bg-background/50 font-mono border-sidebar-border focus:border-fuchsia-500" />
                          </FormControl>
                          <FormDescription className="text-muted-foreground text-xs">
                            Amount deducted via x402 per call
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="units"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-foreground">Supply Cap</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="∞ (leave empty)" {...field} className="bg-background/50 font-mono border-sidebar-border focus:border-fuchsia-500" />
                          </FormControl>
                          <FormDescription className="text-muted-foreground text-xs">
                            Max units (empty = infinite)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="isCloneable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-sm border border-sidebar-border p-4 bg-background/30">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-mono text-foreground">Allow Cloning?</FormLabel>
                          <FormDescription className="text-muted-foreground">
                            Let others fork this agent with modified parameters.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Mint Progress */}
              {mintStep === "uploading" && (
                <Card className="glass-panel border-cyan-500/50">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                      <div>
                        <p className="font-mono text-sm text-foreground">Uploading to IPFS...</p>
                        <p className="text-xs text-muted-foreground">Storing avatar and agent card metadata</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Two-step process: First upload, then mint */}
              {!preparedTx ? (
                <Button 
                  type="submit" 
                  size="lg" 
                  disabled={!account || mintStep === "uploading"}
                  className="w-full bg-cyan-500 text-black font-bold font-mono hover:bg-cyan-400 h-14 text-lg shadow-[0_0_20px_-5px_hsl(var(--primary))] tracking-wider disabled:opacity-50"
                >
                  {mintStep === "uploading" ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      UPLOADING...
                    </>
                  ) : !account ? (
                    "SIGN IN TO MINT"
                  ) : (
                    "PREPARE & MINT AGENT"
                  )}
                </Button>
              ) : (
                <TransactionButton
                  transaction={() => {
                    const contract = getAgentFactoryContract();
                    return prepareContractCall({
                      contract,
                      method: "function mintAgent(bytes32 dnaHash, uint256 units, uint256 price, bool cloneable, string agentCardUri) returns (uint256 agentId)",
                      params: [
                        preparedTx.dnaHash,
                        preparedTx.units,
                        preparedTx.price,
                        preparedTx.cloneable,
                        preparedTx.agentCardUri,
                      ],
                    });
                  }}
                  onTransactionConfirmed={handleMintSuccess}
                  onError={handleMintError}
                  className="w-full !bg-gradient-to-r !from-cyan-500 !to-fuchsia-500 !text-white !font-bold !font-mono !h-14 !text-lg !shadow-[0_0_20px_-5px_hsl(var(--primary))] !tracking-wider !rounded-sm"
                >
                  MINT AGENT ON AVALANCHE
                </TransactionButton>
              )}
            </form>
          </Form>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Avatar Upload */}
          <div className="glass-panel p-6 rounded-sm space-y-4 border border-fuchsia-500/20 corner-decoration">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-square rounded-sm bg-background/50 border border-sidebar-border border-dashed flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:border-cyan-500 hover:text-cyan-400 transition-colors overflow-hidden"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Upload className="w-8 h-8 mb-2" />
                  <span className="text-xs font-mono">UPLOAD AVATAR</span>
                </>
              )}
            </button>
            {avatarPreview && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(null);
                }}
                className="w-full text-xs text-muted-foreground"
              >
                Remove avatar
              </Button>
            )}
            <div className="space-y-2">
              <h3 className="font-bold font-display text-white">Minting Info</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-mono">Network</span>
                <span className="font-mono text-cyan-400">Avalanche Fuji</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-mono">Contract</span>
                <span className="font-mono text-cyan-400">ERC8004</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-mono">Storage</span>
                <span className="font-mono text-cyan-400">Pinata IPFS</span>
              </div>
            </div>
          </div>

          {/* Account Status */}
          <div className={`p-4 rounded-sm border text-sm ${
            account 
              ? "bg-green-500/10 border-green-500/20 text-green-200"
              : "bg-yellow-500/10 border-yellow-500/20 text-yellow-200"
          }`}>
            {account ? (
              <>
                <CheckCircle2 className="w-5 h-5 mb-2 text-green-400" />
                <p>
                  Signed in: <span className="font-mono">{account.address.slice(0, 6)}...{account.address.slice(-4)}</span>
                </p>
                <p className="text-xs text-green-300/70 mt-1">Gas sponsored • No fees</p>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 mb-2 text-yellow-400" />
                <p>Sign in with email, social, or wallet to mint.</p>
              </>
            )}
          </div>

          <div className="p-4 rounded-sm bg-cyan-500/10 border border-cyan-500/20 text-sm text-cyan-200">
            <ShieldCheck className="w-5 h-5 mb-2 text-cyan-400" />
            <p>
              Your agent will be verified by the <strong>Manowar Curator Protocol</strong>. 
              Initial reputation score will be assigned based on metadata quality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
