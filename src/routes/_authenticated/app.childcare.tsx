import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useMemo,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createChildcareMatch,createChildcareParentContact,createChildcareProviderContact,getChildcareWorkspace,saveChildcareCompliance,setChildcareAvailability} from "@/modules/childcare/functions";
import {CalendarDays,RefreshCw,ShieldCheck,Users} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/childcare")({component:Childcare,head:()=>({meta:[{title:"Childcare Operations — Omniqora"},{name:"robots",content:"noindex"}]})});

function Childcare(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getChildcareWorkspace),
 parentFn=useServerFn(createChildcareParentContact),providerFn=useServerFn(createChildcareProviderContact),availabilityFn=useServerFn(setChildcareAvailability),
 matchFn=useServerFn(createChildcareMatch),complianceFn=useServerFn(saveChildcareCompliance);
 const tenant=useQuery({queryKey:["childcare-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=useMemo(()=>{const rows=(tenant.data?.products??[]).map((p:any)=>p.product_key);return rows.includes("kindelo")?["kindelo"]:rows},[tenant.data]);
 const[productKey,setProductKey]=useState("");useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0])},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["childcare",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[parentName,setParentName]=useState(""),[parentEmail,setParentEmail]=useState(""),[providerName,setProviderName]=useState(""),[providerEmail,setProviderEmail]=useState(""),[providerRef,setProviderRef]=useState("");
 async function run(fn:()=>Promise<any>,msg:string){try{const r=await fn();toast.success(msg);await q.refetch();return r}catch(e){toast.error(e instanceof Error?e.message:String(e))}}
 const providers=q.data?.providers??[],children=q.data?.children??[],selectedProvider=providers[0],selectedChild=children[0];
 return <AppShell title="Childcare Agency Operations" subtitle="Shared Kindelo parent/provider CRM, availability, matching and evidence-led compliance without duplicating the core platform."
 actions={<Button variant="outline" size="sm" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={Users} label="Parents" value={q.data?.parents?.length??0}/><Metric icon={Users} label="Providers" value={providers.length}/><Metric icon={CalendarDays} label="Availability slots" value={q.data?.availability?.length??0}/><Metric icon={ShieldCheck} label="Compliance records" value={q.data?.compliance?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Parent onboarding</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="Parent name" value={parentName} onChange={e=>setParentName(e.target.value)}/><Input placeholder="Email" value={parentEmail} onChange={e=>setParentEmail(e.target.value)}/></div><Button className="mt-3" disabled={!parentName} onClick={()=>run(()=>parentFn({data:{tenantId,productKey,displayName:parentName,email:parentEmail||null,phoneE164:null,externalRef:null,householdRef:null,requirements:{}}}),"Parent CRM/profile created")}>Create parent</Button><div className="mt-4 space-y-2">{(q.data?.parents??[]).slice(0,8).map((p:any)=><div key={p.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><div><b>{p.person?.display_name||p.id}</b><p className="text-xs text-muted-foreground">{p.person?.email||"No email"}</p></div><StatusBadge status={p.status}/></div>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Provider onboarding</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input placeholder="Provider name" value={providerName} onChange={e=>setProviderName(e.target.value)}/><Input placeholder="Email" value={providerEmail} onChange={e=>setProviderEmail(e.target.value)}/><Input placeholder="Provider reference" value={providerRef} onChange={e=>setProviderRef(e.target.value)}/></div><Button className="mt-3" disabled={!providerName||!providerRef} onClick={()=>run(()=>providerFn({data:{tenantId,productKey,displayName:providerName,email:providerEmail||null,phoneE164:null,externalRef:null,providerRef,regulatorRef:null,serviceArea:{},capacity:null,ageRanges:[],services:[]}}),"Provider CRM/profile created")}>Create provider</Button><div className="mt-4 space-y-2">{providers.slice(0,8).map((p:any)=><div key={p.id} className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><div><b>{p.person?.display_name||p.provider_ref}</b><p className="text-xs text-muted-foreground">{p.provider_ref}</p></div><StatusBadge status={p.status}/></div>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Availability & matching</h2><Button className="mt-3" disabled={!selectedProvider} onClick={()=>{const start=new Date(Date.now()+86400000),end=new Date(start.getTime()+8*3600000);return run(()=>availabilityFn({data:{tenantId,productKey,providerId:selectedProvider.id,startsAt:start.toISOString(),endsAt:end.toISOString(),availablePlaces:1,recurrence:{}}}),"Availability added")}}>Add tomorrow availability</Button><Button className="ml-2 mt-3" variant="outline" disabled={!selectedProvider||!selectedChild} onClick={()=>run(()=>matchFn({data:{tenantId,productKey,childId:selectedChild.id,providerId:selectedProvider.id,score:null,reasons:[{source:"operator"}]}}),"Match suggested")}>Suggest selected match</Button><div className="mt-4 flex flex-wrap gap-2">{(q.data?.matches??[]).slice(0,12).map((m:any)=><Badge key={m.id} variant="outline">{m.status}{m.score!=null?(" · "+m.score):""}</Badge>)}</div><p className="mt-3 text-xs text-muted-foreground">Matching scores are evidence/reason records, not automatic suitability decisions; offers/acceptance stay reviewable.</p></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Compliance evidence</h2><Button className="mt-3" disabled={!selectedProvider} onClick={()=>run(()=>complianceFn({data:{tenantId,productKey,providerId:selectedProvider.id,requirementKey:"identity-check",title:"Identity verification",status:"requested",evidenceDocumentId:null,issuedAt:null,expiresAt:null,metadata:{}}}),"Compliance requirement requested")}>Request identity evidence</Button><div className="mt-4 space-y-2">{(q.data?.compliance??[]).slice(0,12).map((c:any)=><div key={c.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{c.title}</b><p className="text-xs text-muted-foreground">{c.requirement_key}</p></div><StatusBadge status={c.status}/></div>)}</div></CardContent></Card>
  </div>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof Users;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
