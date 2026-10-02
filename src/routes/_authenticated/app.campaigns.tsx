import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell,StatusBadge } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { createCampaign,createSegment,getGrowthWorkspace,recomputeRfm } from "@/modules/growth/functions";
import { Plus,RefreshCw } from "lucide-react";
import { toast } from "sonner";
export const Route=createFileRoute("/_authenticated/app/campaigns")({component:Campaigns});
function Campaigns(){
 const t=useTenant();const tenantId=t.tenantId??"";const getFn=useServerFn(getGrowthWorkspace),segFn=useServerFn(createSegment),campaignFn=useServerFn(createCampaign),rfmFn=useServerFn(recomputeRfm);
 const q=useQuery({queryKey:["growth",tenantId],queryFn:()=>getFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const[name,setName]=useState(""),[segmentName,setSegmentName]=useState(""),[channel,setChannel]=useState<"whatsapp"|"sms"|"email"|"push"|"multi">("whatsapp"),[segmentId,setSegmentId]=useState("");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Campaigns" subtitle="Real tenant-scoped multichannel campaigns powered by CRM segments and RFM." actions={<Button variant="outline" size="sm" onClick={()=>run(()=>rfmFn({data:{tenantId}}),"RFM refreshed")}><RefreshCw className="mr-2 h-4 w-4"/>Refresh RFM</Button>}>
  <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
   <div className="space-y-6">
    <Card><CardContent className="p-5"><h2 className="font-semibold">New segment</h2><Input className="mt-3" value={segmentName} onChange={e=>setSegmentName(e.target.value)} placeholder="VIP customers"/><Button className="mt-3" disabled={!segmentName} onClick={()=>run(async()=>{await segFn({data:{tenantId,name:segmentName,segmentKey:segmentName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),productKey:null,rules:{}}});setSegmentName("");},"Segment created")}><Plus className="mr-2 h-4 w-4"/>Create segment</Button></CardContent></Card>
    <Card><CardContent className="p-5"><h2 className="font-semibold">New campaign</h2><Input className="mt-3" value={name} onChange={e=>setName(e.target.value)} placeholder="Weekend offer"/><select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={channel} onChange={e=>setChannel(e.target.value as any)}>{["whatsapp","sms","email","push","multi"].map(x=><option key={x}>{x}</option>)}</select><select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={segmentId} onChange={e=>setSegmentId(e.target.value)}><option value="">All eligible</option>{(q.data?.segments??[]).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Button className="mt-3" disabled={!name} onClick={()=>run(async()=>{await campaignFn({data:{tenantId,name,productKey:null,channel,segmentId:segmentId||null,content:{}}});setName("");},"Campaign created")}>Create draft</Button></CardContent></Card>
   </div>
   <Card><CardContent className="p-0"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Campaign</th><th>Channel</th><th>Status</th><th className="text-right">Sent</th><th className="text-right pr-4">Delivered</th></tr></thead><tbody className="divide-y">{(q.data?.campaigns??[]).map((c:any)=><tr key={c.id}><td className="px-4 py-3 font-medium">{c.name}</td><td><Badge variant="outline">{c.channel}</Badge></td><td><StatusBadge status={c.status}/></td><td className="text-right">{c.sent_count}</td><td className="pr-4 text-right">{c.delivered_count}</td></tr>)}{!(q.data?.campaigns??[]).length&&<tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No campaigns yet.</td></tr>}</tbody></table></CardContent></Card>
  </div>
 </AppShell>
}