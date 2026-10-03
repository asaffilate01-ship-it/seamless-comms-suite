import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createConsentTopic,createGrowthExperiment,getGrowthLabWorkspace} from "@/modules/reconciliation/functions";
import {FlaskConical,RefreshCw,Share2,ShieldCheck} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/growth-lab")({component:GrowthLab,head:()=>({meta:[{title:"Growth Lab — Omniqora"},{name:"robots",content:"noindex"}]})});
function GrowthLab(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getGrowthLabWorkspace),experimentFn=useServerFn(createGrowthExperiment),consentFn=useServerFn(createConsentTopic);
 const tenant=useQuery({queryKey:["growthlab-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["growth-lab",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[name,setName]=useState(""),[hypothesis,setHypothesis]=useState(""),[goal,setGoal]=useState("conversion.completed"),[topicKey,setTopicKey]=useState("marketing"),[topicName,setTopicName]=useState("Marketing"),[purpose,setPurpose]=useState("Customer communications and offers");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Growth Lab" subtitle="Consent/preferences, A/B/n or bandit experiments, attribution, referrals, feedback recovery and journey measurement."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={FlaskConical} label="Experiments" value={q.data?.experiments?.length??0}/><Metric icon={ShieldCheck} label="Consent topics" value={q.data?.consentTopics?.length??0}/><Metric icon={Share2} label="Referrals" value={q.data?.referralProgrammes?.length??0}/><Metric icon={Share2} label="Attribution touches" value={q.data?.attribution?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Create controlled experiment</h2><Input className="mt-3" placeholder="Experiment name" value={name} onChange={e=>setName(e.target.value)}/><Textarea className="mt-2" placeholder="Hypothesis" value={hypothesis} onChange={e=>setHypothesis(e.target.value)}/><Input className="mt-2" placeholder="Goal event" value={goal} onChange={e=>setGoal(e.target.value)}/><Button className="mt-3" disabled={!name||hypothesis.length<5||!goal} onClick={()=>run(()=>experimentFn({data:{tenantId,productKey,name,hypothesis,goalEvent:goal}}),"Experiment created with control/variant")}>Create draft</Button>
    <div className="mt-4 space-y-2">{(q.data?.experiments??[]).slice(0,10).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{x.name}</b><p className="text-xs text-muted-foreground">{x.goal_event} · {x.experiment_type}</p></div><StatusBadge status={x.status}/></div>)}</div>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Consent / preference topic</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input value={topicKey} onChange={e=>setTopicKey(e.target.value)}/><Input value={topicName} onChange={e=>setTopicName(e.target.value)}/></div><Textarea className="mt-2" value={purpose} onChange={e=>setPurpose(e.target.value)}/><Button className="mt-3" disabled={!topicKey||!topicName||!purpose} onClick={()=>run(()=>consentFn({data:{tenantId,productKey,topicKey,name:topicName,purpose}}),"Consent topic saved")}>Save topic</Button>
    <div className="mt-4 space-y-2">{(q.data?.consentTopics??[]).map((x:any)=><div key={x.id} className="rounded-lg bg-muted p-3 text-sm"><b>{x.name}</b><p className="text-xs text-muted-foreground">{x.purpose}</p></div>)}</div>
   </CardContent></Card>
  </div>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof FlaskConical;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
