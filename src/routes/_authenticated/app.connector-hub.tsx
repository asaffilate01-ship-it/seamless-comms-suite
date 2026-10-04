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
import {getConnectorHub,recordConnectorHealth,saveReceptionSettings,upsertCommunicationIdentity} from "@/modules/connectors/functions";
import {Cable,HeartPulse,Inbox,RefreshCw,Radio} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/connector-hub")({component:ConnectorHub,head:()=>({meta:[{title:"Connector Hub — Omniqora"},{name:"robots",content:"noindex"}]})});

function ConnectorHub(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getConnectorHub),
 healthFn=useServerFn(recordConnectorHealth),identityFn=useServerFn(upsertCommunicationIdentity),receptionFn=useServerFn(saveReceptionSettings);
 const tenant=useQuery({queryKey:["connector-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["connector-hub",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[channel,setChannel]=useState<"whatsapp"|"sms"|"email"|"voice"|"push">("whatsapp"),[address,setAddress]=useState(""),[provider,setProvider]=useState("");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Connector & Communications Hub" subtitle="One provider layer for product integrations, health, sync, webhooks, reconciliation, channel identities and reception."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={Cable} label="Bindings" value={q.data?.bindings?.length??0}/><Metric icon={HeartPulse} label="Health checks" value={q.data?.health?.length??0}/><Metric icon={Inbox} label="Webhook inbox" value={q.data?.webhookInbox?.length??0}/><Metric icon={Radio} label="Channel IDs" value={q.data?.communicationIdentities?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Provider bindings</h2><div className="mt-3 space-y-2">{(q.data?.bindings??[]).map((b:any)=>{const last=(q.data?.health??[]).find((h:any)=>h.provider_key===b.provider_key);return <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><b>{b.provider_key}</b><p className="text-xs text-muted-foreground">{b.environment} · {b.status}</p></div><div className="flex gap-2"><StatusBadge status={last?.status??"unverified"}/><Button size="sm" variant="outline" onClick={()=>run(()=>healthFn({data:{tenantId,productKey,providerKey:b.provider_key,bindingId:b.id,status:"healthy",latencyMs:null,detail:{manualCheck:true}}}),"Health evidence recorded")}>Mark healthy</Button></div></div>})}</div>
   <div className="mt-4 flex flex-wrap gap-2">{(q.data?.requirements??[]).map((r:any)=><Badge key={r.provider_key} variant={r.required?"default":"outline"}>{r.provider_key}{r.required?" · required":""}</Badge>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Communication identity</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={channel} onChange={e=>setChannel(e.target.value as any)}>{["whatsapp","sms","email","voice","push"].map(x=><option key={x}>{x}</option>)}</select><Input placeholder="Provider key" value={provider} onChange={e=>setProvider(e.target.value)}/></div><Input className="mt-2" placeholder="Number, email or channel address" value={address} onChange={e=>setAddress(e.target.value)}/><Button className="mt-3" disabled={!address} onClick={()=>run(()=>identityFn({data:{tenantId,productKey,channel,providerKey:provider||null,address,displayName:null,config:{}}}),"Communication identity saved")}>Save identity</Button>
   <div className="mt-4 space-y-2">{(q.data?.communicationIdentities??[]).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><div><b>{x.channel}</b><p className="text-xs text-muted-foreground">{x.address}</p></div><StatusBadge status={x.status}/></div>)}</div></CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Reception / AI front door</h2><p className="text-xs text-muted-foreground">Channel intake can create a reception request; consequential actions remain limited to the configured allow-list.</p></div><Button variant="outline" onClick={()=>run(()=>receptionFn({data:{tenantId,productKey,enabled:true,greeting:"",businessHours:{},escalationRules:{},allowedActions:["crm.note","task.create"],config:{}}}),"Reception enabled")}>Enable controlled reception</Button></div><div className="mt-4 grid gap-2 md:grid-cols-2">{(q.data?.receptionRequests??[]).slice(0,12).map((x:any)=><div key={x.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{x.intent||"Unclassified"}</b><StatusBadge status={x.status}/></div><p className="mt-1 text-xs text-muted-foreground">{x.channel} · {x.summary||"No summary"}</p></div>)}</div></CardContent></Card>
 </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Cable;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
