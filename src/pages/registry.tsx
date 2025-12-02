/**
 * MCP Registry Browser
 * 
 * Browse and search MCP servers from Glama + Compose internal tools.
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { 
  useRegistryServers, 
  useRegistrySearch, 
  useRegistryMeta,
  useRegistryCategories,
  type RegistryServer,
  getOriginLabel,
  isRemoteCapable,
  formatToolCount,
} from "@/hooks/use-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Search, 
  Loader2, 
  Server, 
  Globe, 
  Home, 
  ExternalLink, 
  Github,
  Wrench,
  Plus,
  Database,
  Cloud,
  Sparkles,
  Filter,
  RefreshCw,
} from "lucide-react";

// =============================================================================
// Server Card Component
// =============================================================================

function ServerCard({ 
  server, 
  onSelect 
}: { 
  server: RegistryServer; 
  onSelect: (s: RegistryServer) => void;
}) {
  const isInternal = server.origin === "internal";
  const isRemote = isRemoteCapable(server);
  
  return (
    <Card 
      className="glass-panel border-cyan-500/20 hover:border-cyan-500/50 transition-all cursor-pointer group"
      onClick={() => onSelect(server)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-sm flex items-center justify-center border shrink-0 ${
              isInternal 
                ? "bg-fuchsia-500/10 border-fuchsia-500/30" 
                : "bg-cyan-500/10 border-cyan-500/30"
            }`}>
              {isInternal ? (
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
              ) : (
                <Server className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-display font-bold truncate group-hover:text-cyan-400 transition-colors">
                {server.name}
              </CardTitle>
              <p className="text-[10px] font-mono text-muted-foreground truncate">
                {server.namespace}/{server.slug}
              </p>
            </div>
          </div>
          <Badge 
            variant={isInternal ? "default" : "secondary"}
            className={`shrink-0 text-[10px] h-5 ${
              isInternal 
                ? "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30" 
                : "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
            }`}
          >
            {getOriginLabel(server.origin)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <CardDescription className="text-xs line-clamp-2 mb-3">
          {server.description}
        </CardDescription>
        
        <div className="flex flex-wrap gap-1 mb-3">
          {server.category && (
            <Badge variant="outline" className="text-[10px] h-5 border-sidebar-border">
              {server.category}
            </Badge>
          )}
          {isRemote && (
            <Badge variant="outline" className="text-[10px] h-5 border-green-500/30 text-green-400">
              <Cloud className="w-2.5 h-2.5 mr-1" />
              Remote
            </Badge>
          )}
          {server.toolCount > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 border-sidebar-border">
              <Wrench className="w-2.5 h-2.5 mr-1" />
              {formatToolCount(server.toolCount)}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-sidebar-border">
          <div className="flex gap-1">
            {server.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] text-muted-foreground">
                #{tag}
              </span>
            ))}
          </div>
          {server.repoUrl && (
            <a 
              href={server.repoUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-cyan-400 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Server Detail Dialog
// =============================================================================

function ServerDetailDialog({
  server,
  open,
  onOpenChange,
}: {
  server: RegistryServer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  
  if (!server) return null;
  
  const isInternal = server.origin === "internal";
  
  const handleAddToWorkflow = () => {
    // Store server data and navigate to compose
    sessionStorage.setItem("selectedMcpServer", JSON.stringify({
      registryId: server.registryId,
      name: server.name,
      namespace: server.namespace,
      slug: server.slug,
      description: server.description,
      tools: server.tools,
      origin: server.origin,
    }));
    navigate("/compose");
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-cyan-500/30">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-sm flex items-center justify-center border ${
              isInternal 
                ? "bg-fuchsia-500/10 border-fuchsia-500/30" 
                : "bg-cyan-500/10 border-cyan-500/30"
            }`}>
              {isInternal ? (
                <Sparkles className="w-5 h-5 text-fuchsia-400" />
              ) : (
                <Server className="w-5 h-5 text-cyan-400" />
              )}
            </div>
            <div>
              <DialogTitle className="font-display text-lg">{server.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {server.namespace}/{server.slug}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">{server.description}</p>
          
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={isInternal ? "default" : "secondary"} className={
              isInternal 
                ? "bg-fuchsia-500/20 text-fuchsia-400" 
                : "bg-cyan-500/20 text-cyan-400"
            }>
              {getOriginLabel(server.origin)}
            </Badge>
            {server.category && (
              <Badge variant="outline">{server.category}</Badge>
            )}
            {isRemoteCapable(server) && (
              <Badge variant="outline" className="border-green-500/30 text-green-400">
                <Cloud className="w-3 h-3 mr-1" />
                Remote Capable
              </Badge>
            )}
            {server.available ? (
              <Badge variant="outline" className="border-green-500/30 text-green-400">
                Available
              </Badge>
            ) : (
              <Badge variant="outline" className="border-red-500/30 text-red-400">
                Unavailable
              </Badge>
            )}
          </div>
          
          {/* Missing env vars */}
          {server.missingEnv && server.missingEnv.length > 0 && (
            <div className="p-3 rounded-sm bg-red-500/10 border border-red-500/30">
              <p className="text-xs font-mono text-red-400">
                Missing environment variables: {server.missingEnv.join(", ")}
              </p>
            </div>
          )}
          
          {/* Tools */}
          {server.tools && server.tools.length > 0 && (
            <div>
              <h4 className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
                Available Tools ({server.tools.length})
              </h4>
              <ScrollArea className="h-40">
                <div className="space-y-2 pr-3">
                  {server.tools.map((tool) => (
                    <div 
                      key={tool.name} 
                      className="p-2 rounded-sm bg-background/50 border border-sidebar-border"
                    >
                      <div className="font-mono text-xs text-cyan-400">{tool.name}</div>
                      {tool.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
          
          {/* Tags */}
          {server.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1">
                {server.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-sidebar-border">
            <Button 
              onClick={handleAddToWorkflow}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add to Workflow
            </Button>
            {server.repoUrl && (
              <Button variant="outline" asChild>
                <a href={server.repoUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="w-4 h-4 mr-2" />
                  Repository
                </a>
              </Button>
            )}
            {server.uiUrl && (
              <Button variant="outline" asChild>
                <a href={server.uiUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main Registry Page
// =============================================================================

export default function RegistryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<"all" | "glama" | "internal">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedServer, setSelectedServer] = useState<RegistryServer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Data fetching
  const { data: meta } = useRegistryMeta();
  const { data: categories } = useRegistryCategories();
  
  const { data: serversData, isLoading: loadingServers, refetch } = useRegistryServers({
    origin: selectedOrigin === "all" ? undefined : selectedOrigin,
    category: selectedCategory === "all" ? undefined : selectedCategory,
    limit: 100,
  });
  
  const { data: searchData, isLoading: loadingSearch } = useRegistrySearch(
    searchQuery,
    50
  );
  
  // Determine which servers to show
  const displayServers = useMemo(() => {
    if (searchQuery.length > 0 && searchData) {
      return searchData.servers;
    }
    return serversData?.servers || [];
  }, [searchQuery, searchData, serversData]);
  
  const isLoading = searchQuery.length > 0 ? loadingSearch : loadingServers;
  
  const handleSelectServer = (server: RegistryServer) => {
    setSelectedServer(server);
    setDetailOpen(true);
  };
  
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-cyan-400 neon-text">
              MCP REGISTRY
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse and install MCP servers for your workflows
            </p>
          </div>
          <div className="flex items-center gap-2">
            {meta && (
              <Badge variant="outline" className="font-mono text-xs">
                <Database className="w-3 h-3 mr-1" />
                {meta.totalServers} servers
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetch()}
              className="border-sidebar-border"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search servers by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background/50 border-sidebar-border font-mono"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={selectedOrigin} onValueChange={(v) => setSelectedOrigin(v as typeof selectedOrigin)}>
              <SelectTrigger className="w-[140px] bg-background/50 border-sidebar-border">
                <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="internal">Compose</SelectItem>
                <SelectItem value="glama">Glama</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[140px] bg-background/50 border-sidebar-border">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      ) : displayServers.length === 0 ? (
        <div className="text-center py-20">
          <Server className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {searchQuery ? "No servers match your search" : "No servers found"}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? (
                <>Found <span className="text-cyan-400 font-mono">{displayServers.length}</span> servers matching "{searchQuery}"</>
              ) : (
                <>Showing <span className="text-cyan-400 font-mono">{displayServers.length}</span> servers</>
              )}
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayServers.map((server) => (
              <ServerCard 
                key={server.registryId} 
                server={server} 
                onSelect={handleSelectServer}
              />
            ))}
          </div>
        </>
      )}
      
      {/* Detail Dialog */}
      <ServerDetailDialog
        server={selectedServer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

