import {useMemo,useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {Bot,Cable,Search,ShieldCheck,Coins,AlertTriangle,ClipboardList} from "lucide-react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {upsertAiUseCase} from "@/modules/intelligence/functions";
import {agentsForProduct,mcpConnectorFamilies,OFFICIAL_MCP_REGISTRY,type AgentBlueprint} from "./catalogue";

type UseCase={id:string;use_case_key:string;status:string;allowed_tools?:string[];risk_level?:string};
type Props={
  tenantId:string;
  productKey:string;
  useCases?:UseCase[];
  onChanged?:()=>Promise<unknown>;
};
const classifications=[
 ["internal","Internal business records"],["financial","Financial / accounting"],
 ["special_category","Sensitive HR / special-category"],["children","Children / safeguarding"],
 ["legal_privileged","Legally privileged"],["payment","Payments"],
 ["health","Health"]
] as const;

/**
 * Does not call models or connect MCPs. Creates a governed AI use-case assessment
 * in the EXISTING intelligence control-plane; independent approval is still required.
 */
export function AgentFactoryPanel({tenantId,productKey,useCases=[],onChanged}:Props){
 const [search,setSearch]=useState("");
 const [selectedKey,setSelectedKey]=useState("");
 const [classification,setClassification]=useState("internal");
 const [saving,setSaving]=useState(false);
 const saveFn=useServerFn(upsertAiUseCase);
 const all=useMemo(()=>agentsForProduct(productKey),[productKey]);
 const items=useMemo(()=>all.filter(a=>[a.name,a.key,a.department,a.purpose].join(" ").toLowerCase().includes(search.toLowerCase())),[all,search]);
 const selected=all.find(a=>a.key===selectedKey)??null;
 const existing=selected?useCases.find(c=>c.use_case_key===selected.key):null;
 const requireClassification=!!selected&&(selected.risk==="regulated"||selected.risk==="sensitive");
 const sensitiveClass=classification!=="internal";
 const departments=new Set(all.map(a=>a.department)).size;
 async function submit(agent:AgentBlueprint){
  if(!tenantId||!productKey){toast.error("Select a tenant and product");return;}
  if(useCases.some(u=>u.use_case_key===agent.key)){toast.error("Use case already registered; review it in AI Control");return;}
  if(agent.risk!=="standard"&&!sensitiveClass){toast.error("Choose the correct sensitive-data category before registering");return;}
  try{
   setSaving(true);
   await saveFn({data:{
    tenantId,productKey,useCaseKey:agent.key,name:agent.name,
    purpose:agent.purpose+" Review requirement: "+agent.humanReview,
    dataClasses:[classification],allowedTools:[...agent.requiredCapabilities],
    providerRoute:{factoryBlueprint:agent.key,execution:"not_enabled",mcpBindings:"unverified"},
    monthlyBudgetMinor:null,budgetCurrency:null,evidenceRefs:[]
   }});
   toast.success("Agent use case registered for independent review; no tools were connected or executed.");
   await onChanged?.();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setSaving(false);}
 }
 return <Card><CardContent className="p-5 space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5"/> AI Agent Factory</h2>
    <p className="mt-1 text-sm text-muted-foreground">Reusable agents for every SaaS product. This catalogue is not a live connector, model or agent execution guarantee.</p>
   </div>
   <a href={OFFICIAL_MCP_REGISTRY} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Explore official MCP registry</a>
  </div>
  <div className="grid gap-2 sm:grid-cols-3">
   <div className="rounded-lg border p-3"><p className="flex gap-2 text-xs text-muted-foreground"><Bot className="h-4 w-4"/> Available agent blueprints</p><strong className="text-xl">{all.length}</strong></div>
   <div className="rounded-lg border p-3"><p className="flex gap-2 text-xs text-muted-foreground"><ClipboardList className="h-4 w-4"/> Departments</p><strong className="text-xl">{departments}</strong></div>
   <div className="rounded-lg border p-3"><p className="flex gap-2 text-xs text-muted-foreground"><Cable className="h-4 w-4"/> MCP discovery categories</p><strong className="text-xl">{mcpConnectorFamilies.length}</strong></div>
  </div>
  <div className="flex items-center gap-2">
   <Search className="h-4 w-4 text-muted-foreground"/><Input aria-label="Search agents" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search HR, accounting, marketing, recruitment, finance…"/>
  </div>
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
   {items.map(agent=>{
    const saved=useCases.find(c=>c.use_case_key===agent.key);
    return <button type="button" key={agent.key} onClick={()=>setSelectedKey(agent.key)}
      className={"rounded-lg border p-3 text-left transition hover:bg-muted/50 "+(selectedKey===agent.key?"border-primary":"")}>
     <div className="flex items-start justify-between gap-2"><strong className="text-sm">{agent.name}</strong><Badge variant="outline">{agent.mode.replace("_"," ")}</Badge></div>
     <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.purpose}</p>
     <div className="mt-2 flex flex-wrap items-center gap-1"><Badge variant="secondary">{agent.department.replace("_"," ")}</Badge>
      {saved?<Badge variant="outline">{saved.status}</Badge>:<Badge variant="outline">Not registered</Badge>}
     </div>
    </button>;
   })}
  </div>
  {items.length===0&&<p className="text-sm text-muted-foreground">No matching blueprint. Universal agents are available for every product, including products not yet assigned a sector.</p>}
  {selected&&<div className="space-y-3 rounded-lg border p-4">
   <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/><strong>{selected.name} — activation checklist</strong></div>
   <p className="text-sm">{selected.purpose}</p>
   <p className="text-xs text-muted-foreground">Suggested one-click task: {selected.suggestedGoal}</p>
   <div className="flex flex-wrap gap-2">{selected.requiredCapabilities.map(c=><Badge key={c} variant="outline">{c}</Badge>)}</div>
   <p className="text-xs text-muted-foreground">{selected.humanReview} Verified connector capabilities, tenant permission grants, an independently approved use case, provider health and a funded runtime are separately required before execution.</p>
   <div className="flex flex-wrap items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600"/><span className="text-xs">MCP discovery does not authorise data access. Never store API keys in the browser.</span></div>
   {!existing&&<div className="flex flex-wrap items-center gap-2">
    <label htmlFor="factory-data-class" className="text-xs">Data classification</label>
    <select id="factory-data-class" value={classification} onChange={e=>setClassification(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
     {classifications.map(([k,label])=><option value={k} key={k}>{label}</option>)}
    </select>
    <Button size="sm" onClick={()=>submit(selected)} disabled={saving||!tenantId||!productKey||(requireClassification&&!sensitiveClass)}>
     {saving?"Saving…":"Register for independent review"}
    </Button>
   </div>}
   {existing&&<p className="text-sm">Existing AI use case: <b>{existing.status}</b>. Use the AI Control & Governance section below to review it. Reapproval is required after material changes.</p>}
  </div>}
  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
   <div className="flex gap-2 font-semibold"><Coins className="h-4 w-4"/> Model-cost routing design</div>
   Verified provider prices, cached-token rates, quality evaluations, region restrictions and per-run budgets are required for a real estimate. No assumed savings or production billing are displayed.
  </div>
 </CardContent></Card>;
}
