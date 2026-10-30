import {createQueueAttempts} from "./queue-attempt";
import {useMemo,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Bot,Cable,Search,ShieldCheck,Coins,AlertTriangle,ClipboardList} from "lucide-react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {cancelAgentRun,upsertAiUseCase} from "@/modules/intelligence/functions";
import {getAgentFactoryOperations,queueBudgetedFactoryTask,setAgentFactoryBudget,requestAgentMcpSetup} from "./operations.functions";
import {agentsForProduct,mcpConnectorFamilies,OFFICIAL_MCP_REGISTRY,type AgentBlueprint} from "./catalogue";
import {searchPublicMcpRegistry,type DiscoveredMcpServer} from "./registry.functions";

type UseCase={id:string;use_case_key:string;status:string;allowed_tools?:string[];risk_level?:string};
type Props={
  tenantId:string;
  productKey:string;
  useCases?:UseCase[];
  providers?:{provider_key:string;status:string;last_verified_at?:string|null}[];
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
export function AgentFactoryPanel({tenantId,productKey,useCases=[],providers=[],onChanged}:Props){
 const [search,setSearch]=useState("");
 const [selectedKey,setSelectedKey]=useState("");
 const [classification,setClassification]=useState("internal");
 const [saving,setSaving]=useState(false);
 const [running,setRunning]=useState(false);
 const [lastQueuedRun,setLastQueuedRun]=useState("");
 const [customGoal,setCustomGoal]=useState("");
 const saveFn=useServerFn(upsertAiUseCase);
 const queueFn=useServerFn(queueBudgetedFactoryTask);
 type QueuePayload={tenantId:string;productKey:string;useCaseId:string;profile:AgentBlueprint["profile"];
  goal:string;maxSteps:number;providerKey:string;modelKey:string;currency:"GBP"|"USD"|"EUR";
  inputTokens:number;cachedInputTokens:number;outputTokens:number;toolCeilingMinor:number};
 const attempts=useRef(createQueueAttempts<QueuePayload>(()=>crypto.randomUUID()));
 const [,refreshAttempt]=useState(0);
 const [discardScope,setDiscardScope]=useState("");
 const attemptScope=JSON.stringify([tenantId,productKey]);
 const pendingAttempt=attempts.current.pending({tenantId,productKey});
 const visibleScope=useRef({tenantId,productKey});
 visibleScope.current={tenantId,productKey};
 const cancelFn=useServerFn(cancelAgentRun);
 const getOperationsFn=useServerFn(getAgentFactoryOperations);
 const setBudgetFn=useServerFn(setAgentFactoryBudget);
 const requestMcpFn=useServerFn(requestAgentMcpSetup);
 const operations=useQuery({queryKey:["agent-factory-operations",tenantId,productKey],
  queryFn:()=>getOperationsFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const [budgetAmount,setBudgetAmount]=useState("");
 const [budgetCurrency,setBudgetCurrency]=useState<"GBP"|"USD"|"EUR">("GBP");
 const [budgetBusy,setBudgetBusy]=useState(false);
 const [requestBusy,setRequestBusy]=useState("");
 const [selectedRate,setSelectedRate]=useState("");
 const [maxInputTokens,setMaxInputTokens]=useState("20000");
 const [maxOutputTokens,setMaxOutputTokens]=useState("4000");
 const [cachedTokens,setCachedTokens]=useState("0");
 const [maxToolCost,setMaxToolCost]=useState("0");
 const registryFn=useServerFn(searchPublicMcpRegistry);
 const [directoryQuery,setDirectoryQuery]=useState("");
 const [directoryItems,setDirectoryItems]=useState<DiscoveredMcpServer[]>([]);
 const [directoryCursor,setDirectoryCursor]=useState<string|null>(null);
 const [directoryBusy,setDirectoryBusy]=useState(false);
 const [directoryError,setDirectoryError]=useState("");
 async function discover(cursor:string|null=null){
  if(!tenantId)return;
  setDirectoryBusy(true);setDirectoryError("");
  try{
   const found=await registryFn({data:{tenantId,search:directoryQuery,cursor}});
   setDirectoryItems(previous=>cursor?[...previous,...found.servers]:found.servers);
   setDirectoryCursor(found.nextCursor);
  }catch(e){setDirectoryError(e instanceof Error?e.message:String(e));}
  finally{setDirectoryBusy(false);}
 }
 const all=useMemo(()=>agentsForProduct(productKey),[productKey]);
 const items=useMemo(()=>all.filter(a=>[a.name,a.key,a.department,a.purpose].join(" ").toLowerCase().includes(search.toLowerCase())),[all,search]);
 const selected=all.find(a=>a.key===selectedKey)??null;
 const existing=selected?useCases.find(c=>c.use_case_key===selected.key):null;
 const providerReady=providers.some(p=>p.status==="active"&&!!p.last_verified_at&&
  Date.now()-Date.parse(p.last_verified_at)>=0&&Date.now()-Date.parse(p.last_verified_at)<86400000);
 const rates=operations.data?.rates??[];
 const currentRate=rates.find(r=>r.provider_key+"|"+r.model_key+"|"+r.currency===selectedRate);
 const budget=operations.data?.budgets?.find(b=>b.currency===(currentRate?.currency??budgetCurrency)&&
  b.period_month===new Date().toISOString().slice(0,7)+"-01");
 const activeProviderForRate=!!currentRate&&providers.some(p=>p.provider_key===currentRate.provider_key&&p.status==="active"&&
  !!p.last_verified_at&&Date.now()-Date.parse(p.last_verified_at)<86400000&&Date.now()>=Date.parse(p.last_verified_at));
 const numeric=(value:string)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;};
 const expected=(function(){
  if(!currentRate)return null;
  const input=numeric(maxInputTokens),cached=numeric(cachedTokens),output=numeric(maxOutputTokens),tool=numeric(maxToolCost);
  if(input===null||cached===null||output===null||tool===null||cached>input)return null;
  const million=(n:number,rate:number)=>Math.ceil(n*rate/1_000_000);
  return million(input-cached,currentRate.input_minor_per_million)+
   million(cached,currentRate.cached_input_minor_per_million??currentRate.input_minor_per_million)+
   million(output,currentRate.output_minor_per_million)+tool;
 })();
 async function saveBudget(){
  const major=Number(budgetAmount);
  if(!Number.isFinite(major)||major<0||Math.round(major*100)!==major*100||major>10_000_000){
   toast.error("Enter a valid monthly limit in whole pence");return;
  }
  setBudgetBusy(true);
  try{
   await setBudgetFn({data:{tenantId,productKey,currency:budgetCurrency,limitMinor:Math.round(major*100)}});
   toast.success("Monthly AI spending limit updated");
   await operations.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setBudgetBusy(false);}
 }
 async function requestConnector(item:DiscoveredMcpServer){
  setRequestBusy(item.name);
  try{
   await requestMcpFn({data:{tenantId,productKey,registryName:item.name,
    registryVersion:item.version||"unversioned",reason:"Request security review and secure onboarding for this SaaS product."}});
   toast.success("MCP server setup requested; this does not connect it.");
   await operations.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setRequestBusy("");}
 }
 const requireClassification=!!selected&&(selected.risk==="regulated"||selected.risk==="sensitive");
 const sensitiveClass=classification!=="internal";
 const departments=new Set(all.map(a=>a.department)).size;
 async function cancelQueuedRun(){
  if(!lastQueuedRun)return;
  setRunning(true);
  try{
   const result=await cancelFn({data:{tenantId,runId:lastQueuedRun}});
   toast.success(result.budgetReleased?"Queued task cancelled; reserved budget released":"Task cancelled");
   setLastQueuedRun("");
   await operations.refetch();await onChanged?.();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setRunning(false);}
 }
 async function queueApproved(agent:AgentBlueprint,useCaseId:string){
  if(!currentRate||!activeProviderForRate||expected===null||!budget){
   toast.error("Verified model pricing, an active provider and this month's budget are all required");return;
  }
  const input=numeric(maxInputTokens),cached=numeric(cachedTokens),output=numeric(maxOutputTokens),tool=numeric(maxToolCost);
  if(input===null||cached===null||output===null||tool===null||cached>input){toast.error("Invalid token limits");return;}
  await admitTask({tenantId,productKey,useCaseId,profile:agent.profile,
   goal:customGoal.trim()||agent.suggestedGoal,maxSteps:agent.defaultMaxSteps,
   providerKey:currentRate.provider_key,modelKey:currentRate.model_key,currency:currentRate.currency as "GBP"|"USD"|"EUR",
   inputTokens:input,cachedInputTokens:cached,outputTokens:output,toolCeilingMinor:tool});
 }
 async function admitTask(payload:QueuePayload){
  if(attempts.current.isBusy())return;
  const sameScope=()=>visibleScope.current.tenantId===payload.tenantId&&visibleScope.current.productKey===payload.productKey;
  setDiscardScope("");setRunning(true);
  try{
   const result=await attempts.current.submit(payload,data=>queueFn({data}));
   if(sameScope()){
    setLastQueuedRun(result.runId);
    toast.success(result.alreadyExists?"Existing task recovered. Check its current status in AI Control.":"Budget reserved and authorised AI task queued. Execution is subject to the separate worker.");
    try{await operations.refetch();await onChanged?.();}
    catch{toast.error("Task receipt confirmed; workspace refresh failed. Do not queue again to refresh it.");}
   }
  }catch(e){if(sameScope())toast.error(e instanceof Error?e.message:"Queue receipt unavailable");}
  finally{setRunning(false);refreshAttempt(n=>n+1);}
 }

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
  {pendingAttempt&&<div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
   <p className="text-sm font-medium">Previous queue request needs a confirmed receipt</p>
   <p className="text-xs">Retry uses the original task, limits and request ID, even if you changed the form. It may recover an existing task or submit it if the first request never arrived. Server permissions and approvals are checked again.</p>
   <p className="text-xs text-muted-foreground">Recovery is available while this workspace remains open. After reloading or leaving, inspect run history before submitting again.</p>
   <Button type="button" size="sm" variant="outline" disabled={running} onClick={()=>admitTask(pendingAttempt)}>Retry original queue request</Button>
   {discardScope===attemptScope?<div className="space-y-2">
    <p className="text-xs">Discarding recovery does not cancel a task or release its reserved funds. Check AI Control for an existing task before creating another.</p>
    <Button type="button" size="sm" variant="outline" disabled={running} onClick={()=>{attempts.current.discard({tenantId,productKey});setDiscardScope("");refreshAttempt(n=>n+1);}}>I checked run history; discard recovery</Button>
    <Button type="button" size="sm" variant="ghost" disabled={running} onClick={()=>setDiscardScope("")}>Keep recovery</Button>
   </div>:<Button type="button" size="sm" variant="ghost" disabled={running} onClick={()=>setDiscardScope(attemptScope)}>Discard recovery…</Button>}
  </div>}
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5"/> AI Agent Factory</h2>
    <p className="mt-1 text-sm text-muted-foreground">Reusable agents for every SaaS product. This catalogue is not a live connector, model or agent execution guarantee.</p>
   </div>
   <div className="flex flex-wrap gap-3 text-sm">
    <a href={OFFICIAL_MCP_REGISTRY} target="_blank" rel="noopener noreferrer" className="text-primary underline">Public MCP registry</a>
    <a href="/app/mcp-review" className="text-primary underline">Platform review queue (restricted)</a>
   </div>
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
   {existing&&<div className="space-y-2">
    <p className="text-sm">Existing AI use case: <b>{existing.status}</b>. A different authorised reviewer must approve it before running.</p>
    {["approved","pilot"].includes(existing.status)&&<>
     <label htmlFor="factory-run-goal" className="text-xs font-medium">Task instruction (optional)</label>
     <Input id="factory-run-goal" value={customGoal} maxLength={5000} onChange={e=>setCustomGoal(e.target.value)} placeholder={selected.suggestedGoal}/>
     <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Evaluated model / currency
       <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={selectedRate} onChange={e=>setSelectedRate(e.target.value)}>
        <option value="">Select verified rate</option>
        {rates.map(r=><option key={r.provider_key+"|"+r.model_key+"|"+r.currency} value={r.provider_key+"|"+r.model_key+"|"+r.currency}>
         {r.provider_key} · {r.model_key} · {r.currency}</option>)}
       </select>
      </label>
      <label className="text-xs">Estimated maximum cost
       <div className="mt-1 rounded-md border px-3 py-2 text-sm">{expected===null||!currentRate?"Choose rate first":currentRate.currency+" "+(expected/100).toFixed(2)}</div>
      </label>
      <label className="text-xs">Max input tokens<Input inputMode="numeric" value={maxInputTokens} onChange={e=>setMaxInputTokens(e.target.value)}/></label>
      <label className="text-xs">Max output tokens<Input inputMode="numeric" value={maxOutputTokens} onChange={e=>setMaxOutputTokens(e.target.value)}/></label>
      <label className="text-xs">Expected cached input tokens<Input inputMode="numeric" value={cachedTokens} onChange={e=>setCachedTokens(e.target.value)}/></label>
      <label className="text-xs">Tool cost ceiling (minor units)<Input inputMode="numeric" value={maxToolCost} onChange={e=>setMaxToolCost(e.target.value)}/></label>
     </div>
     {budget&&<p className="text-xs text-muted-foreground">Monthly {budget.currency} budget: {(budget.limit_minor/100).toFixed(2)} · Reserved: {(budget.reserved_minor/100).toFixed(2)} · Incurred: {(budget.spent_minor/100).toFixed(2)}</p>}
     <Button size="sm" disabled={running||!!pendingAttempt||!activeProviderForRate||expected===null||!budget||expected<=0} onClick={()=>queueApproved(selected,existing.id)}>{running?"Reserving…":"Reserve budget & queue approved task"}</Button>
     {(!providerReady||!rates.length||!budget)&&<p className="text-xs text-muted-foreground">Set a monthly budget and connect an independently verified, evaluated AI model before queueing. This action does not itself execute the task.</p>}
     {lastQueuedRun&&<div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-muted-foreground">Queued run: <code>{lastQueuedRun}</code>. Track status in AI Control.</p>
      <Button size="sm" variant="outline" disabled={running} onClick={cancelQueuedRun}>Cancel before processing</Button>
     </div>}
    </>}
   </div>}
  </div>}
  <div className="rounded-lg border p-3 space-y-3">
   <div><strong className="flex items-center gap-2 text-sm"><Cable className="h-4 w-4"/> Search the public MCP server directory</strong>
    <p className="mt-1 text-xs text-muted-foreground">Read-only official registry metadata. No server is connected, verified, installed or granted tenant access by searching.</p>
   </div>
   <div className="flex gap-2"><Input value={directoryQuery} onChange={e=>setDirectoryQuery(e.target.value)} aria-label="Search public MCP servers" placeholder="Examples: accounting, crm, calendar, marketing"/>
    <Button variant="outline" disabled={directoryBusy||!tenantId} onClick={()=>discover()}>{directoryBusy?"Searching…":"Search"}</Button>
   </div>
   {directoryError&&<p role="alert" className="text-sm text-destructive">{directoryError}</p>}
   <div className="space-y-2">{directoryItems.map((item,i)=><div key={item.name+item.version+i} className="rounded-md bg-muted/50 p-2">
    <div className="flex flex-wrap justify-between gap-2"><b className="text-xs break-all">{item.name}</b><Badge variant="outline">Unverified · {item.version||"version unknown"}</Badge></div>
    <p className="mt-1 text-xs text-muted-foreground">{item.description||"No description provided by registry."}</p>
    <Button size="sm" variant="outline" className="mt-2" disabled={!item.version||!!requestBusy}
     onClick={()=>requestConnector(item)}>{requestBusy===item.name?"Requesting…":"Request setup review"}</Button>
   </div>)}</div>
   {directoryCursor&&<Button size="sm" variant="outline" disabled={directoryBusy} onClick={()=>discover(directoryCursor)}>Load more results</Button>}
  </div>
  <div className="rounded-lg border p-3 space-y-3">
   <strong className="flex items-center gap-2 text-sm"><Coins className="h-4 w-4"/> Monthly AI spending controls</strong>
   <p className="text-xs text-muted-foreground">Configure a limit before budgeted AI tasks can be queued. No charges are created by setting a limit.</p>
   <div className="flex flex-wrap gap-2">
    <select aria-label="Budget currency" value={budgetCurrency} onChange={e=>setBudgetCurrency(e.target.value as "GBP"|"USD"|"EUR")}
     className="rounded-md border bg-background px-2 text-sm"><option>GBP</option><option>USD</option><option>EUR</option></select>
    <Input className="max-w-[160px]" value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)} aria-label="Monthly AI budget in major currency units" placeholder="100.00"/>
    <Button size="sm" variant="outline" disabled={budgetBusy||!tenantId||!productKey||!budgetAmount} onClick={saveBudget}>{budgetBusy?"Saving…":"Set monthly limit"}</Button>
   </div>
   <div className="space-y-1">{(operations.data?.budgets??[]).slice(0,6).map(b=><p key={b.period_month+b.currency} className="text-xs text-muted-foreground">
    {b.period_month} · {b.currency} {(b.limit_minor/100).toFixed(2)} limit · {(b.reserved_minor/100).toFixed(2)} reserved · {(b.spent_minor/100).toFixed(2)} used
   </p>)}</div>
   {operations.error&&<p role="alert" className="text-xs text-destructive">AI operating data unavailable; production migrations and permissions must be verified.</p>}
   <p className="text-xs text-muted-foreground">MCP onboarding requests: {(operations.data?.mcpRequests??[]).length}. {operations.data?.mcpRequests?.slice(0,3).map(q=>q.registry_name+" ("+q.status+")").join(" · ")}</p>
  </div>
  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
   <div className="flex gap-2 font-semibold"><Coins className="h-4 w-4"/> Model-cost routing design</div>
   Verified provider prices, cached-token rates, quality evaluations, region restrictions and per-run budgets are required for a real estimate. No assumed savings or production billing are displayed.
  </div>
 </CardContent></Card>;
}
