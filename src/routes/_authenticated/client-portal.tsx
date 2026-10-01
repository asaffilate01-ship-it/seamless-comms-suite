import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell,StatusBadge } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { accessPracticePortal,listMyPracticePortals } from "@/modules/practice/functions";
import { toast } from "sonner";

export const Route=createFileRoute("/_authenticated/client-portal")({component:ClientPortal,head:()=>({meta:[{title:"Client Portal — Omniqora"},{name:"robots",content:"noindex"}]})});
function ClientPortal(){
 const listFn=useServerFn(listMyPracticePortals),accessFn=useServerFn(accessPracticePortal),qc=useQueryClient();
 const memberships=useQuery({queryKey:["practice-portals"],queryFn:()=>listFn(),retry:false});
 const[selected,setSelected]=useState("");const rows=(memberships.data??[]) as any[];const clientId=selected||rows[0]?.practice_client_id||"";
 const portal=useQuery({queryKey:["practice-portal",clientId],enabled:!!clientId,queryFn:()=>accessFn({data:{clientId,action:"read"}}),retry:false});
 const[dataResponse,setDataResponse]=useState<Record<string,string>>({});
 async function action(input:any){try{await accessFn({data:{clientId,...input}});toast.success("Portal updated");await qc.invalidateQueries({queryKey:["practice-portal",clientId]});}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 const data=portal.data as any;
 return <AppShell title="Client Portal" subtitle="Only your authorised client workspaces and external-facing deadlines are shown.">
  <div className="space-y-6"><Card><CardContent className="p-5"><select className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm" value={clientId} onChange={e=>setSelected(e.target.value)}>{rows.map(r=><option key={r.practice_client_id} value={r.practice_client_id}>{r.product_key} · {r.portal_role}</option>)}</select></CardContent></Card>
  {portal.error?<Card><CardContent className="p-6 text-destructive">{portal.error instanceof Error?portal.error.message:"Portal unavailable"}</CardContent></Card>:<>
   <Card><CardContent className="p-5"><h2 className="font-display text-xl font-semibold">{data?.client?.displayName??"Client"}</h2><p className="mt-1 text-sm text-muted-foreground">{data?.client?.billingEmail??""}</p></CardContent></Card>
   <div className="grid gap-6 xl:grid-cols-2"><Card><CardContent className="p-0"><Head title="Information requests"/><div className="divide-y">{(data?.requests??[]).map((r:any)=><div key={r.id} className="p-4"><div className="flex justify-between"><b>{r.title}</b><StatusBadge status={r.status}/></div>{r.status!=="accepted"&&<><Textarea className="mt-3" value={dataResponse[r.id]??r.response??""} onChange={e=>setDataResponse(v=>({...v,[r.id]:e.target.value}))}/><Button className="mt-2" size="sm" disabled={!(dataResponse[r.id]??r.response)} onClick={()=>action({action:"respond",entityId:r.id,response:dataResponse[r.id]??r.response})}>Submit response</Button></>}</div>)}{!data?.requests?.length&&<p className="p-5 text-sm text-muted-foreground">No requests.</p>}</div></CardContent></Card>
   <Card><CardContent className="p-0"><Head title="Proposals"/><div className="divide-y">{(data?.proposals??[]).map((p:any)=><div key={p.id} className="p-4"><div className="flex justify-between"><b>{new Intl.NumberFormat(undefined,{style:"currency",currency:p.currency}).format(p.totalMinor/100)}</b><StatusBadge status={p.status}/></div><p className="mt-2 text-sm">{p.terms}</p>{p.status==="issued"&&data?.role==="client_owner"&&<div className="mt-3 flex gap-2"><Button size="sm" onClick={()=>action({action:"accept",entityId:p.id})}>Accept</Button><Button size="sm" variant="outline" onClick={()=>action({action:"decline",entityId:p.id})}>Decline</Button></div>}</div>)}{!data?.proposals?.length&&<p className="p-5 text-sm text-muted-foreground">No issued proposals.</p>}</div></CardContent></Card></div>
  </>}</div>
 </AppShell>;
}
function Head({title}:{title:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3></div>;}
