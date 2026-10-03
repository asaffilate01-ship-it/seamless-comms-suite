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
import {activateBillingSubscription,createEmbeddedSurface,createDispatchShift,getBillingWorkspace,getMobileFleetWorkspace,getPlatformDepthWorkspace,saveBillingPlan,saveMobileProfile} from "@/modules/reconciliation/functions";
import {Boxes,Languages,RefreshCw,Smartphone,WalletCards} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/platform-depth")({component:PlatformDepth,head:()=>({meta:[{title:"Platform Depth — Omniqora"},{name:"robots",content:"noindex"}]})});
function PlatformDepth(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),billingFn=useServerFn(getBillingWorkspace),mobileFn=useServerFn(getMobileFleetWorkspace),depthFn=useServerFn(getPlatformDepthWorkspace),planFn=useServerFn(saveBillingPlan),activateFn=useServerFn(activateBillingSubscription),profileFn=useServerFn(saveMobileProfile),embedFn=useServerFn(createEmbeddedSurface),shiftFn=useServerFn(createDispatchShift);
 const tenant=useQuery({queryKey:["depth-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const billing=useQuery({queryKey:["depth-billing",tenantId,productKey],queryFn:()=>billingFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const mobile=useQuery({queryKey:["depth-mobile",tenantId,productKey],queryFn:()=>mobileFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const depth=useQuery({queryKey:["depth-core",tenantId,productKey],queryFn:()=>depthFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[planKey,setPlanKey]=useState(""),[planName,setPlanName]=useState(""),[price,setPrice]=useState("0"),[profileName,setProfileName]=useState("Universal Agent"),[embedName,setEmbedName]=useState("Embedded Portal");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await Promise.all([billing.refetch(),mobile.refetch(),depth.refetch()]);}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Platform Depth" subtitle="Landlord billing/metering, Mobile Core & fleet depth, localisation, embeds, scheduled reports, agent templates and telecom orchestration."
 actions={<Button size="sm" variant="outline" onClick={()=>Promise.all([billing.refetch(),mobile.refetch(),depth.refetch()])}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={WalletCards} label="Subscriptions" value={billing.data?.subscriptions?.length??0}/><Metric icon={Smartphone} label="Mobile devices" value={mobile.data?.devices?.length??0}/><Metric icon={Boxes} label="Agent templates" value={depth.data?.agentTemplates?.length??0}/><Metric icon={Languages} label="Saudi region" value={depth.data?.saudiRegion?1:0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Landlord billing plan</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="plan-key" value={planKey} onChange={e=>setPlanKey(e.target.value)}/><Input placeholder="Plan name" value={planName} onChange={e=>setPlanName(e.target.value)}/></div><Input className="mt-2" type="number" placeholder="Monthly price minor units" value={price} onChange={e=>setPrice(e.target.value)}/><div className="mt-3 flex gap-2"><Button disabled={!planKey||!planName} onClick={()=>run(()=>planFn({data:{productKey,planKey,name:planName,currency:"GBP",priceMinor:Number(price)||0}}),"Plan saved")}>Save plan</Button><Button variant="outline" disabled={!(billing.data?.plans??[])[0]} onClick={()=>run(()=>activateFn({data:{tenantId,productKey,planKey:billing.data.plans[0].plan_key}}),"Subscription activated by landlord")}>Activate first plan</Button></div><div className="mt-4 space-y-2">{(billing.data?.plans??[]).map((x:any)=><div key={x.plan_key} className="flex items-center justify-between rounded-lg border p-3 text-sm"><b>{x.name}</b><StatusBadge status={x.status}/></div>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Universal Agent mobile profile</h2><Input className="mt-3" value={profileName} onChange={e=>setProfileName(e.target.value)}/><Button className="mt-3" onClick={()=>run(()=>profileFn({data:{tenantId,productKey,profileKey:"universal-agent",name:profileName,capabilities:["offline","background_gps","camera","documents","maps","chat","voice","passkeys"]}}),"Mobile profile saved")}>Save offline-ready profile</Button><div className="mt-4 flex flex-wrap gap-2">{(mobile.data?.profiles??[]).map((x:any)=><Badge key={x.id} variant="outline">{x.name}</Badge>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Embedded white-label surface</h2><Input className="mt-3" value={embedName} onChange={e=>setEmbedName(e.target.value)}/><Button className="mt-3" onClick={()=>run(()=>embedFn({data:{tenantId,productKey,surfaceKey:"default-widget",name:embedName}}),"Embedded surface created")}>Create widget surface</Button><div className="mt-4 space-y-2">{(depth.data?.embeds??[]).map((x:any)=><div key={x.id} className="rounded-lg bg-muted p-3 text-sm"><b>{x.name}</b><p className="text-xs text-muted-foreground">{x.surface_type} · {x.surface_key}</p></div>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Agent packs & platform depth</h2><p className="mt-2 text-sm text-muted-foreground">38 governed reusable agent templates are catalogued across customer service, sales, marketing, finance, operations, compliance, transaction and industry packs.</p><div className="mt-4 flex flex-wrap gap-2">{(depth.data?.agentTemplates??[]).slice(0,18).map((x:any)=><Badge key={x.template_key} variant="outline">{x.name}</Badge>)}</div><p className="mt-4 text-xs text-muted-foreground">Also active: Saudi SA/ar-SA/en-SA region pack, scheduled reporting, analytics sinks, tenant translations and telecom line/SIM/eSIM orchestration.</p></CardContent></Card>
  </div>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof Boxes;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
