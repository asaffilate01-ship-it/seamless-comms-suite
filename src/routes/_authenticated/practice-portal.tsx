import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {acceptPracticeProposalPortal,getMyPracticePortal,listMyPracticePortals,respondPracticeRequestPortal} from "@/modules/practice-delivery/functions";
import {uploadPracticeRequestDocument} from "@/modules/practice-delivery/files.functions";
import {FileUp,RefreshCw} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/practice-portal")({component:PracticePortal,head:()=>({meta:[{title:"Practice Client Portal — Omniqora"},{name:"robots",content:"noindex"}]})});

function toBase64(file:File){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=()=>reject(new Error("File could not be read"));r.readAsDataURL(file);});}

function PracticePortal(){
 const listFn=useServerFn(listMyPracticePortals),getFn=useServerFn(getMyPracticePortal),respondFn=useServerFn(respondPracticeRequestPortal),acceptFn=useServerFn(acceptPracticeProposalPortal),uploadFn=useServerFn(uploadPracticeRequestDocument);
 const portals=useQuery({queryKey:["my-practice-portals"],queryFn:()=>listFn(),retry:false});
 const[firstSelected,setSelected]=useState<string>("");
 const clientId=firstSelected||(portals.data?.[0]?.client_id??"");
 const q=useQuery({queryKey:["practice-portal",clientId],queryFn:()=>getFn({data:{clientId}}),enabled:!!clientId,retry:false});
 const[responses,setResponses]=useState<Record<string,string>>({});
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 async function upload(requestId:string,file:File|null){
  if(!file)return;try{
   if(file.size>5*1024*1024)throw new Error("File must be 5 MB or less");
   const allowed=["application/pdf","image/png","image/jpeg","text/csv"];if(!allowed.includes(file.type))throw new Error("Use PDF, PNG, JPEG or CSV");
   const base64=await toBase64(file);
   await uploadFn({data:{requestId,fileName:file.name,mimeType:file.type as any,base64,response:responses[requestId]??""}});
   toast.success("Document submitted");await q.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:String(e));}
 }
 return <div className="min-h-screen bg-surface-2 p-4 sm:p-8">
  <div className="mx-auto max-w-5xl">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl font-semibold">Practice Client Portal</h1><p className="mt-1 text-sm text-muted-foreground">Your jobs, document requests, proposals and signature status.</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link to="/app/practice">Staff workspace</Link></Button><Button variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div></div>
   {portals.data?.length?<select className="mt-6 h-10 w-full rounded-md border bg-background px-3 text-sm" value={clientId} onChange={e=>setSelected(e.target.value)}>{portals.data.map((p:any)=><option key={p.client_id} value={p.client_id}>{p.client_id} · {p.portal_role}</option>)}</select>:<Card className="mt-6"><CardContent className="p-5 text-sm text-muted-foreground">No Practice client portal access has been granted to this account.</CardContent></Card>}
   {q.data&&<>
    <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">{q.data.client?.display_name}</h2><div className="mt-4 grid gap-2 md:grid-cols-2">{(q.data.jobs??[]).map((x:any)=><div key={x.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{x.engagement_type}</b><Badge variant="outline">{x.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{x.period_start||"Ad hoc"} → {x.period_end||"—"}</p></div>)}</div></CardContent></Card>
    <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Requested documents / information</h2><div className="mt-4 space-y-3">{(q.data.requests??[]).map((r:any)=><div key={r.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><div><b>{r.title}</b><p className="mt-1 text-xs text-muted-foreground">{r.description||""}</p></div><Badge variant="outline">{r.status}</Badge></div>{["outstanding","rejected"].includes(r.status)&&<><Textarea className="mt-3" placeholder="Optional response note" value={responses[r.id]??""} onChange={e=>setResponses(v=>({...v,[r.id]:e.target.value}))}/><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>run(()=>respondFn({data:{requestId:r.id,response:responses[r.id]??"",documentId:null}}),"Response submitted")}>Submit note</Button><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-xs font-medium"><FileUp className="mr-2 h-4 w-4"/>Upload document<input className="hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.csv" onChange={e=>{const file=e.target.files?.[0]??null;void upload(r.id,file);e.currentTarget.value="";}}/></label></div></>}</div>)}</div></CardContent></Card>
    <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Proposals</h2><div className="mt-4 space-y-3">{(q.data.proposals??[]).map((p:any)=><div key={p.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{p.proposal_ref}</b><p className="text-xs text-muted-foreground">{p.total_minor} {p.currency}</p></div><Badge variant="outline">{p.status}</Badge></div><p className="mt-2 text-xs">{p.terms}</p>{p.status==="issued"&&q.data.access?.portal_role==="client_owner"&&<div className="mt-3 flex gap-2"><Button size="sm" onClick={()=>run(()=>acceptFn({data:{proposalId:p.id,accept:true}}),"Proposal accepted")}>Accept</Button><Button size="sm" variant="outline" onClick={()=>run(()=>acceptFn({data:{proposalId:p.id,accept:false}}),"Proposal declined")}>Decline</Button></div>}</div>)}</div><p className="mt-3 text-xs text-muted-foreground">Portal acceptance is not a provider e-signature. When e-sign is required, its provider status appears separately.</p></CardContent></Card>
    <Card className="mt-6 mb-12"><CardContent className="p-5"><h2 className="font-semibold">Signature status</h2><div className="mt-4 flex flex-wrap gap-2">{(q.data.signatures??[]).map((s:any)=><Badge key={s.id} variant="outline">{s.signer_name||s.id} · {s.status}</Badge>)}</div></CardContent></Card>
   </>}
  </div>
 </div>
}
