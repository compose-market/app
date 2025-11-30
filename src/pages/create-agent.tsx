import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { useToast } from "@/hooks/use-toast";
import { Cpu, DollarSign, ShieldCheck, Upload } from "lucide-react";
import { AVAILABLE_MODELS } from "@/lib/models";

const formSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(10),
  model: z.string(),
  pricePerUse: z.string(),
  endpoint: z.string().url(),
  isCloneable: z.boolean(),
  cloneFee: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateAgent() {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      model: "llama-3-70b",
      pricePerUse: "0.01",
      endpoint: "https://",
      isCloneable: false,
      cloneFee: "",
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    console.log(values);
    toast({
      title: "Agent Minted Successfully!",
      description: "Your ERC8004 Identity has been deployed to Avalanche Fuji.",
    });
  };

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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background/50 border-sidebar-border">
                                <SelectValue placeholder="Select a model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {AVAILABLE_MODELS.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name} (${model.priceMultiplier}/1M tokens)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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

              <Card className="glass-panel border-fuchsia-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-bold font-display text-fuchsia-400">
                    <DollarSign className="w-5 h-5" />
                    FINANCIAL SPECS (x402)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="pricePerUse"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-foreground">Price Per Request (x402)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" {...field} className="bg-background/50 font-mono border-sidebar-border focus:border-fuchsia-500" />
                        </FormControl>
                        <FormDescription className="text-muted-foreground">
                          The amount deducted from the user's stream for each interaction.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="isCloneable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-sm border border-sidebar-border p-4 bg-background/30">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-mono text-foreground">Allow Cloning?</FormLabel>
                          <FormDescription className="text-muted-foreground">
                            Let others fork this agent. You earn a franchise fee.
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

              <Button type="submit" size="lg" className="w-full bg-cyan-500 text-black font-bold font-mono hover:bg-cyan-400 h-14 text-lg shadow-[0_0_20px_-5px_hsl(var(--primary))] tracking-wider">
                MINT AGENT ON AVALANCHE
              </Button>
            </form>
          </Form>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-sm space-y-4 border border-fuchsia-500/20 corner-decoration">
            <div className="w-full aspect-square rounded-sm bg-background/50 border border-sidebar-border border-dashed flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:border-cyan-500 hover:text-cyan-400 transition-colors">
              <Upload className="w-8 h-8 mb-2" />
              <span className="text-xs font-mono">UPLOAD AVATAR</span>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold font-display text-white">Minting Info</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-mono">Gas Estimate</span>
                <span className="font-mono text-cyan-400">~0.02 AVAX</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-mono">Contract</span>
                <span className="font-mono text-cyan-400">ERC8004</span>
              </div>
            </div>
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
