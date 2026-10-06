import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listJourneys, saveJourney } from "@/modules/growth/functions";
import { ArrowDown, Bot, GitBranch, Plus, Save, Sparkles, Trash2 } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/journey-builder")({
  head:()=>({meta:[
    {title:"Journey Builder — Omniqora"},
    {name:"description",content:"Visual trigger, condition, AI, action, delay, branch and outcome journey builder."},
    {name:"robots",content:"noindex"},
  ]}),
  component:JourneyBuilder,
});

type NodeKind="trigger"|"condition"|"ai_decision"|"action"|"delay"|"branch"|"outcome";
type JourneyNode={id:string;kind:NodeKind;label:string;config:Record<string,unknown>};
type JourneyEdge={id:string;from:string;to:string;condition?:string|null};

const kinds:NodeKind[]=["trigger","condition","ai_decision","action","delay","branch","outcome"];

function id(prefix:string){
  return prefix+"_"+(globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2));
}

function JourneyBuilder(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("journeys.core");
  const listFn=useServerFn(listJourneys);
  const saveFn=useServerFn(saveJourney);

  const journeys=useQuery({
    queryKey:["journey-builder-list",selected?.id],
    enabled,
    queryFn:()=>listFn({data:scope!}),
    retry:false,
  });

  const[currentId,setCurrentId]=useState<string|null>(null);
  const[name,setName]=useState("New customer journey");
  const[status,setStatus]=useState<"draft"|"active"|"paused"|"archived">("draft");
  const[nodes,setNodes]=useState<JourneyNode[]>([]);
  const[edges,setEdges]=useState<JourneyEdge[]>([]);
  const[busy,setBusy]=useState(false);

  const current=useMemo(()=>((journeys.data??[]) as any[]).find((row)=>row.id===currentId)??null,[journeys.data,currentId]);

  useEffect(()=>{
    if(!current)return;
    setName(current.name);
    setStatus(current.status);
    setNodes((Array.isArray(current.nodes)?current.nodes:[]) as JourneyNode[]);
    setEdges((Array.isArray(current.edges)?current.edges:[]) as JourneyEdge[]);
  },[current]);

  function newJourney(){
    setCurrentId(null);setName("New customer journey");setStatus("draft");setNodes([]);setEdges([]);
  }

  function starter(){
    const trigger=id("trigger"),delay=id("delay"),action=id("action"),outcome=id("outcome");
    setNodes([
      {id:trigger,kind:"trigger",label:"Customer event",config:{event:"customer.registered"}},
      {id:delay,kind:"delay",label:"Wait 24 hours",config:{delayMinutes:1440}},
      {id:action,kind:"action",label:"Send WhatsApp",config:{actionKey:"connect.whatsapp.send"}},
      {id:outcome,kind:"outcome",label:"Journey complete",config:{}},
    ]);
    setEdges([
      {id:id("edge"),from:trigger,to:delay},
      {id:id("edge"),from:delay,to:action},
      {id:id("edge"),from:action,to:outcome},
    ]);
  }

  function addNode(kind:NodeKind){
    setNodes((old)=>[...old,{id:id(kind),kind,label:defaultLabel(kind),config:defaultConfig(kind)}]);
  }

  function updateNode(nodeId:string,patch:Partial<JourneyNode>){
    setNodes((old)=>old.map((node)=>node.id===nodeId?{...node,...patch}:node));
  }

  function updateConfig(nodeId:string,key:string,value:unknown){
    setNodes((old)=>old.map((node)=>node.id===nodeId?{...node,config:{...node.config,[key]:value}}:node));
  }

  function removeNode(nodeId:string){
    setNodes((old)=>old.filter((node)=>node.id!==nodeId));
    setEdges((old)=>old.filter((edge)=>edge.from!==nodeId&&edge.to!==nodeId));
  }

  function addEdge(){
    if(nodes.length<2)return;
    setEdges((old)=>[...old,{id:id("edge"),from:nodes[0]!.id,to:nodes[1]!.id,condition:null}]);
  }

  function updateEdge(edgeId:string,patch:Partial<JourneyEdge>){
    setEdges((old)=>old.map((edge)=>edge.id===edgeId?{...edge,...patch}:edge));
  }

  async function save(){
    if(!scope)return;
    if(!name.trim()){toast.error("Journey name is required");return;}
    if(!nodes.length){toast.error("Add at least one journey node");return;}
    const nodeIds=new Set(nodes.map((node)=>node.id));
    if(edges.some((edge)=>!nodeIds.has(edge.from)||!nodeIds.has(edge.to))){
      toast.error("Every edge must connect valid nodes");return;
    }
    try{
      setBusy(true);
      const row=await saveFn({data:{...scope,id:currentId??undefined,name:name.trim(),nodes,edges,status}});
      setCurrentId((row as any).id);
      await queryClient.invalidateQueries({queryKey:["journey-builder-list",selected?.id]});
      await queryClient.invalidateQueries({queryKey:["growth-journeys",selected?.id]});
      toast.success("Journey saved");
    }catch(error){toast.error(error instanceof Error?error.message:"Journey could not be saved");}
    finally{setBusy(false);}
  }

  return <AppShell
    title="Visual Customer Journey Builder"
    subtitle="Trigger → conditions → AI decisions → actions → delays → branches → outcomes."
    actions={<div className="flex items-center gap-2"><ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/><Link to="/app/growth"><Button size="sm" variant="outline">Growth</Button></Link></div>}
  >
    {workspace.loading?<State text="Loading journey workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a tenant product before creating journeys."/>:!enabled?
      <State text="Enable journeys.core for this tenant product from Platform Control."/>:
      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit"><CardContent className="p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Journeys</h2><Button size="sm" variant="outline" onClick={newJourney}>New</Button></div>
          <div className="mt-4 space-y-2">
            {((journeys.data??[]) as any[]).map((row)=><button key={row.id} onClick={()=>setCurrentId(row.id)} className={`w-full rounded-lg border p-3 text-left text-sm transition ${currentId===row.id?"border-primary bg-primary/5":"hover:bg-surface-2"}`}><div className="font-medium">{row.name}</div><div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span>{(row.nodes??[]).length} nodes</span><span>{row.status}</span></div></button>)}
            {!((journeys.data??[]) as any[]).length&&<p className="text-sm text-muted-foreground">No journeys yet.</p>}
          </div>
        </CardContent></Card>

        <div className="space-y-5">
          <Card><CardContent className="p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
              <Field label="Journey name"><Input value={name} onChange={(e)=>setName(e.target.value)}/></Field>
              <Field label="Status"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={(e)=>setStatus(e.target.value as any)}>{["draft","active","paused","archived"].map((item)=><option key={item}>{item}</option>)}</select></Field>
              <Button onClick={save} disabled={busy}><Save className="mr-2 h-4 w-4"/>Save journey</Button>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold">Flow nodes</h2><p className="text-xs text-muted-foreground">Build the graph from reusable node types. Runtime state is stored separately per customer enrolment.</p></div>
              <div className="flex flex-wrap gap-2">
                {!nodes.length&&<Button size="sm" variant="outline" onClick={starter}><Sparkles className="mr-1.5 h-4 w-4"/>Starter flow</Button>}
                {kinds.map((kind)=><Button key={kind} size="sm" variant="outline" onClick={()=>addNode(kind)}><Plus className="mr-1 h-3.5 w-3.5"/>{kind.replaceAll("_"," ")}</Button>)}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {nodes.map((node,index)=><div key={node.id}>
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-md bg-primary/10 p-2 text-primary">{node.kind==="ai_decision"?<Bot className="h-4 w-4"/>:<GitBranch className="h-4 w-4"/>}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{node.kind.replaceAll("_"," ")}</Badge><code className="text-[10px] text-muted-foreground">{node.id}</code></div>
                      <Input className="mt-3" value={node.label} onChange={(e)=>updateNode(node.id,{label:e.target.value})}/>
                      <NodeConfig node={node} onChange={(key,value)=>updateConfig(node.id,key,value)}/>
                    </div>
                    <Button size="icon" variant="ghost" onClick={()=>removeNode(node.id)} aria-label="Remove node"><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
                {index<nodes.length-1&&<div className="flex justify-center py-1 text-muted-foreground"><ArrowDown className="h-4 w-4"/></div>}
              </div>)}
              {!nodes.length&&<div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Add nodes or start with the example customer-registers → delay → WhatsApp → outcome flow.</div>}
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold">Edges & branches</h2><p className="text-xs text-muted-foreground">Connect any node to any other node. An optional outcome/condition label selects the branch at runtime.</p></div><Button size="sm" variant="outline" onClick={addEdge} disabled={nodes.length<2}><Plus className="mr-1.5 h-4 w-4"/>Edge</Button></div>
            <div className="mt-4 space-y-3">{edges.map((edge)=><div key={edge.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={edge.from} onChange={(e)=>updateEdge(edge.id,{from:e.target.value})}>{nodes.map((n)=><option key={n.id} value={n.id}>From: {n.label}</option>)}</select>
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={edge.to} onChange={(e)=>updateEdge(edge.id,{to:e.target.value})}>{nodes.map((n)=><option key={n.id} value={n.id}>To: {n.label}</option>)}</select>
              <Input value={edge.condition??""} onChange={(e)=>updateEdge(edge.id,{condition:e.target.value||null})} placeholder="Outcome / condition (optional)"/>
              <Button size="icon" variant="ghost" onClick={()=>setEdges((old)=>old.filter((item)=>item.id!==edge.id))}><Trash2 className="h-4 w-4"/></Button>
            </div>)}{!edges.length&&<p className="text-sm text-muted-foreground">No edges yet. Add one to connect nodes.</p>}</div>
          </CardContent></Card>
        </div>
      </div>}
  </AppShell>;
}

function NodeConfig({node,onChange}:{node:JourneyNode;onChange:(key:string,value:unknown)=>void}){
  if(node.kind==="delay")return <div className="mt-3"><Field label="Delay minutes"><Input type="number" min={0} value={String(node.config.delayMinutes??0)} onChange={(e)=>onChange("delayMinutes",Number(e.target.value))}/></Field></div>;
  if(node.kind==="trigger")return <div className="mt-3"><Field label="Trigger event"><Input value={String(node.config.event??"")} onChange={(e)=>onChange("event",e.target.value)} placeholder="order.completed"/></Field></div>;
  if(node.kind==="action")return <div className="mt-3"><Field label="Action key"><Input value={String(node.config.actionKey??"")} onChange={(e)=>onChange("actionKey",e.target.value)} placeholder="connect.whatsapp.send"/></Field></div>;
  if(node.kind==="condition")return <div className="mt-3"><Field label="Condition expression"><Input value={String(node.config.expression??"")} onChange={(e)=>onChange("expression",e.target.value)} placeholder="customer.totalOrders > 2"/></Field></div>;
  if(node.kind==="ai_decision")return <div className="mt-3"><Field label="AI decision instruction"><Input value={String(node.config.instruction??"")} onChange={(e)=>onChange("instruction",e.target.value)} placeholder="Choose the next best offer"/></Field></div>;
  if(node.kind==="branch")return <div className="mt-3 text-xs text-muted-foreground">Create multiple outgoing edges below and give each one an outcome/condition label.</div>;
  return null;
}
function defaultLabel(kind:NodeKind){return({trigger:"Trigger",condition:"Condition",ai_decision:"AI decision",action:"Action",delay:"Delay",branch:"Branch",outcome:"Outcome"} as Record<NodeKind,string>)[kind];}
function defaultConfig(kind:NodeKind){if(kind==="delay")return{delayMinutes:60};if(kind==="trigger")return{event:""};if(kind==="action")return{actionKey:""};if(kind==="condition")return{expression:""};if(kind==="ai_decision")return{instruction:""};return{};}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={`p-6 text-sm ${destructive?"text-destructive":"text-muted-foreground"}`}>{text}</CardContent></Card>;}
