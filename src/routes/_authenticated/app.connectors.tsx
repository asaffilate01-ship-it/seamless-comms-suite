import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { ProductWorkspacePicker, useProductWorkspace } from "@/hooks/useProductWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConnectorHubWorkspace } from "@/modules/platform/connector-hub.functions";
import { upsertTenantIntegrationBinding } from "@/modules/platform/integration.functions";
import { BUILTIN_PLUGIN_DEFINITIONS, pluginDefinition } from "@/modules/platform/plugins";
import { Activity, Cable, CheckCircle2, CircleOff, Database, KeyRound, RefreshCw, Webhook } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/connectors")({
  head:()=>({meta:[
    {title:"Connector Hub — Omniqora"},
    {name:"description",content:"Tenant-safe connector requirements, bindings, sync state, webhooks and reconciliation."},
    {name:"robots",content:"noindex"},
  ]}),
  component:ConnectorHub,
});

function moduleForKind(kind:string){
  if(kind==="communications")return"connect.core";
  if(kind==="payments")return"payments.core";
  if(kind==="maps")return"geo.core";
  if(kind==="ai")return"intelligence.core";
  if(kind==="creative")return"creative.core";
  if(kind==="delivery")return"dispatch.core";
  return"connectors.core";
}

function ConnectorHub(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("connectors.core");
  const load=useServerFn(getConnectorHubWorkspace);
  const saveBinding=useServerFn(upsertTenantIntegrationBinding);

  const query=useQuery({
    queryKey:["connector-hub",selected?.id],
    enabled,
    queryFn:()=>load({data:scope!}),
    retry:false,
  });
  const data=query.data as any;
  const requirements=(data?.requirements??[]) as any[];
  const catalogue=(data?.catalogue??[]) as any[];
  const bindings=(data?.bindings??[]) as any[];
  const runs=(data?.runs??[]) as any[];
  const webhooks=(data?.webhooks??[]) as any[];
  const syncState=(data?.syncState??[]) as any[];
  const reconciliations=(data?.reconciliations??[]) as any[];

  const[connectorKey,setConnectorKey]=useState("");
  const[environment,setEnvironment]=useState<"development"|"staging"|"production">("production");
  const[externalRef,setExternalRef]=useState("");
  const[secretRefs,setSecretRefs]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);

  useEffect(()=>{
    const first=requirements[0]?.connector_key??catalogue[0]?.connector_key??"";
    if(first&&!requirements.concat(catalogue).some((row:any)=>row.connector_key===connectorKey))setConnectorKey(first);
  },[requirements,catalogue,connectorKey]);

  const definition=pluginDefinition(connectorKey);
  useEffect(()=>{
    setSecretRefs(Object.fromEntries((definition?.secretNames??[]).map((name)=>[name,""])));
  },[connectorKey]);

  const catalogueByKey=useMemo(()=>new Map(catalogue.map((item:any)=>[item.connector_key,item])),[catalogue]);
  const requiredMissing=requirements.filter((req:any)=>req.required&&!bindings.some((binding:any)=>binding.pluginKey===req.connector_key&&binding.status==="active")).length;
  const activeBindings=bindings.filter((row:any)=>row.status==="active").length;
  const failedRuns=runs.filter((row:any)=>row.status==="failed").length;
  const unresolved=reconciliations.filter((row:any)=>row.status!=="matched"&&row.status!=="resolved").length;

  async function configure(event:FormEvent){
    event.preventDefault();
    if(!selected||!connectorKey||!definition)return;
    try{
      setBusy(true);
      const refs=Object.fromEntries(Object.entries(secretRefs).filter(([,value])=>value.trim()).map(([key,value])=>[key,value.trim()]));
      const result=await saveBinding({data:{
        tenantProductId:selected.id,
        moduleKey:moduleForKind(definition.kind),
        pluginKey:connectorKey,
        integrationKind:definition.kind,
        environment,
        locationId:null,
        externalAccountRef:externalRef||null,
        secretRefs:refs,
        config:{source:"connector_hub"}
      }});
      await queryClient.invalidateQueries({queryKey:["connector-hub",selected.id]});
      toast.success(result.missingCredentials.length
        ?"Connector saved; "+result.missingCredentials.length+" credential reference(s) still required"
        :"Connector binding saved");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy(false);}
  }

  return <AppShell
    title="Omniqora Connector Hub"
    subtitle="One provider-neutral integration layer for every SaaS: bindings, credentials, webhooks, sync, retries, health and reconciliation."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading product workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a tenant product before configuring connectors."/>:!enabled?
      <State text="Connector Hub is not enabled for this tenant product. Enable connectors.core in Tenant Manager."/>:query.isPending?
      <State text="Loading connector workspace…"/>:query.error?<State text={errorText(query.error)} destructive/>:
      <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric icon={Cable} label="Requirements" value={requirements.length}/>
          <Metric icon={CircleOff} label="Required missing" value={requiredMissing}/>
          <Metric icon={CheckCircle2} label="Active bindings" value={activeBindings}/>
          <Metric icon={Activity} label="Failed runs" value={failedRuns}/>
          <Metric icon={Database} label="Reconcile issues" value={unresolved}/>
        </div>

        <Tabs defaultValue="requirements" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="bindings">Bindings</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="sync">Sync & reconciliation</TabsTrigger>
          </TabsList>

          <TabsContent value="requirements">
            <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
              <div className="grid gap-4 md:grid-cols-2">
                {requirements.map((req:any)=>{
                  const cat=catalogueByKey.get(req.connector_key);
                  const binding=bindings.find((item:any)=>item.pluginKey===req.connector_key);
                  return <Card key={req.connector_key}><CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="font-semibold">{cat?.name??req.connector_key}</h3><p className="text-xs text-muted-foreground">{req.connector_key}</p></div>
                      <Badge variant={req.required?"default":"outline"}>{req.required?"required":"optional"}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{req.purpose}</p>
                    <div className="mt-4 flex flex-wrap gap-2"><Badge variant="secondary">{cat?.connector_kind??definition?.kind??"connector"}</Badge><Badge variant="outline">{binding?.status??"not configured"}</Badge><Badge variant="outline">{cat?.status??"catalogue"}</Badge></div>
                    <Button className="mt-4" size="sm" variant="outline" onClick={()=>setConnectorKey(req.connector_key)}>Configure</Button>
                  </CardContent></Card>;
                })}
                {!requirements.length&&<Card className="md:col-span-2"><CardContent className="p-6 text-sm text-muted-foreground">This product has no declared connector requirements yet. You can still configure a catalogue connector below.</CardContent></Card>}
              </div>

              <Card className="h-fit"><CardContent className="p-5">
                <h3 className="font-semibold">Configure binding</h3>
                <p className="mt-1 text-xs text-muted-foreground">Store logical secret references such as <code>env:THUNES_API_KEY</code>; secret values stay server-side.</p>
                <form onSubmit={configure} className="mt-4 space-y-3">
                  <Field label="Connector">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={connectorKey} onChange={(e)=>setConnectorKey(e.target.value)}>
                      {[...new Set([...requirements.map((r:any)=>r.connector_key),...catalogue.map((r:any)=>r.connector_key),...BUILTIN_PLUGIN_DEFINITIONS.map((p)=>p.key)])].sort().map((key)=><option key={key} value={key}>{pluginDefinition(key)?.name??key}</option>)}
                    </select>
                  </Field>
                  <Field label="Environment"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={environment} onChange={(e)=>setEnvironment(e.target.value as any)}><option>development</option><option>staging</option><option>production</option></select></Field>
                  <Field label="External account reference"><Input value={externalRef} onChange={(e)=>setExternalRef(e.target.value)} placeholder="optional"/></Field>
                  {(definition?.secretNames??[]).map((name)=><Field key={name} label={name}><Input value={secretRefs[name]??""} onChange={(e)=>setSecretRefs((old)=>({...old,[name]:e.target.value}))} placeholder={"env:"+name.toUpperCase()}/></Field>)}
                  {!definition&&connectorKey&&<div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">This connector exists in the database catalogue but does not yet have a runtime plugin definition. It cannot be bound until its adapter contract is added.</div>}
                  <Button type="submit" disabled={busy||!definition}><KeyRound className="mr-2 h-4 w-4"/>Save connector binding</Button>
                </form>
              </CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="bindings">
            <Table headers={["Connector","Module","Environment","Credentials","Verified","Status"]} rows={bindings.map((row:any)=>[
              row.pluginKey??row.provider,row.moduleKey,row.environment,
              row.credentialNamesConfigured.length?row.credentialNamesConfigured.join(", "):"none",
              row.lastVerifiedAt?new Date(row.lastVerifiedAt).toLocaleString():"never",
              <Badge key={row.id} variant="outline">{row.status}</Badge>
            ])}/>
          </TabsContent>

          <TabsContent value="runs">
            <Table headers={["Connector","Operation","Direction","Started","Completed","Status"]} rows={runs.map((row:any)=>[
              row.connector_key,row.operation_key,row.direction,
              row.started_at?new Date(row.started_at).toLocaleString():new Date(row.created_at).toLocaleString(),
              row.completed_at?new Date(row.completed_at).toLocaleString():"—",
              <Badge key={row.id} variant="outline">{row.status}</Badge>
            ])}/>
          </TabsContent>

          <TabsContent value="webhooks">
            <Table headers={["Connector","Event","Signature","Received","Processed","Status"]} rows={webhooks.map((row:any)=>[
              row.connector_key,row.event_type,row.signature_verified?"verified":"not verified",
              new Date(row.received_at).toLocaleString(),
              row.processed_at?new Date(row.processed_at).toLocaleString():"—",
              <Badge key={row.id} variant="outline">{row.status}</Badge>
            ])}/>
          </TabsContent>

          <TabsContent value="sync">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-0"><Header title="Sync state" subtitle="Cursors and watermarks for incremental provider synchronisation."/><div className="divide-y">{syncState.map((row:any)=><div key={row.connector_key+":"+row.stream_key} className="p-4"><div className="flex items-center justify-between"><div><div className="font-medium">{row.connector_key}</div><div className="text-xs text-muted-foreground">{row.stream_key}</div></div><Badge variant="outline">rev {row.revision}</Badge></div><div className="mt-2 text-xs text-muted-foreground">Last success: {row.last_success_at?new Date(row.last_success_at).toLocaleString():"never"}{row.last_error?" · Error: "+row.last_error:""}</div></div>)}{!syncState.length&&<p className="p-5 text-sm text-muted-foreground">No connector streams have synchronised yet.</p>}</div></CardContent></Card>
              <Card><CardContent className="p-0"><Header title="Reconciliation" subtitle="Differences between local Omniqora state and external provider state."/><div className="divide-y">{reconciliations.map((row:any)=><div key={row.id} className="p-4"><div className="flex items-center justify-between"><div><div className="font-medium">{row.connector_key} · {row.resource_type}</div><div className="text-xs text-muted-foreground">{row.local_ref||"—"} ↔ {row.external_ref||"—"}</div></div><Badge variant="outline">{row.status}</Badge></div></div>)}{!reconciliations.length&&<p className="p-5 text-sm text-muted-foreground">No reconciliation records yet.</p>}</div></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Cable;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function Table({headers,rows}:{headers:string[];rows:React.ReactNode[][]}){return <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{headers.map((h)=><th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i} className="px-5 py-3">{cell}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={headers.length} className="px-5 py-8 text-center text-muted-foreground">No records yet.</td></tr>}</tbody></table></div></CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
