/**
 * Market - Manowar Workflows & RFA Bounties
 * 
 * Browse and purchase ERC7401 workflow NFTs and submit agents for RFA bounties.
 */
import { useState } from "react";
import * as React from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOnchainManowars, useManowarsWithRFA, type OnchainManowar } from "@/hooks/use-onchain";
import { getIpfsUrl } from "@/lib/pinata";
import {
  Box,
  Layers,
  Search,
  Sparkles,
  RefreshCw,
  DollarSign,
  Clock,
  Users,
  Zap,
  FileQuestion,
  Award,
  Package,
  Percent,
  Calendar,
  Target,
  ExternalLink,
} from "lucide-react";

export default function Market() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:gap-2 border-b border-sidebar-border pb-4 sm:pb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white">
            <span className="text-fuchsia-500 mr-2">//</span>
            MARKET
          </h1>
          <div className="hidden md:flex h-px w-32 bg-gradient-to-r from-fuchsia-500 to-transparent"></div>
        </div>
        <p className="text-muted-foreground font-mono text-xs sm:text-sm">
          Discover workflows and RFA bounties on the Manowar protocol.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search workflows and bounties..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-background/50 border-sidebar-border font-mono text-sm"
        />
      </div>

      <Tabs defaultValue="manowars" className="w-full">
        <TabsList className="bg-sidebar-accent border border-sidebar-border p-1 mb-4 sm:mb-6 lg:mb-8 w-full sm:w-auto">
          <TabsTrigger 
            value="manowars" 
            className="flex-1 sm:flex-none data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-bold font-mono tracking-wide px-3 sm:px-6 lg:px-8 text-xs sm:text-sm"
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            MANOWARS
          </TabsTrigger>
          <TabsTrigger 
            value="rfas" 
            className="flex-1 sm:flex-none data-[state=active]:bg-fuchsia-500 data-[state=active]:text-white font-bold font-mono tracking-wide px-3 sm:px-6 lg:px-8 text-xs sm:text-sm"
          >
            <FileQuestion className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            RFAs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manowars" className="mt-0">
          <ManowarsTab searchQuery={searchQuery} />
        </TabsContent>

        <TabsContent value="rfas" className="mt-0">
          <RFAsTab searchQuery={searchQuery} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Manowars Tab - Complete ERC7401 Workflows
// =============================================================================

function ManowarsTab({ searchQuery }: { searchQuery: string }) {
  const [sort, setSort] = useState<"newest" | "price-low" | "price-high">("newest");
  const { data: manowars, isLoading, error, refetch } = useOnchainManowars({ 
    onlyComplete: true, 
    includeRFA: false 
  });

  // Filter and sort
  const filteredManowars = React.useMemo(() => {
    if (!manowars) return [];
    
    let filtered = manowars;
    
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.title.toLowerCase().includes(q) || 
        m.description.toLowerCase().includes(q)
      );
    }
    
    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sort) {
        case "price-low":
          return parseFloat(a.totalPrice) - parseFloat(b.totalPrice);
        case "price-high":
          return parseFloat(b.totalPrice) - parseFloat(a.totalPrice);
        case "newest":
        default:
          return b.id - a.id;
      }
    });
    
    return filtered;
  }, [manowars, searchQuery, sort]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full sm:w-[160px] bg-background/50 border-sidebar-border h-9 text-sm">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2">
          {manowars && (
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
              {filteredManowars.length} workflows
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-sidebar-border h-9 w-9"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="glass-panel">
              <CardHeader className="pb-2">
                <Skeleton className="h-32 w-full rounded" />
                <Skeleton className="h-4 w-3/4 mt-4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-20">
          <Box className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400">{error.message}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Manowars Grid */}
      {!isLoading && filteredManowars.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredManowars.map((manowar) => (
            <ManowarCard key={manowar.id} manowar={manowar} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredManowars.length === 0 && !isLoading && (
        <div className="text-center py-12 sm:py-20">
          <Layers className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm sm:text-base">
            {searchQuery ? "No workflows match your search" : "No workflows available yet"}
          </p>
          <Link href="/compose">
            <Button className="mt-4 bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-sm">
              CREATE FIRST WORKFLOW
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function ManowarCard({ manowar }: { manowar: OnchainManowar }) {
  const bannerUrl = manowar.banner && manowar.banner.startsWith("ipfs://") 
    ? getIpfsUrl(manowar.banner.replace("ipfs://", ""))
    : null;
  
  const unitsAvailable = manowar.units === 0 ? "∞" : `${manowar.units - manowar.unitsMinted}/${manowar.units}`;

  return (
    <Card className="glass-panel border-cyan-500/20 hover:border-cyan-500/60 transition-all duration-300 group overflow-hidden">
      {/* Banner */}
      <div className="h-28 sm:h-36 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 relative overflow-hidden">
        {bannerUrl ? (
          <img 
            src={bannerUrl} 
            alt={manowar.title}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(6,182,212,0.1)_25%,rgba(6,182,212,0.1)_50%,transparent_50%,transparent_75%,rgba(6,182,212,0.1)_75%,rgba(6,182,212,0.1)_100%)] bg-[length:20px_20px]"></div>
            <Layers className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-500/30 absolute" />
          </div>
        )}
        
        {/* Badges */}
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[8px] sm:text-[10px]">
            <Sparkles className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
            ERC-7401
          </Badge>
        </div>
        
        {/* Lease badge */}
        {manowar.leaseEnabled && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30 text-[8px] sm:text-[10px]">
              <Percent className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
              Leaseable
            </Badge>
          </div>
        )}
      </div>

      <CardHeader className="p-3 sm:p-4 pb-2">
        <CardTitle className="text-base sm:text-lg font-display font-bold text-white group-hover:text-cyan-400 transition-colors truncate">
          {manowar.title || `Manowar #${manowar.id}`}
        </CardTitle>
        <CardDescription className="line-clamp-2 text-[10px] sm:text-xs h-7 sm:h-8">
          {manowar.description || "No description"}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
            <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Total Price</p>
            <div className="flex items-center gap-1">
              <DollarSign className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-400" />
              <span className="font-mono text-xs sm:text-sm text-green-400 truncate">{manowar.totalPrice} USDC</span>
            </div>
          </div>
          <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
            <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">x402 Fee</p>
            <div className="flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-400" />
              <span className="font-mono text-xs sm:text-sm text-yellow-400 truncate">{manowar.x402Price} USDC</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
            <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Supply</p>
            <div className="flex items-center gap-1">
              <Package className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-cyan-400" />
              <span className="font-mono text-xs sm:text-sm text-cyan-400">{unitsAvailable}</span>
            </div>
          </div>
          {manowar.leaseEnabled && (
            <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Lease</p>
              <div className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-fuchsia-400" />
                <span className="font-mono text-[10px] sm:text-sm text-fuchsia-400 truncate">{manowar.leaseDuration}d @ {manowar.leasePercent}%</span>
              </div>
            </div>
          )}
          {manowar.coordinatorAgentId > 0 && (
            <div className="p-1.5 sm:p-2 bg-background border border-sidebar-border/50 rounded">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Coordinator</p>
              <div className="flex items-center gap-1">
                <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
                <span className="font-mono text-[10px] sm:text-sm text-amber-400 truncate">{manowar.coordinatorModel || "Active"}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-3 sm:p-4 pt-0 flex gap-2">
        <Button 
          className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold font-mono text-[10px] sm:text-xs h-8 sm:h-9"
        >
          <DollarSign className="w-3 h-3 mr-1" />
          PURCHASE
        </Button>
        <Button 
          variant="outline"
          className="border-sidebar-border hover:border-cyan-500/50 h-8 sm:h-9 w-8 sm:w-9"
          onClick={() => window.open(`https://testnet.snowtrace.io/token/${import.meta.env.VITE_MANOWAR_CONTRACT}?a=${manowar.id}`, "_blank")}
        >
          <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// =============================================================================
// RFAs Tab - Request-For-Agent Bounties
// =============================================================================

function RFAsTab({ searchQuery }: { searchQuery: string }) {
  const { data: rfaManowars, isLoading, error, refetch } = useManowarsWithRFA();

  // Filter
  const filteredRFAs = React.useMemo(() => {
    if (!rfaManowars) return [];
    
    if (!searchQuery) return rfaManowars;
    
    const q = searchQuery.toLowerCase();
    return rfaManowars.filter(m => 
      m.title.toLowerCase().includes(q) || 
      m.description.toLowerCase().includes(q)
    );
  }, [rfaManowars, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 sm:w-5 sm:h-5 text-fuchsia-400 shrink-0" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Submit an agent to claim RFA bounties
          </span>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2">
          {rfaManowars && (
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs border-fuchsia-500/30 text-fuchsia-400">
              {filteredRFAs.length} active bounties
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-sidebar-border h-9 w-9"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-panel">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-20">
          <FileQuestion className="w-12 h-12 mx-auto text-red-400/50 mb-4" />
          <p className="text-red-400">{error.message}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* RFAs Grid */}
      {!isLoading && filteredRFAs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {filteredRFAs.map((manowar) => (
            <RFACard key={manowar.id} manowar={manowar} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredRFAs.length === 0 && !isLoading && (
        <div className="text-center py-12 sm:py-20 border border-dashed border-sidebar-border rounded-lg">
          <FileQuestion className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm sm:text-base">
            {searchQuery ? "No RFAs match your search" : "No active bounties right now"}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-2 px-4">
            Create a workflow with missing agents to post an RFA
          </p>
        </div>
      )}
    </div>
  );
}

function RFACard({ manowar }: { manowar: OnchainManowar }) {
  // TODO: Fetch actual RFA data from RFA contract using manowar.rfaId
  // For now, showing manowar info with RFA indicator
  
  return (
    <Card className="glass-panel border-fuchsia-500/30 hover:border-fuchsia-500/60 transition-all duration-300 group">
      <CardHeader className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
              <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30 text-[8px] sm:text-[10px]">
                <Target className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                RFA #{manowar.rfaId}
              </Badge>
              <Badge variant="outline" className="text-[8px] sm:text-[10px] border-amber-500/30 text-amber-400">
                <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                Open
              </Badge>
            </div>
            <CardTitle className="text-base sm:text-lg font-display font-bold text-white group-hover:text-fuchsia-400 transition-colors truncate">
              {manowar.title || `Manowar #${manowar.id}`}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2 text-[10px] sm:text-xs">
              {manowar.description || "Agent needed for this workflow"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
        {/* Bounty Info */}
        <div className="p-2.5 sm:p-3 bg-gradient-to-r from-fuchsia-500/10 to-transparent border border-fuchsia-500/20 rounded">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase mb-0.5 sm:mb-1">Bounty Reward</p>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fuchsia-400 shrink-0" />
                <span className="font-mono text-base sm:text-lg font-bold text-fuchsia-400">
                  TBD USDC
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase mb-0.5 sm:mb-1">Escrowed</p>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[8px] sm:text-xs">
                ✓ Secured
              </Badge>
            </div>
          </div>
        </div>

        {/* Workflow Context */}
        <div className="text-[10px] sm:text-xs text-muted-foreground">
          <span className="text-muted-foreground/60">For workflow: </span>
          <span className="text-cyan-400 font-mono">Manowar #{manowar.id}</span>
        </div>
      </CardContent>

      <CardFooter className="p-3 sm:p-4 pt-0 flex flex-col sm:flex-row gap-2">
        <Button 
          className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-bold font-mono text-[10px] sm:text-xs h-8 sm:h-9"
        >
          <Award className="w-3 h-3 mr-1" />
          SUBMIT AGENT
        </Button>
        <Button 
          variant="outline"
          className="border-sidebar-border hover:border-fuchsia-500/50 h-8 sm:h-9 text-[10px] sm:text-xs"
        >
          VIEW DETAILS
        </Button>
      </CardFooter>
    </Card>
  );
}
