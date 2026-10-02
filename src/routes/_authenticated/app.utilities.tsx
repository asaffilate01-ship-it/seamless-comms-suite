import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell,StatusBadge } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { createAutomationWorkflow,createDocumentRecord,createFormDefinition,createSupportTicket,getPlatformUtilities,searchUtilities } from "@/modules/platform-utilities/functions";
import { FileText,Search,Settings2,Ticket } from "lucide-react";
import { toast } from "sonner";
export const Route=createFileRoute("/_authenticated/app/utilities")({component:Utilities,head:()=>({meta:[{title:"Platform Utilities — Omniqora"},{name:"robots",content:"noindex"}]})});
function Utilities(){
 const t=useTenant();const tenantId=t.tenantId??"";const getFn=useServerFn(getPlatformUtilities),workflowFn=useServerFn(createAutomationWorkflow),docFn=useServerFn(createDocumentRecord),formFn=useServerFn(createFormDefinition),ticketFn=useServerFn(createSupportTicket),searchFn=useServerFn(searchUtilities);
 const q=useQuery({queryKey:["utilities",tenantId],queryFn:()=>getFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const[workflowName,setWorkflowName]=useState(""),[trigger,setTrigger]=useState("marketplace.order.completed"),[ticketSubject,setTicketSubject]=useState(""),[ticketDescription,setTicketDescription]=useState(""),[search,setSearch]=useState(""),[results,setResults]=useState<any[]>([]);
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Platform Utilities" subtitle="Automation, documents, forms, support, notifications and tenant-safe search shared by every SaaS.">
  <div className="grid gap-4 md:grid-cols-6"><Metric label="Workflows" value={q.data?.workflows?.length??0}/><Metric label="Runs" value={q.data?.runs?.length??0}/><Metric label="Documents" value={q.data?.documents?.length??0}/><Metric label="Forms" value={q.data?.forms?.length??0}/><Metric label="Tickets" value={q.data?.tickets?.length??0}/><Metric label="Notifications" value={q.data?.notifications?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-3">
   <Card><CardContent className="p-5"><Settings2 className="h-4 w-4"/><h2 className="mt-2 font-semibold">Automation</h2><Input className="mt-3" value={workflowName} onChange={e=>setWorkflowName(e.target.value)} placeholder="Post-order follow-up"/><Input className="mt-2" value={trigger} onChange={e=>setTrigger(e.target.value)}/><Button className="mt-3" disabled={!workflowName} onClick={()=>run(async()=>{await workflowFn({data:{tenantId,productKey:null,name:workflowName,triggerEvent:trigger}});setWorkflowName("");},"Workflow created")}>Create workflow</Button></CardContent></Card>
   <Card><CardContent className="p-5"><FileText className="h-4 w-4"/><h2 className="mt-2 font-semibold">Document / form</h2><Button className="mt-3" variant="outline" onClick={()=>run(()=>docFn({data:{tenantId,productKey:null,title:"Example document",documentType:"evidence",subjectType:null,subjectId:null,storageRef:"pending://upload",mimeType:"application/pdf"}}),"Document record created")}>New document record</Button><Button className="mt-2" variant="outline" onClick={()=>run(()=>formFn({data:{tenantId,productKey:null,formKey:"example-"+Date.now(),name:"Example form",schema:{fields:[],sections:[]}}}),"Form created")}>New form</Button></CardContent></Card>
   <Card><CardContent className="p-5"><Ticket className="h-4 w-4"/><h2 className="mt-2 font-semibold">Support ticket</h2><Input className="mt-3" value={ticketSubject} onChange={e=>setTicketSubject(e.target.value)} placeholder="Issue"/><Textarea className="mt-2" value={ticketDescription} onChange={e=>setTicketDescription(e.target.value)} placeholder="Details"/><Button className="mt-3" disabled={!ticketSubject} onClick={()=>run(async()=>{await ticketFn({data:{tenantId,productKey:null,subject:ticketSubject,description:ticketDescription||null,priority:"normal"}});setTicketSubject("");setTicketDescription("");},"Ticket created")}>Create ticket</Button></CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><div className="flex gap-2"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tenant data"/><Button disabled={!search} onClick={async()=>{try{setResults(await searchFn({data:{tenantId,query:search}}));}catch(e){toast.error(e instanceof Error?e.message:String(e));}}><Search className="mr-2 h-4 w-4"/>Search</Button></div><div className="mt-4 space-y-2">{results.map((r:any)=><div key={r.entity_type+":"+r.entity_id} className="rounded-lg border p-3"><div className="flex justify-between"><b>{r.title}</b><Badge variant="outline">{r.entity_type}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{r.excerpt}</p></div>)}</div></CardContent></Card>
  <div className="mt-6 grid gap-4 lg:grid-cols-2"><Card><CardContent className="p-0"><h2 className="border-b p-5 font-semibold">Automation runs</h2><div className="divide-y">{(q.data?.runs??[]).map((r:any)=><div key={r.id} className="flex justify-between p-4 text-sm"><span>{r.workflow_id.slice(0,8)}…</span><StatusBadge status={r.status}/></div>)}</div></CardContent></Card><Card><CardContent className="p-0"><h2 className="border-b p-5 font-semibold">Support queue</h2><div className="divide-y">{(q.data?.tickets??[]).map((r:any)=><div key={r.id} className="flex justify-between p-4 text-sm"><span>{r.subject}</span><StatusBadge status={r.status}/></div>)}</div></CardContent></Card></div>
 </AppShell>
}
function Metric({label,value}:{label:string;value:number}){return <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>}
