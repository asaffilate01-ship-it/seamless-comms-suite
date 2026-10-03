import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createContactCentre,createContactQueue,getContactCentreWorkspace} from "@/modules/reconciliation/functions";
import {Headphones,PhoneCall,RefreshCw,Users} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/contact-centre")({component:ContactCentre,head:()=>({meta:[{title:"Contact Centre — Omniqora"},{name:"robots",content:"noindex"}]})});
function ContactCentre(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getContactCentreWorkspace),centreFn=useServerFn(createContactCentre),queueFn=useServerFn(createContactQueue);
 const tenant=useQuery({queryKey:["contact-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["contact-centre",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[name,setName]=useState(""),[queueName,setQueueName]=useState("");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 const m=q.data?.metrics??{};
 return <AppShell title="Omniqora Contact" subtitle="AI-first voice/contact centre with queues, callbacks, warm handover, same-agent preference, masking, transcripts and attribution."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={PhoneCall} label="Interactions" value={m.total??q.data?.interactions?.length??0}/><Metric icon={Headphones} label="AI resolved %" value={m.aiResolutionRate??0}/><Metric icon={Users} label="Agents" value={q.data?.agents?.length??0}/><Metric icon={PhoneCall} label="Callbacks" value={q.data?.callbacks?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Contact centre</h2><div className="mt-3 flex gap-2"><Input placeholder="Centre name" value={name} onChange={e=>setName(e.target.value)}/><Button disabled={!name} onClick={()=>run(()=>centreFn({data:{tenantId,productKey,name,aiResolutionTarget:80}}),"Contact centre created")}>Create</Button></div>
    <div className="mt-4 space-y-2">{(q.data?.centres??[]).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{x.name}</b><p className="text-xs text-muted-foreground">AI target {x.ai_resolution_target}% · recording {x.recording_policy}</p></div><StatusBadge status={x.status}/></div>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Queues</h2><div className="mt-3 flex gap-2"><Input placeholder="Queue name" value={queueName} onChange={e=>setQueueName(e.target.value)}/><Button disabled={!queueName||!(q.data?.centres??[])[0]} onClick={()=>run(()=>queueFn({data:{tenantId,productKey,centreId:q.data.centres[0].id,name:queueName,skills:[]}}),"Queue created")}>Create</Button></div>
    <div className="mt-4 space-y-2">{(q.data?.queues??[]).map((x:any)=><div key={x.id} className="rounded-lg bg-muted p-3 text-sm"><b>{x.name}</b><p className="text-xs text-muted-foreground">AI first · callback {x.callback_enabled?"on":"off"} · same agent {x.same_agent_enabled?"on":"off"}</p></div>)}</div>
   </CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Recent interactions</h2><div className="mt-4 grid gap-2 lg:grid-cols-2">{(q.data?.interactions??[]).slice(0,16).map((x:any)=><div key={x.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{x.intent||x.channel}</b><StatusBadge status={x.status}/></div><p className="mt-1 text-xs text-muted-foreground">{x.direction} · {x.ai_resolved?"AI resolved":x.assigned_agent_id?"human":"unassigned"}</p></div>)}</div></CardContent></Card>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof PhoneCall;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
