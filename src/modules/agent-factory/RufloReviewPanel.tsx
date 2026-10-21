import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {ShieldCheck} from "lucide-react";
import {toast} from "sonner";
import {listRufloPilotReviews,reviewRufloPilot} from "./ruflo.functions";

export function RufloReviewPanel(){
 const list=useServerFn(listRufloPilotReviews);
 const decide=useServerFn(reviewRufloPilot);
 const requests=useQuery({queryKey:["ruflo-pilot-platform-review"],queryFn:()=>list({data:{}}),retry:false});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState("");
 async function review(id:string,decision:"shortlisted"|"rejected"|"revoked"){
  const reviewNote=(notes[id]??"").trim();
  if(reviewNote.length<16){toast.error("Enter independent evidence notes of at least 16 characters");return;}
  setBusy(id);
  try{
   await decide({data:{requestId:id,decision,reviewNote}});
   toast.success("Pilot review saved. Ruflo remains disconnected.");
   await requests.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }
 return <Card><CardContent className="space-y-4 p-5">
  <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/> Ruflo isolated sandbox approvals</h2>
  <p className="text-sm text-muted-foreground">
   Independent platform review only. A shortlist never installs Ruflo, activates a tenant binding or authorises customer AI execution.
  </p>
  {requests.isLoading&&<p className="text-sm text-muted-foreground">Checking Ruflo review permissions…</p>}
  {requests.error&&<p role="alert" className="text-sm text-destructive">
   Platform reviewer access or the Ruflo pilot migration is required.
  </p>}
  {requests.data?.length===0&&<p className="text-sm text-muted-foreground">No Ruflo sandbox requests pending.</p>}
  {requests.data?.map(item=><div key={item.id} className="space-y-2 rounded-md border p-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <b className="text-sm">{item.product_key} · {item.data_region}</b><Badge variant="outline">{item.status}</Badge>
   </div>
   <p className="text-xs text-muted-foreground">Tenant: {item.tenant_id} · Requested: {item.created_at}</p>
   <p className="text-sm">{item.reason}</p>
   <label className="text-xs font-medium">Independent provenance, licence and sandbox evidence
    <Textarea className="mt-1" value={notes[item.id]??""} onChange={e=>setNotes(s=>({...s,[item.id]:e.target.value}))}
     placeholder="Exact upstream commit and digest, sandbox/network controls, independent security review, region and permitted read-only tools"/>
   </label>
   <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={busy===item.id} onClick={()=>review(item.id,"shortlisted")}>Shortlist for sandbox setup</Button>
    <Button size="sm" variant="outline" disabled={busy===item.id} onClick={()=>review(item.id,"rejected")}>Reject</Button>
    {item.status==="shortlisted"&&<Button size="sm" variant="destructive" disabled={busy===item.id} onClick={()=>review(item.id,"revoked")}>Revoke</Button>}
   </div>
  </div>)}
 </CardContent></Card>;
}
