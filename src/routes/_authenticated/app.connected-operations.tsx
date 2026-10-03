import {createFileRoute} from "@tanstack/react-router";
import {useMemo,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {
  createConnectedDisplayAssignment,decideConnectedPricingRecommendation,getConnectedOperations,
} from "@/modules/connected-ops/functions";
import {BadgePoundSterling,MonitorSmartphone,RefreshCw,ScreenShare,ShieldCheck,Wifi,WifiOff} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/connected-operations")({
  component:ConnectedOperations,
  head:()=>({meta:[{title:"Connected Operations — Omniqora"},{name:"robots",content:"noindex"}]}),
});

function ConnectedOperations(){
  const tenant=useTenant();const tenantId=tenant.tenantId??"";const qc=useQueryClient();
  const getFn=useServerFn(getConnectedOperations),decideFn=useServerFn(decideConnectedPricingRecommendation),assignFn=useServerFn(createConnectedDisplayAssignment);
  const q=useQuery({queryKey:["connected-operations",tenantId],queryFn:()=>getFn({data:{tenantId}}),enabled:!!tenantId&&!tenant.loading,retry:false});
  const targets=(q.data?.targets??[]) as any[],pricing=(q.data?.pricing??[]) as any[],links=(q.data?.displayLinks??[]) as any[];
  const[busy,setBusy]=useState("");
  const[assignment,setAssignment]=useState({productKey:"dishbee",profile:"",location:"",campaign:"",content:"",type:"campaign",starts:"",ends:""});

  async function run(key:string,fn:()=>Promise<unknown>,success:string){
    try{setBusy(key);await fn();await qc.invalidateQueries({queryKey:["connected-operations",tenantId]});toast.success(success)}
    catch(e){toast.error(e instanceof Error?e.message:String(e))}
    finally{setBusy("")}
  }
  const degraded=targets.filter(t=>["degraded","offline"].includes(t.status)).length;
  const pending=pricing.filter(p=>p.status==="pending").length;
  const displays=targets.filter(t=>["display","customer_display","collection_display","kiosk"].includes(t.target_type)).length;
  const mobile=targets.filter(t=>t.target_type==="payment_device").length;
  const healthy=targets.filter(t=>["online","healthy"].includes(t.status)).length;
  const money=(minor:number,currency="GBP")=>new Intl.NumberFormat("en-GB",{style:"currency",currency}).format(Number(minor??0)/100);

  if(tenant.loading)return <AppShell title="Connected Operations"><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if(q.error)return <AppShell title="Connected Operations"><Card><CardContent className="p-6 text-sm text-destructive">{q.error instanceof Error?q.error.message:"Unable to load connected operations"}</CardContent></Card></AppShell>;

  return <AppShell title="Connected Operations" subtitle="Cross-product health, pricing approvals and digital-display orchestration. Vertical operational data stays in the connected product."
    actions={<Button variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Metric icon={MonitorSmartphone} label="Connected targets" value={targets.length}/>
      <Metric icon={Wifi} label="Healthy" value={healthy}/>
      <Metric icon={WifiOff} label="Degraded / offline" value={degraded}/>
      <Metric icon={ScreenShare} label="Screens / kiosks" value={displays}/>
      <Metric icon={BadgePoundSterling} label="Pricing approvals" value={pending}/>
    </div>

    <Tabs defaultValue="fleet" className="mt-6">
      <TabsList className="mb-5 flex h-auto flex-wrap justify-start">
        <TabsTrigger value="fleet">Fleet health</TabsTrigger>
        <TabsTrigger value="pricing">Pricing approvals</TabsTrigger>
        <TabsTrigger value="signage">Signage orchestration</TabsTrigger>
      </TabsList>

      <TabsContent value="fleet">
        <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Target</th><th>Product</th><th>Type</th><th>Status</th><th>Capabilities</th><th className="pr-4">Last seen</th></tr></thead>
          <tbody className="divide-y">{targets.map(t=><tr key={t.id}><td className="px-4 py-3"><b>{t.name??t.external_ref}</b><p className="font-mono text-[11px] text-muted-foreground">{t.external_ref}</p>{t.external_location_ref&&<p className="text-xs text-muted-foreground">{t.external_location_ref}</p>}</td><td>{t.product_key}</td><td>{String(t.target_type).replaceAll("_"," ")}</td><td><StatusBadge status={t.status}/></td><td><div className="flex max-w-sm flex-wrap gap-1">{(t.capabilities??[]).slice(0,6).map((x:string)=><Badge key={x} variant="outline">{x.replaceAll("_"," ")}</Badge>)}</div></td><td className="pr-4 text-xs text-muted-foreground">{t.last_seen_at?new Date(t.last_seen_at).toLocaleString():"—"}</td></tr>)}
          {!targets.length&&<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No connected operational targets have reported yet.</td></tr>}</tbody>
        </table></div></CardContent></Card>
      </TabsContent>

      <TabsContent value="pricing">
        <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Item / channel</th><th>Current</th><th>Recommended</th><th>Cost</th><th>Target</th><th>Reason</th><th>Status</th><th className="pr-4">Action</th></tr></thead>
          <tbody className="divide-y">{pricing.map(p=><tr key={p.id}><td className="px-4 py-3"><b className="font-mono text-xs">{p.external_item_ref}</b><p className="text-xs text-muted-foreground">{p.channel_key}{p.fulfilment?" · "+p.fulfilment:""} · {p.product_key}</p></td><td>{money(p.current_minor,p.currency)}</td><td className="font-semibold">{money(p.recommended_minor,p.currency)}</td><td>{p.estimated_cost_minor==null?"—":money(p.estimated_cost_minor,p.currency)}</td><td>{p.target_margin_bps==null?"—":Number(p.target_margin_bps)/100+"%"}</td><td className="max-w-xs text-xs text-muted-foreground">{p.reason??"—"}</td><td><StatusBadge status={p.status}/></td><td className="pr-4">{p.status==="pending"?<div className="flex gap-2"><Button size="sm" disabled={!!busy} onClick={()=>run("approve:"+p.id,()=>decideFn({data:{tenantId,recommendationId:p.id,decision:"approved"}}),"Price recommendation approved")}>Approve</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={()=>run("reject:"+p.id,()=>decideFn({data:{tenantId,recommendationId:p.id,decision:"rejected"}}),"Price recommendation rejected")}>Reject</Button></div>:"—"}</td></tr>)}
          {!pricing.length&&<tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No pricing recommendations have arrived yet.</td></tr>}</tbody>
        </table></div></CardContent></Card>
      </TabsContent>

      <TabsContent value="signage">
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <Card><CardContent className="p-5"><div className="flex items-center gap-2"><ScreenShare className="h-5 w-5 text-primary"/><h2 className="font-semibold">Assign connected content</h2></div><p className="mt-1 text-xs text-muted-foreground">Create a reference assignment. The connected product keeps the actual screen playlist and media assets.</p>
            <div className="mt-4 space-y-3">
              <Field label="Product key" value={assignment.productKey} set={v=>setAssignment(x=>({...x,productKey:v}))}/>
              <Field label="External display profile ref" value={assignment.profile} set={v=>setAssignment(x=>({...x,profile:v}))}/>
              <Field label="External location ref" value={assignment.location} set={v=>setAssignment(x=>({...x,location:v}))}/>
              <Field label="Campaign ref" value={assignment.campaign} set={v=>setAssignment(x=>({...x,campaign:v}))}/>
              <Field label="Content ref" value={assignment.content} set={v=>setAssignment(x=>({...x,content:v}))}/>
              <label className="block text-xs font-medium">Assignment type<select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={assignment.type} onChange={e=>setAssignment(x=>({...x,type:e.target.value}))}><option value="campaign">Campaign</option><option value="promotion">Promotion</option><option value="emergency">Emergency</option><option value="daypart">Daypart</option><option value="sponsor">Sponsor</option></select></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium">Starts<input type="datetime-local" className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={assignment.starts} onChange={e=>setAssignment(x=>({...x,starts:e.target.value}))}/></label><label className="text-xs font-medium">Ends<input type="datetime-local" className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={assignment.ends} onChange={e=>setAssignment(x=>({...x,ends:e.target.value}))}/></label></div>
              <Button className="w-full" disabled={!assignment.profile||!!busy} onClick={()=>run("assignment",async()=>{await assignFn({data:{tenantId,productKey:assignment.productKey,externalProfileRef:assignment.profile,externalLocationRef:assignment.location||null,campaignRef:assignment.campaign||null,contentRef:assignment.content||null,assignmentType:assignment.type as any,startsAt:assignment.starts?new Date(assignment.starts).toISOString():null,endsAt:assignment.ends?new Date(assignment.ends).toISOString():null,targeting:{},metadata:{source:"connected-operations"}}});setAssignment(x=>({...x,campaign:"",content:"",starts:"",ends:""}))},"Display assignment sent")}>Send assignment</Button>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-0"><div className="divide-y">{links.map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><b>{l.external_profile_ref}</b><p className="text-xs text-muted-foreground">{l.assignment_type} · {l.product_key}{l.campaign_ref?" · campaign "+l.campaign_ref:""}{l.content_ref?" · content "+l.content_ref:""}</p></div><StatusBadge status={l.status}/></div>)}{!links.length&&<p className="p-6 text-center text-sm text-muted-foreground">No display assignments yet.</p>}</div></CardContent></Card>
        </div>
      </TabsContent>
    </Tabs>
  </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof ShieldCheck;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
function Field({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <label className="block text-xs font-medium">{label}<Input className="mt-1" value={value} onChange={e=>set(e.target.value)}/></label>}
