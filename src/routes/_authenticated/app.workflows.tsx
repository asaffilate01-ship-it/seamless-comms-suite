import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAutomationWorkflow,
  listAutomationWorkflows,
  publishAutomationWorkflow,
  setAutomationWorkflowStatus,
} from "@/modules/automation/functions";
import { GitBranch, Plus, Play, Pause, Archive } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/workflows")({
  head:()=>({meta:[{title:"Automation Workflows — Omniqora"},{name:"robots",content:"noindex"}]}),
  component:Workflows,
});

function Workflows(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("automation.core");
  const listFn=useServerFn(listAutomationWorkflows);
  const createFn=useServerFn(createAutomationWorkflow);
  const publishFn=useServerFn(publishAutomationWorkflow);
  const statusFn=useServerFn(setAutomationWorkflowStatus);

  const query=useQuery({
    queryKey:["automation-workflows-live",selected?.id],
    enabled,
    queryFn:()=>listFn({data:scope!}),
    retry:false,
  });
  const rows=(query.data??[]) as any[];
  const[name,setName]=useState("");
  const[description,setDescription]=useState("");
  const[trigger,setTrigger]=useState("crm.person.created");
  const[actionKey,setActionKey]=useState("connect.whatsapp.send");
  const[busy,setBusy]=useState("");

  async function refresh(){await queryClient.invalidateQueries({queryKey:["automation-workflows-live",selected?.id]});}

  async function create(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy("create");
      const triggerId="trigger";const actionId="action";const outcomeId="outcome";
      await createFn({data:{
        ...scope,name:name.trim(),description:description.trim()||null,triggerEvent:trigger,
        nodes:[
          {id:triggerId,kind:"trigger",name:"Trigger",moduleKey:null,actionKey:null,config:{event:trigger}},
          {id:actionId,kind:"action",name:"Action",moduleKey:null,actionKey,config:{}},
          {id:outcomeId,kind:"outcome",name:"Complete",moduleKey:null,actionKey:null,config:{}},
        ],
        edges:[{from:triggerId,to:actionId,condition:null},{from:actionId,to:outcomeId,condition:null}],
      }});
      setName("");setDescription("");
      await refresh();
      toast.success("Draft workflow created");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function publish(row:any){
    if(!scope)return;
    try{
      setBusy(row.id);
      const version=row.activeVersion?.version??row.versions?.[0]?.version;
      if(!version)throw new Error("Workflow has no version to publish");
      await publishFn({data:{...scope,workflowId:row.id,version}});
      await refresh();
      toast.success("Workflow published");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function changeStatus(row:any,status:"active"|"paused"|"archived"){
    if(!scope)return;
    try{
      setBusy(row.id);
      await statusFn({data:{...scope,workflowId:row.id,status}});
      await refresh();
      toast.success("Workflow status updated");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  return <AppShell
    title="Automation Workflows"
    subtitle="Durable trigger → condition → action → delay → approval workflows with real run state."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading product workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a tenant product before using automation."/>:!enabled?
      <State text="Enable automation.core for this tenant product in Tenant Manager."/>:query.isPending?
      <State text="Loading workflows…"/>:query.error?<State text={errorText(query.error)} destructive/>:
      <div className="grid gap-6 xl:grid-cols-[.7fr_1.3fr]">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary"/><h2 className="font-semibold">New starter workflow</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Creates a real draft graph: trigger → action → outcome. More nodes can be added through the automation builder layer as it expands.</p>
          <form onSubmit={create} className="mt-4 space-y-3">
            <Field label="Name"><Input required value={name} onChange={(e)=>setName(e.target.value)}/></Field>
            <Field label="Description"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={description} onChange={(e)=>setDescription(e.target.value)}/></Field>
            <Field label="Trigger event"><Input required value={trigger} onChange={(e)=>setTrigger(e.target.value)} placeholder="order.completed"/></Field>
            <Field label="Action key"><Input required value={actionKey} onChange={(e)=>setActionKey(e.target.value)} placeholder="connect.whatsapp.send"/></Field>
            <Button type="submit" disabled={busy==="create"}><GitBranch className="mr-2 h-4 w-4"/>Create draft workflow</Button>
          </form>
        </CardContent></Card>

        <div className="grid gap-4">
          {rows.map((row:any)=><Card key={row.id}><CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex items-center gap-2"><h3 className="font-semibold">{row.name}</h3><Badge variant="outline">{row.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.description||row.trigger_event}</p></div>
              <div className="flex gap-2">
                {row.status==="draft"&&<Button size="sm" onClick={()=>publish(row)} disabled={busy===row.id}><Play className="mr-1.5 h-3.5 w-3.5"/>Publish</Button>}
                {row.status==="active"&&<Button size="sm" variant="outline" onClick={()=>changeStatus(row,"paused")} disabled={busy===row.id}><Pause className="mr-1.5 h-3.5 w-3.5"/>Pause</Button>}
                {row.status==="paused"&&<Button size="sm" variant="outline" onClick={()=>changeStatus(row,"active")} disabled={busy===row.id}><Play className="mr-1.5 h-3.5 w-3.5"/>Resume</Button>}
                {row.status!=="archived"&&<Button size="sm" variant="ghost" onClick={()=>changeStatus(row,"archived")} disabled={busy===row.id}><Archive className="h-3.5 w-3.5"/></Button>}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Mini label="Version" value={row.active_version??row.activeVersion?.version??row.versions?.[0]?.version??"—"}/>
              <Mini label="Runs" value={row.runCounts?.total??0}/>
              <Mini label="Active" value={row.runCounts?.active??0}/>
              <Mini label="Failed" value={row.runCounts?.failed??0}/>
            </div>

            {row.activeVersion&&<div className="mt-4 overflow-x-auto"><div className="flex min-w-max items-center gap-2">{(row.activeVersion.nodes??[]).map((node:any,index:number)=><div key={node.id} className="flex items-center gap-2"><div className="rounded-lg border bg-surface-2 px-3 py-2 text-sm"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{node.kind}</div><div className="font-medium">{node.name}</div></div>{index<(row.activeVersion.nodes??[]).length-1&&<span className="text-muted-foreground">→</span>}</div>)}</div></div>}
          </CardContent></Card>)}
          {!rows.length&&<Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No automation workflows yet.</CardContent></Card>}
        </div>
      </div>}
  </AppShell>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function Mini({label,value}:{label:string;value:number|string}){return <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-display text-xl font-semibold">{value}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
