import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCrmTimeline,
  listCrmCompanies,
  listCrmLeads,
  listCrmOpportunities,
  listCrmPeople,
  listCrmPipelines,
  listCrmTasks,
  saveCrmLead,
  saveCrmPerson,
  saveCrmTask,
} from "@/modules/crm/functions";
import { BriefcaseBusiness, Building2, ClipboardCheck, ContactRound, Target, UserRoundPlus } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/crm")({
  head:()=>({meta:[
    {title:"CRM & Customer 360 — Omniqora"},
    {name:"description",content:"Shared CRM, customer 360, leads, opportunities, tasks and timeline."},
    {name:"robots",content:"noindex"},
  ]}),
  component:CrmWorkspace,
});

function CrmWorkspace(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("crm.core");

  const peopleFn=useServerFn(listCrmPeople);
  const companiesFn=useServerFn(listCrmCompanies);
  const leadsFn=useServerFn(listCrmLeads);
  const opportunitiesFn=useServerFn(listCrmOpportunities);
  const pipelinesFn=useServerFn(listCrmPipelines);
  const tasksFn=useServerFn(listCrmTasks);
  const timelineFn=useServerFn(getCrmTimeline);
  const savePersonFn=useServerFn(saveCrmPerson);
  const saveLeadFn=useServerFn(saveCrmLead);
  const saveTaskFn=useServerFn(saveCrmTask);

  const people=useQuery({queryKey:["crm-people",selected?.tenant_id],enabled,queryFn:()=>peopleFn({data:scope!}),retry:false});
  const companies=useQuery({queryKey:["crm-companies",selected?.tenant_id],enabled,queryFn:()=>companiesFn({data:scope!}),retry:false});
  const leads=useQuery({queryKey:["crm-leads",selected?.tenant_id],enabled,queryFn:()=>leadsFn({data:scope!}),retry:false});
  const opportunities=useQuery({queryKey:["crm-opportunities",selected?.tenant_id],enabled,queryFn:()=>opportunitiesFn({data:scope!}),retry:false});
  const pipelines=useQuery({queryKey:["crm-pipelines",selected?.tenant_id],enabled,queryFn:()=>pipelinesFn({data:scope!}),retry:false});
  const tasks=useQuery({queryKey:["crm-tasks",selected?.tenant_id],enabled,queryFn:()=>tasksFn({data:scope!}),retry:false});

  const personRows=(people.data??[]) as any[];
  const companyRows=(companies.data??[]) as any[];
  const leadRows=(leads.data??[]) as any[];
  const opportunityRows=(opportunities.data??[]) as any[];
  const taskRows=(tasks.data??[]) as any[];
  const[selectedPersonId,setSelectedPersonId]=useState("");

  useEffect(()=>{
    if(personRows.length&&!personRows.some((row)=>row.id===selectedPersonId))setSelectedPersonId(personRows[0].id);
    if(!personRows.length&&selectedPersonId)setSelectedPersonId("");
  },[personRows,selectedPersonId]);

  const timeline=useQuery({
    queryKey:["crm-timeline",selected?.tenant_id,selectedPersonId],
    enabled:enabled&&!!selectedPersonId,
    queryFn:()=>timelineFn({data:{...scope!,personId:selectedPersonId,limit:100}}),
    retry:false,
  });

  const[contactName,setContactName]=useState("");
  const[contactEmail,setContactEmail]=useState("");
  const[contactPhone,setContactPhone]=useState("");
  const[contactStage,setContactStage]=useState<"subscriber"|"lead"|"contact"|"prospect"|"customer"|"former_customer"|"partner"|"supplier">("contact");
  const[contactConsent,setContactConsent]=useState(false);
  const[leadTitle,setLeadTitle]=useState("");
  const[leadPerson,setLeadPerson]=useState("");
  const[taskTitle,setTaskTitle]=useState("");
  const[taskPriority,setTaskPriority]=useState<"low"|"normal"|"high"|"urgent">("normal");
  const[busy,setBusy]=useState("");

  async function refresh(key:string){
    await queryClient.invalidateQueries({queryKey:[key,selected?.tenant_id]});
  }

  async function createContact(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy("contact");
      await savePersonFn({data:{
        ...scope,displayName:contactName,email:contactEmail||null,phoneE164:contactPhone||null,
        lifecycleStage:contactStage,marketingConsent:contactConsent,sourceProductKey:selected!.product_key,
        companyId:null,whatsappContactId:null,firstName:null,lastName:null,locale:null,externalRef:null,metadata:{}
      }});
      setContactName("");setContactEmail("");setContactPhone("");
      await refresh("crm-people");
      toast.success("CRM contact created");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function createLead(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy("lead");
      await saveLeadFn({data:{
        ...scope,title:leadTitle,personId:leadPerson||null,companyId:null,source:"crm_workspace",
        status:"new",score:null,sourceProductKey:selected!.product_key,externalRef:null,metadata:{}
      }});
      setLeadTitle("");setLeadPerson("");
      await refresh("crm-leads");
      toast.success("Lead created");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function createTask(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy("task");
      await saveTaskFn({data:{
        ...scope,title:taskTitle,description:null,status:"open",priority:taskPriority,dueAt:null,
        assigneeUserId:null,relatedType:selectedPersonId?"person":null,relatedId:selectedPersonId||null,
        sourceProductKey:selected!.product_key,externalRef:null,metadata:{}
      }});
      setTaskTitle("");
      await refresh("crm-tasks");
      toast.success("Task created");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  const selectedPerson=personRows.find((row)=>row.id===selectedPersonId)??null;
  const openPipelineValue=opportunityRows.filter((row)=>row.status==="open").reduce((sum,row)=>sum+Number(row.amount??0),0);
  const currency=opportunityRows.find((row)=>row.currency)?.currency??"GBP";

  return <AppShell
    title="Omniqora CRM & Customer 360"
    subtitle="One tenant-wide customer record shared across SaaS products, with leads, pipeline, tasks and interaction history."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading CRM workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a tenant product before using CRM."/>:!enabled?
      <State text="Enable crm.core for this tenant product from Tenant Manager."/>:
      <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={ContactRound} label="People" value={personRows.length}/>
          <Metric icon={Building2} label="Companies" value={companyRows.length}/>
          <Metric icon={Target} label="Open leads" value={leadRows.filter((row)=>!["converted","closed","unqualified"].includes(row.status)).length}/>
          <Metric icon={BriefcaseBusiness} label="Opportunities" value={opportunityRows.filter((row)=>row.status==="open").length}/>
          <Metric icon={BriefcaseBusiness} label="Open pipeline" value={formatMoney(openPipelineValue,currency)}/>
          <Metric icon={ClipboardCheck} label="Open tasks" value={taskRows.filter((row)=>!["completed","cancelled"].includes(row.status)).length}/>
        </div>

        <Tabs defaultValue="customer360" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="customer360">Customer 360</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="customer360">
            <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
              <Card><CardContent className="p-0">
                <Header title="Customer" subtitle="Choose a person to view their shared timeline."/>
                <div className="max-h-[620px] divide-y overflow-auto">{personRows.map((person)=><button key={person.id} onClick={()=>setSelectedPersonId(person.id)} className={"w-full p-4 text-left hover:bg-surface-2 "+(selectedPersonId===person.id?"bg-primary/5":"")}><div className="font-medium">{person.display_name}</div><div className="mt-1 text-xs text-muted-foreground">{person.email||person.phone_e164||person.lifecycle_stage}</div></button>)}{!personRows.length&&<p className="p-5 text-sm text-muted-foreground">No CRM people yet.</p>}</div>
              </CardContent></Card>
              <div className="space-y-4">
                {selectedPerson&&<Card><CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{selectedPerson.display_name}</h2><p className="mt-1 text-sm text-muted-foreground">{[selectedPerson.email,selectedPerson.phone_e164,selectedPerson.locale].filter(Boolean).join(" · ")}</p></div><Badge variant="outline">{selectedPerson.lifecycle_stage}</Badge></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Marketing consent" value={selectedPerson.marketing_consent?"Yes":"No"}/><Mini label="Source product" value={selectedPerson.source_product_key||"Shared"}/><Mini label="Updated" value={new Date(selectedPerson.updated_at).toLocaleDateString()}/></div>
                </CardContent></Card>}
                <Card><CardContent className="p-0"><Header title="Interaction timeline" subtitle="WhatsApp, email, SMS, calls, meetings, tasks and CRM lifecycle events share one history."/><div className="divide-y">{((timeline.data??[]) as any[]).map((item)=><div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><div className="font-medium">{item.summary}</div><Badge variant="outline">{item.activity_type}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{new Date(item.occurred_at).toLocaleString()}</div></div>)}{!((timeline.data??[]) as any[]).length&&<p className="p-5 text-sm text-muted-foreground">No timeline activity yet.</p>}</div></CardContent></Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="people">
            <div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
              <Card><CardContent className="p-5">
                <div className="flex items-center gap-2"><UserRoundPlus className="h-4 w-4 text-primary"/><h3 className="font-semibold">New contact</h3></div>
                <form onSubmit={createContact} className="mt-4 space-y-3">
                  <Field label="Display name"><Input required value={contactName} onChange={(e)=>setContactName(e.target.value)}/></Field>
                  <Field label="Email"><Input type="email" value={contactEmail} onChange={(e)=>setContactEmail(e.target.value)}/></Field>
                  <Field label="Phone E.164"><Input value={contactPhone} onChange={(e)=>setContactPhone(e.target.value)} placeholder="+447..."/></Field>
                  <Field label="Lifecycle stage"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={contactStage} onChange={(e)=>setContactStage(e.target.value as any)}>{["subscriber","lead","contact","prospect","customer","former_customer","partner","supplier"].map((value)=><option key={value}>{value}</option>)}</select></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contactConsent} onChange={(e)=>setContactConsent(e.target.checked)}/>Marketing consent recorded</label>
                  <Button type="submit" disabled={busy==="contact"}>Create contact</Button>
                </form>
              </CardContent></Card>
              <EntityTable columns={["Name","Contact","Stage","Source"]} rows={personRows.map((row)=>[row.display_name,row.email||row.phone_e164||"—",row.lifecycle_stage,row.source_product_key||"shared"])}/>
            </div>
          </TabsContent>

          <TabsContent value="companies">
            <EntityTable columns={["Company","Industry","Status","Website"]} rows={companyRows.map((row)=>[row.name,row.industry||"—",row.status,row.website||"—"])}/>
          </TabsContent>

          <TabsContent value="leads">
            <div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
              <Card><CardContent className="p-5">
                <h3 className="font-semibold">New lead</h3>
                <form onSubmit={createLead} className="mt-4 space-y-3">
                  <Field label="Title"><Input required value={leadTitle} onChange={(e)=>setLeadTitle(e.target.value)}/></Field>
                  <Field label="Person"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={leadPerson} onChange={(e)=>setLeadPerson(e.target.value)}><option value="">No linked person</option>{personRows.map((person)=><option key={person.id} value={person.id}>{person.display_name}</option>)}</select></Field>
                  <Button type="submit" disabled={busy==="lead"}>Create lead</Button>
                </form>
              </CardContent></Card>
              <EntityTable columns={["Lead","Status","Score","Source"]} rows={leadRows.map((row)=>[row.title,row.status,row.score??"—",row.source||"—"])}/>
            </div>
          </TabsContent>

          <TabsContent value="pipeline">
            <div className="space-y-5">
              {((pipelines.data??[]) as any[]).map((pipeline)=><Card key={pipeline.id}><CardContent className="p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">{pipeline.name}</h3><p className="text-xs text-muted-foreground">{(pipeline.stages??[]).length+" stage(s)"}</p></div><Badge variant="outline">active</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(pipeline.stages??[]).map((stage:any)=><div key={stage.id} className="rounded-lg border p-3"><div className="font-medium">{stage.name}</div><div className="mt-1 text-xs text-muted-foreground">{opportunityRows.filter((opp)=>opp.stage_id===stage.id&&opp.status==="open").length+" open opportunity(s)"}</div></div>)}</div></CardContent></Card>)}
              <EntityTable columns={["Opportunity","Status","Amount","Probability"]} rows={opportunityRows.map((row)=>[row.title,row.status,row.amount==null?"—":formatMoney(row.amount,row.currency||currency),row.probability_percent==null?"—":String(row.probability_percent)+"%"])}/>
            </div>
          </TabsContent>

          <TabsContent value="tasks">
            <div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
              <Card><CardContent className="p-5">
                <h3 className="font-semibold">New task</h3>
                <form onSubmit={createTask} className="mt-4 space-y-3">
                  <Field label="Title"><Input required value={taskTitle} onChange={(e)=>setTaskTitle(e.target.value)}/></Field>
                  <Field label="Priority"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={taskPriority} onChange={(e)=>setTaskPriority(e.target.value as any)}>{["low","normal","high","urgent"].map((value)=><option key={value}>{value}</option>)}</select></Field>
                  <div className="text-xs text-muted-foreground">{selectedPerson?"Will link to "+selectedPerson.display_name:"No customer selected in Customer 360"}</div>
                  <Button type="submit" disabled={busy==="task"}>Create task</Button>
                </form>
              </CardContent></Card>
              <EntityTable columns={["Task","Status","Priority","Due"]} rows={taskRows.map((row)=>[row.title,row.status,row.priority,row.due_at?new Date(row.due_at).toLocaleString():"—"])}/>
            </div>
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof ContactRound;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 truncate font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate font-medium">{value}</div></div>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function EntityTable({columns,rows}:{columns:string[];rows:Array<Array<React.ReactNode>>}){return <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{columns.map((column)=><th key={column} className="px-5 py-3">{column}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i} className="px-5 py-3">{cell}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={columns.length} className="px-5 py-8 text-center text-muted-foreground">No records yet.</td></tr>}</tbody></table></div></CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
function formatMoney(value:number|string,currency:string){const amount=Number(value??0);try{return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"GBP"}).format(amount);}catch{return (currency||"")+" "+amount.toFixed(2);}}
