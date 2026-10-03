import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createRegulatoryMonitor,getRegulatoryMonitoringWorkspace,reviewRegulatoryChange} from "@/modules/reconciliation/functions";
import {RefreshCw,ShieldCheck} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/regulatory-monitoring")({component:RegulatoryMonitoring,head:()=>({meta:[{title:"Regulatory Monitoring — Omniqora"},{name:"robots",content:"noindex"}]})});
function RegulatoryMonitoring(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getRegulatoryMonitoringWorkspace),createFn=useServerFn(createRegulatoryMonitor),reviewFn=useServerFn(reviewRegulatoryChange);
 const tenant=useQuery({queryKey:["regulatory-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["regulatory-monitoring",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[sourceKey,setSourceKey]=useState(""),[authority,setAuthority]=useState(""),[jurisdiction,setJurisdiction]=useState("GB"),[sourceUrl,setSourceUrl]=useState("");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Regulatory Monitoring" subtitle="Versioned authority sources, content-change evidence, outages and reviewed downstream impact."
  actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4">{[["Monitors",q.data?.monitors?.length??0],["Changes",q.data?.changes?.length??0],["Outages",q.data?.outages?.length??0],["Snapshots",q.data?.snapshots?.length??0]].map(([k,v])=><Card key={String(k)}><CardContent className="p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div><div className="mt-2 font-display text-2xl font-semibold">{v}</div></CardContent></Card>)}</div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Add authority source</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="source-key" value={sourceKey} onChange={e=>setSourceKey(e.target.value)}/><Input placeholder="Authority" value={authority} onChange={e=>setAuthority(e.target.value)}/></div><div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr]"><Input value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)}/><Input placeholder="https://..." value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/></div><Button className="mt-3" disabled={!sourceKey||!authority||!sourceUrl} onClick={()=>run(()=>createFn({data:{tenantId,productKey,sourceKey,authority,jurisdiction,sourceType:"official",sourceUrl,providerKey:null,collectionKey:"regulatory",pollingRrule:"FREQ=DAILY"}}),"Regulatory monitor created")}>Create monitor</Button><div className="mt-4 space-y-2">{(q.data?.monitors??[]).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{x.authority}</b><p className="text-xs text-muted-foreground">{x.jurisdiction} · revision {x.current_revision}</p></div><StatusBadge status={x.status}/></div>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/><h2 className="font-semibold">Changes requiring review</h2></div><div className="mt-4 space-y-2">{(q.data?.changes??[]).slice(0,20).map((x:any)=><div key={x.id} className="rounded-lg bg-muted p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{x.summary||x.change_type}</b><Badge variant="outline">{x.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">revision {x.from_revision??0} → {x.to_revision}</p>{x.status==="review"&&<div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={()=>run(()=>reviewFn({data:{tenantId,changeId:x.id,status:"accepted",impact:{}}}),"Change accepted")}>Accept</Button><Button size="sm" onClick={()=>run(()=>reviewFn({data:{tenantId,changeId:x.id,status:"action_required",impact:{requiresReview:true}}}),"Action required recorded")}>Action required</Button></div>}</div>)}</div></CardContent></Card>
  </div>
 </AppShell>
}
