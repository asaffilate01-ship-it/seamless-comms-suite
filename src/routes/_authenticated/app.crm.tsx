import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/hooks/useTenant";
import {
  getCustomer360,listCrmCompanies,listCrmLeads,listCrmOpportunities,listCrmPeople,listCrmPipelines,listCrmTasks,
  saveCrmCompany,saveCrmLead,saveCrmOpportunity,saveCrmPerson,saveCrmTask
} from "@/modules/crm/functions";
import { BriefcaseBusiness, Building2, ClipboardCheck, ContactRound, Target, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";

export const Route=createFileRoute("/_authenticated/app/crm")({
 component:CrmWorkspace,
 head:()=>({meta:[{title:"CRM & Customer 360 — Omniqora"},{name:"robots",content:"noindex"}]})
});

function CrmWorkspace(){
 const tenant=useTenant();const tenantId=tenant.tenantId??"";const qc=useQueryClient();
 const peopleFn=useServerFn(listCrmPeople),companiesFn=useServerFn(listCrmCompanies),leadsFn=useServerFn(listCrmLeads);
 const opportunitiesFn=useServerFn(listCrmOpportunities),pipelinesFn=useServerFn(listCrmPipelines),tasksFn=useServerFn(listCrmTasks);
 const customerFn=useServerFn(getCustomer360),personFn=useServerFn(saveCrmPerson),companyFn=useServerFn(saveCrmCompany);
 const leadFn=useServerFn(saveCrmLead),opportunityFn=useServerFn(saveCrmOpportunity),taskFn=useServerFn(saveCrmTask);
 const enabled=!!tenantId&&!tenant.loading;
 const people=useQuery({queryKey:["crm-people",tenantId],enabled,queryFn:()=>peopleFn({data:{tenantId}}),retry:false});
 const companies=useQuery({queryKey:["crm-companies",tenantId],enabled,queryFn:()=>companiesFn({data:{tenantId}}),retry:false});
 const leads=useQuery({queryKey:["crm-leads",tenantId],enabled,queryFn:()=>leadsFn({data:{tenantId}}),retry:false});
 const opportunities=useQuery({queryKey:["crm-opportunities",tenantId],enabled,queryFn:()=>opportunitiesFn({data:{tenantId}}),retry:false});
 const pipelines=useQuery({queryKey:["crm-pipelines",tenantId],enabled,queryFn:()=>pipelinesFn({data:{tenantId}}),retry:false});
 const tasks=useQuery({queryKey:["crm-tasks",tenantId],enabled,queryFn:()=>tasksFn({data:{tenantId}}),retry:false});
 const personRows=(people.data??[]) as any[],companyRows=(companies.data??[]) as any[],leadRows=(leads.data??[]) as any[];
 const opportunityRows=(opportunities.data??[]) as any[],taskRows=(tasks.data??[]) as any[],pipelineRows=(pipelines.data??[]) as any[];
 const[selectedPersonId,setSelectedPersonId]=useState("");
 useEffect(()=>{if(personRows.length&&!personRows.some(p=>p.id===selectedPersonId))setSelectedPersonId(personRows[0].id);if(!personRows.length)setSelectedPersonId("");},[personRows,selectedPersonId]);
 const customer=useQuery({queryKey:["crm-360",tenantId,selectedPersonId],enabled:enabled&&!!selectedPersonId,
  queryFn:()=>customerFn({data:{tenantId,personId:selectedPersonId}}),retry:false});
 const [busy,setBusy]=useState("");
 const [contact,setContact]=useState({name:"",email:"",phone:"",stage:"contact",consent:false});
 const [company,setCompany]=useState({name:"",industry:"",website:""});
 const [lead,setLead]=useState({title:"",personId:""});
 const [task,setTask]=useState({title:"",priority:"normal"});
 const defaultPipeline=pipelineRows.find(p=>p.is_default)??pipelineRows[0];
 const defaultStage=defaultPipeline?.stages?.find((s:any)=>!s.is_closed_won&&!s.is_closed_lost)??defaultPipeline?.stages?.[0];
 const [opportunity,setOpportunity]=useState({title:"",personId:"",amount:""});

 async function refresh(){
  await Promise.all(["crm-people","crm-companies","crm-leads","crm-opportunities","crm-pipelines","crm-tasks"].map(key=>qc.invalidateQueries({queryKey:[key,tenantId]})));
  if(selectedPersonId)await qc.invalidateQueries({queryKey:["crm-360",tenantId,selectedPersonId]});
 }
 async function run(key:string,fn:()=>Promise<unknown>){try{setBusy(key);await fn();await refresh();toast.success("CRM updated");}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy("");}}

 if(tenant.loading)return <AppShell title="CRM & Customer 360"><State text="Loading workspace…"/></AppShell>;
 const anyError=[people.error,companies.error,leads.error,opportunities.error,pipelines.error,tasks.error].find(Boolean);
 if(anyError)return <AppShell title="CRM & Customer 360"><State destructive text={anyError instanceof Error?anyError.message:"CRM unavailable"}/></AppShell>;

 const openPipeline=opportunityRows.filter(r=>r.status==="open").reduce((sum,r)=>sum+Number(r.amount??0),0);
 const currency=opportunityRows.find(r=>r.currency)?.currency??"GBP";
 return <AppShell title="CRM & Customer 360" subtitle="One tenant-wide customer graph shared by WhatsApp and connected SaaS products.">
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
   <Metric icon={ContactRound} label="People" value={personRows.length}/><Metric icon={Building2} label="Companies" value={companyRows.length}/>
   <Metric icon={Target} label="Open leads" value={leadRows.filter(r=>!["converted","closed","unqualified"].includes(r.status)).length}/>
   <Metric icon={BriefcaseBusiness} label="Opportunities" value={opportunityRows.filter(r=>r.status==="open").length}/>
   <Metric icon={BriefcaseBusiness} label="Open pipeline" value={money(openPipeline,currency)}/>
   <Metric icon={ClipboardCheck} label="Open tasks" value={taskRows.filter(r=>!["completed","cancelled"].includes(r.status)).length}/>
  </div>
  <Tabs defaultValue="customer360" className="mt-6">
   <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
    <TabsTrigger value="customer360">Customer 360</TabsTrigger><TabsTrigger value="people">People</TabsTrigger>
    <TabsTrigger value="companies">Companies</TabsTrigger><TabsTrigger value="leads">Leads</TabsTrigger>
    <TabsTrigger value="pipeline">Pipeline</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger>
   </TabsList>
   <TabsContent value="customer360">
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
     <Card><CardContent className="p-0"><Header title="Customer" subtitle="WhatsApp contacts are automatically linked into CRM."/>
      <div className="max-h-[650px] divide-y overflow-auto">{personRows.map(p=><button key={p.id} onClick={()=>setSelectedPersonId(p.id)} className={"w-full p-4 text-left hover:bg-surface-2 "+(p.id===selectedPersonId?"bg-primary/5":"")}><b>{p.display_name}</b><p className="mt-1 text-xs text-muted-foreground">{p.email||p.phone_e164||p.metadata?.wa_id||p.lifecycle_stage}</p></button>)}{!personRows.length&&<p className="p-5 text-sm text-muted-foreground">No customers yet.</p>}</div>
     </CardContent></Card>
     <div className="space-y-4">
      {customer.data&&<Card><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{customer.data.person.display_name}</h2><p className="mt-1 text-sm text-muted-foreground">{[customer.data.person.email,customer.data.person.phone_e164,customer.data.person.locale].filter(Boolean).join(" · ")}</p></div><Badge variant="outline">{customer.data.person.lifecycle_stage}</Badge></div>
       <div className="mt-5 grid gap-3 sm:grid-cols-4"><Mini label="Conversations" value={String(customer.data.conversations.length)}/><Mini label="Messages" value={String(customer.data.messages.length)}/><Mini label="Leads" value={String(customer.data.leads.length)}/><Mini label="Opportunities" value={String(customer.data.opportunities.length)}/></div>
      </CardContent></Card>}
      <Card><CardContent className="p-0"><Header title="CRM activity" subtitle="Calls, messages, tasks and lifecycle events become a shared history."/>
       <div className="divide-y">{((customer.data?.activities??[]) as any[]).map(a=><div key={a.id} className="p-4"><div className="flex justify-between gap-3"><b>{a.summary}</b><Badge variant="outline">{a.activity_type}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(a.occurred_at).toLocaleString()}</p></div>)}{!customer.data?.activities?.length&&<p className="p-5 text-sm text-muted-foreground">No CRM activity yet.</p>}</div>
      </CardContent></Card>
      {!!customer.data?.messages?.length&&<Card><CardContent className="p-0"><Header title="Connected WhatsApp history" subtitle="Existing communications remain authoritative and visible in Customer 360."/><div className="divide-y">{customer.data.messages.slice(0,30).map((m:any)=><div key={m.id} className="p-4 text-sm"><div className="flex justify-between"><Badge variant="outline">{m.direction}</Badge><span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span></div><p className="mt-2">{m.body||"["+m.msg_type+"]"}</p></div>)}</div></CardContent></Card>}
     </div>
    </div>
   </TabsContent>
   <TabsContent value="people"><div className="grid gap-4 xl:grid-cols-[360px_1fr]">
    <Card><CardContent className="p-5"><h3 className="font-semibold">New person</h3><form className="mt-4 space-y-3" onSubmit={(e)=>{e.preventDefault();run("person",async()=>{await personFn({data:{tenantId,displayName:contact.name,email:contact.email||null,phoneE164:contact.phone||null,lifecycleStage:contact.stage as any,marketingConsent:contact.consent,companyId:null,whatsappContactId:null,firstName:null,lastName:null,locale:null,sourceProductKey:"omniqora",externalRef:null,tags:[],channelPreferences:{},metadata:{}}});setContact({name:"",email:"",phone:"",stage:"contact",consent:false});});}}>
     <Field label="Name"><Input required value={contact.name} onChange={e=>setContact(v=>({...v,name:e.target.value}))}/></Field><Field label="Email"><Input type="email" value={contact.email} onChange={e=>setContact(v=>({...v,email:e.target.value}))}/></Field><Field label="Phone E.164"><Input value={contact.phone} placeholder="+447..." onChange={e=>setContact(v=>({...v,phone:e.target.value}))}/></Field>
     <Field label="Lifecycle"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={contact.stage} onChange={e=>setContact(v=>({...v,stage:e.target.value}))}>{["subscriber","lead","contact","prospect","customer","former_customer","partner","supplier"].map(x=><option key={x}>{x}</option>)}</select></Field>
     <label className="flex gap-2 text-sm"><input type="checkbox" checked={contact.consent} onChange={e=>setContact(v=>({...v,consent:e.target.checked}))}/>Marketing consent recorded</label>
     <Button type="submit" disabled={busy==="person"}><UserRoundPlus className="mr-2 h-4 w-4"/>Create</Button>
    </form></CardContent></Card>
    <Table columns={["Name","Contact","Lifecycle","Source"]} rows={personRows.map(p=>[p.display_name,p.email||p.phone_e164||p.metadata?.wa_id||"—",p.lifecycle_stage,p.source_product_key||"shared"])}/>
   </div></TabsContent>
   <TabsContent value="companies"><div className="grid gap-4 xl:grid-cols-[360px_1fr]">
    <Card><CardContent className="p-5"><h3 className="font-semibold">New company</h3><form className="mt-4 space-y-3" onSubmit={(e)=>{e.preventDefault();run("company",async()=>{await companyFn({data:{tenantId,name:company.name,industry:company.industry||null,website:company.website||null,legalName:null,status:"active",sourceProductKey:"omniqora",externalRef:null,metadata:{}}});setCompany({name:"",industry:"",website:""});});}}>
     <Field label="Name"><Input required value={company.name} onChange={e=>setCompany(v=>({...v,name:e.target.value}))}/></Field><Field label="Industry"><Input value={company.industry} onChange={e=>setCompany(v=>({...v,industry:e.target.value}))}/></Field><Field label="Website"><Input value={company.website} onChange={e=>setCompany(v=>({...v,website:e.target.value}))}/></Field><Button type="submit" disabled={busy==="company"}>Create company</Button>
    </form></CardContent></Card>
    <Table columns={["Company","Industry","Status","Website"]} rows={companyRows.map(r=>[r.name,r.industry||"—",r.status,r.website||"—"])}/>
   </div></TabsContent>
   <TabsContent value="leads"><div className="grid gap-4 xl:grid-cols-[360px_1fr]">
    <Card><CardContent className="p-5"><h3 className="font-semibold">New lead</h3><form className="mt-4 space-y-3" onSubmit={(e)=>{e.preventDefault();run("lead",async()=>{await leadFn({data:{tenantId,title:lead.title,personId:lead.personId||null,companyId:null,source:"crm_workspace",status:"new",score:null,sourceProductKey:"omniqora",externalRef:null,metadata:{}}});setLead({title:"",personId:""});});}}>
     <Field label="Title"><Input required value={lead.title} onChange={e=>setLead(v=>({...v,title:e.target.value}))}/></Field><Field label="Person"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={lead.personId} onChange={e=>setLead(v=>({...v,personId:e.target.value}))}><option value="">No person</option>{personRows.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field><Button type="submit" disabled={busy==="lead"}>Create lead</Button>
    </form></CardContent></Card>
    <Table columns={["Lead","Status","Score","Source"]} rows={leadRows.map(r=>[r.title,r.status,r.score??"—",r.source||"—"])}/>
   </div></TabsContent>
   <TabsContent value="pipeline"><div className="space-y-4">
    {defaultPipeline&&<Card><CardContent className="p-5"><h3 className="font-semibold">{defaultPipeline.name}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{(defaultPipeline.stages??[]).map((s:any)=><div key={s.id} className="rounded-lg border p-3"><b>{s.name}</b><p className="mt-1 text-xs text-muted-foreground">{opportunityRows.filter(o=>o.stage_id===s.id&&o.status==="open").length} open</p></div>)}</div></CardContent></Card>}
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]"><Card><CardContent className="p-5"><h3 className="font-semibold">New opportunity</h3><form className="mt-4 space-y-3" onSubmit={(e)=>{e.preventDefault();if(!defaultPipeline||!defaultStage)return;run("opportunity",async()=>{await opportunityFn({data:{tenantId,pipelineId:defaultPipeline.id,stageId:defaultStage.id,personId:opportunity.personId||null,companyId:null,title:opportunity.title,amount:opportunity.amount?Number(opportunity.amount):null,currency:"GBP",probabilityPercent:null,expectedCloseAt:null,status:"open",sourceProductKey:"omniqora",externalRef:null,metadata:{}}});setOpportunity({title:"",personId:"",amount:""});});}}>
     <Field label="Title"><Input required value={opportunity.title} onChange={e=>setOpportunity(v=>({...v,title:e.target.value}))}/></Field><Field label="Person"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={opportunity.personId} onChange={e=>setOpportunity(v=>({...v,personId:e.target.value}))}><option value="">No person</option>{personRows.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field><Field label="Value GBP"><Input type="number" min="0" step="0.01" value={opportunity.amount} onChange={e=>setOpportunity(v=>({...v,amount:e.target.value}))}/></Field><Button type="submit" disabled={busy==="opportunity"}>Create opportunity</Button>
    </form></CardContent></Card><Table columns={["Opportunity","Status","Amount","Probability"]} rows={opportunityRows.map(r=>[r.title,r.status,r.amount==null?"—":money(r.amount,r.currency||currency),r.probability_percent==null?"—":r.probability_percent+"%"])}/></div>
   </div></TabsContent>
   <TabsContent value="tasks"><div className="grid gap-4 xl:grid-cols-[360px_1fr]">
    <Card><CardContent className="p-5"><h3 className="font-semibold">New task</h3><form className="mt-4 space-y-3" onSubmit={(e)=>{e.preventDefault();run("task",async()=>{await taskFn({data:{tenantId,title:task.title,description:null,status:"open",priority:task.priority as any,dueAt:null,assigneeUserId:null,relatedType:selectedPersonId?"person":null,relatedId:selectedPersonId||null,sourceProductKey:"omniqora",externalRef:null,metadata:{}}});setTask({title:"",priority:"normal"});});}}>
     <Field label="Title"><Input required value={task.title} onChange={e=>setTask(v=>({...v,title:e.target.value}))}/></Field><Field label="Priority"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={task.priority} onChange={e=>setTask(v=>({...v,priority:e.target.value}))}>{["low","normal","high","urgent"].map(x=><option key={x}>{x}</option>)}</select></Field><Button type="submit" disabled={busy==="task"}>Create task</Button>
    </form></CardContent></Card><Table columns={["Task","Status","Priority","Due"]} rows={taskRows.map(r=>[r.title,r.status,r.priority,r.due_at?new Date(r.due_at).toLocaleString():"—"])}/></div>
   </TabsContent>
  </Tabs>
 </AppShell>;
}
function Metric({icon:Icon,label,value}:{icon:typeof ContactRound;label:string;value:string|number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 truncate font-display text-xl font-semibold">{value}</div></CardContent></Card>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted-foreground">{label}</p><b className="mt-1 block">{value}</b></div>;}
function Field({label,children}:{label:string;children:ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function Table({columns,rows}:{columns:string[];rows:ReactNode[][]}){return <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr>{columns.map(c=><th className="px-5 py-3" key={c}>{c}</th>)}</tr></thead><tbody className="divide-y">{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td className="px-5 py-3" key={j}>{c}</td>)}</tr>)}{!rows.length&&<tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={columns.length}>No records yet.</td></tr>}</tbody></table></div></CardContent></Card>;}
function money(value:number|string,currency:string){try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(Number(value));}catch{return currency+" "+Number(value).toFixed(2);}}
