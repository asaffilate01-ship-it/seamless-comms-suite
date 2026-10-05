import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useMemo, useState } from "react";
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
import { getCommsHubWorkspace } from "@/modules/connect/comms-hub.functions";
import {
  saveTenantCommunicationIdentity,
  setTenantCommunicationIdentityActive,
} from "@/modules/branding/functions";
import {
  Bot, Cable, CheckCircle2, Headphones, Mail, MessageCircle,
  Phone, Radio, Smartphone, UsersRound,
} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/comms")({
  head:()=>({meta:[
    {title:"Comms Hub — Omniqora"},
    {name:"description",content:"Shared WhatsApp, SMS, email, voice, reception and conversation control plane."},
    {name:"robots",content:"noindex"},
  ]}),
  component:CommsHub,
});

const channels=["whatsapp","sms","email","voice"] as const;
const purposes=["transactional","marketing","support","bookings","billing","reception","general"] as const;

function CommsHub(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;
  const enabled=!!scope&&selected!.moduleKeys.includes("connect.core");
  const loadFn=useServerFn(getCommsHubWorkspace);
  const saveIdentityFn=useServerFn(saveTenantCommunicationIdentity);
  const activateFn=useServerFn(setTenantCommunicationIdentityActive);

  const query=useQuery({
    queryKey:["comms-hub",selected?.id],
    enabled,
    queryFn:()=>loadFn({data:scope!}),
    retry:false,
  });
  const data=query.data as any;
  const identities=(data?.communicationIdentities??[]) as any[];
  const bindings=(data?.providerBindings??[]) as any[];
  const whatsapp=(data?.whatsappChannels??[]) as any[];
  const conversations=(data?.conversations??[]) as any[];
  const events=(data?.communicationEvents??[]) as any[];
  const receptionRequests=(data?.receptionRequests??[]) as any[];
  const receptionSettings=(data?.receptionSettings??[]) as any[];
  const domains=(data?.domains??[]) as any[];
  const locations=(data?.locations??[]) as any[];
  const activeCapabilities=new Set<string>(data?.activeCapabilities??[]);

  const[channel,setChannel]=useState<typeof channels[number]>("whatsapp");
  const[purpose,setPurpose]=useState<typeof purposes[number]>("transactional");
  const[identityValue,setIdentityValue]=useState("");
  const[displayName,setDisplayName]=useState("");
  const[replyTo,setReplyTo]=useState("");
  const[bindingId,setBindingId]=useState("");
  const[domainId,setDomainId]=useState("");
  const[locationId,setLocationId]=useState("");
  const[busy,setBusy]=useState("");

  const compatibleBindings=useMemo(()=>bindings.filter((row:any)=>{
    if(row.integrationKind!=="communications")return false;
    const caps=row.capabilities??[];
    if(channel==="whatsapp")return caps.includes("whatsapp")||caps.includes("whatsapp.inbound")||caps.includes("whatsapp.outbound");
    if(channel==="sms")return caps.includes("sms");
    if(channel==="voice")return caps.includes("voice");
    if(channel==="email")return caps.includes("email");
    return false;
  }),[bindings,channel]);

  const verifiedEmailDomains=domains.filter((row:any)=>row.purpose==="email"&&row.verification_status==="verified");

  async function refresh(){
    await queryClient.invalidateQueries({queryKey:["comms-hub",selected?.id]});
  }

  async function createIdentity(event:FormEvent){
    event.preventDefault();
    if(!scope)return;
    const selectedBinding=bindingId||compatibleBindings[0]?.id;
    if(!selectedBinding){
      toast.error("Configure a compatible communications provider in Connector Hub first");
      return;
    }
    try{
      setBusy("identity");
      await saveIdentityFn({data:{
        ...scope,locationId:locationId||null,channel,purpose,
        identityValue:identityValue.trim(),displayName:displayName.trim()||null,
        replyTo:replyTo.trim()||null,providerBindingId:selectedBinding,
        domainId:channel==="email"?(domainId||verifiedEmailDomains[0]?.id||null):null,
        metadata:{createdFrom:"comms_hub"}
      }});
      setIdentityValue("");setDisplayName("");setReplyTo("");
      await refresh();
      toast.success("Communication identity created; provider verification is still required before activation");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  async function setActive(identity:any,active:boolean,primary=false){
    if(!scope)return;
    try{
      setBusy(identity.id);
      await activateFn({data:{...scope,identityId:identity.id,active,primary}});
      await refresh();
      toast.success(active?"Communication identity activated":"Communication identity disabled");
    }catch(error){toast.error(errorText(error));}
    finally{setBusy("");}
  }

  const channelCards=[
    {
      key:"whatsapp",icon:MessageCircle,label:"WhatsApp",
      live:activeCapabilities.has("whatsapp.outbound")||whatsapp.some((row:any)=>row.status==="configured"&&row.outbound_enabled),
      detail:whatsapp.length+" number(s) · "+conversations.length+" conversation(s)"
    },
    {
      key:"sms",icon:Smartphone,label:"SMS",
      live:activeCapabilities.has("sms"),
      detail:bindings.filter((row:any)=>(row.capabilities??[]).includes("sms")).length+" compatible provider binding(s)"
    },
    {
      key:"email",icon:Mail,label:"Email",
      live:activeCapabilities.has("email")&&identities.some((row:any)=>row.channel==="email"&&row.active),
      detail:identities.filter((row:any)=>row.channel==="email").length+" sender identity/identities"
    },
    {
      key:"voice",icon:Phone,label:"Voice",
      live:activeCapabilities.has("voice"),
      detail:bindings.filter((row:any)=>(row.capabilities??[]).includes("voice")).length+" voice provider binding(s)"
    },
  ];

  const delivered=events.filter((row:any)=>row.status==="delivered").length;
  const failed=events.filter((row:any)=>["failed","blocked"].includes(row.status)).length;
  const openReception=receptionRequests.filter((row:any)=>!["handled","cancelled","delivered"].includes(row.status)).length;

  return <AppShell
    title="Omniqora Comms Hub"
    subtitle="One tenant-safe communications layer for WhatsApp, SMS, email, voice, receptionist intake, conversations and human handoff."
    actions={<div className="flex items-center gap-2">
      <ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>
      <Link to="/app/connectors"><Button size="sm" variant="outline"><Cable className="mr-1.5 h-4 w-4"/>Providers</Button></Link>
    </div>}
  >
    {workspace.loading?<State text="Loading product workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="Provision a tenant product before using Comms Hub."/>:!enabled?
      <State text="Enable connect.core for this tenant product in Tenant Manager."/>:query.isPending?
      <State text="Loading communications workspace…"/>:query.error?<State text={errorText(query.error)} destructive/>:
      <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {channelCards.map(({key,icon:Icon,label,live,detail})=><Card key={key}><CardContent className="p-5">
            <div className="flex items-start justify-between gap-3"><Icon className="h-5 w-5 text-primary"/><Badge variant={live?"default":"outline"}>{live?"live":"not live"}</Badge></div>
            <div className="mt-4 font-display text-xl font-semibold">{label}</div>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </CardContent></Card>)}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Metric icon={Radio} label="Communication events" value={events.length}/>
          <Metric icon={CheckCircle2} label="Delivered" value={delivered}/>
          <Metric icon={Cable} label="Failed / blocked" value={failed}/>
          <Metric icon={Headphones} label="Reception queue" value={openReception}/>
        </div>

        <Tabs defaultValue="identities" className="mt-6">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="identities">Identities</TabsTrigger>
            <TabsTrigger value="providers">Provider state</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="reception">Reception</TabsTrigger>
            <TabsTrigger value="manifest">SaaS contract</TabsTrigger>
          </TabsList>

          <TabsContent value="identities">
            <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
              <Card><CardContent className="p-5">
                <h3 className="font-semibold">New communication identity</h3>
                <p className="mt-1 text-xs text-muted-foreground">Creating an identity does not make it live. The provider/domain must verify it first.</p>
                <form onSubmit={createIdentity} className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Channel"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={channel} onChange={(e)=>{setChannel(e.target.value as any);setBindingId("");}}>{channels.map((item)=><option key={item}>{item}</option>)}</select></Field>
                    <Field label="Purpose"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={purpose} onChange={(e)=>setPurpose(e.target.value as any)}>{purposes.map((item)=><option key={item}>{item}</option>)}</select></Field>
                  </div>
                  <Field label={channel==="email"?"Sender email":"Phone / sender ID"}><Input required value={identityValue} onChange={(e)=>setIdentityValue(e.target.value)} placeholder={channel==="email"?"support@example.com":channel==="sms"?"BRAND or +44…":"+44…"}/></Field>
                  <Field label="Display name"><Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)}/></Field>
                  {channel==="email"&&<Field label="Reply-to"><Input type="email" value={replyTo} onChange={(e)=>setReplyTo(e.target.value)}/></Field>}
                  <Field label="Provider binding"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={bindingId} onChange={(e)=>setBindingId(e.target.value)}><option value="">Select compatible provider</option>{compatibleBindings.map((item:any)=><option key={item.id} value={item.id}>{item.pluginKey??item.provider} · {item.status}</option>)}</select></Field>
                  {channel==="email"&&<Field label="Verified email domain"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={domainId} onChange={(e)=>setDomainId(e.target.value)}><option value="">Select verified email domain</option>{verifiedEmailDomains.map((item:any)=><option key={item.id} value={item.id}>{item.hostname}</option>)}</select></Field>}
                  <Field label="Location (optional)"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={locationId} onChange={(e)=>setLocationId(e.target.value)}><option value="">Tenant-wide</option>{locations.map((item:any)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Button type="submit" disabled={busy==="identity"}>Save identity</Button>
                </form>
              </CardContent></Card>

              <Card><CardContent className="p-0"><Header title="Communication identities" subtitle="Verified identities may be activated and marked primary per channel/purpose/location."/>
                <div className="divide-y">{identities.map((item:any)=><div key={item.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><div className="font-medium">{item.display_name||item.identity_value}</div><div className="text-xs text-muted-foreground">{item.channel} · {item.purpose} · {item.identity_value}</div></div>
                    <div className="flex items-center gap-2"><Badge variant="outline">{item.verification_status}</Badge><Badge variant={item.active?"default":"outline"}>{item.active?(item.is_primary?"primary":"active"):"inactive"}</Badge></div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!item.active&&item.verification_status==="verified"&&<Button size="sm" onClick={()=>setActive(item,true,true)} disabled={busy===item.id}>Activate primary</Button>}
                    {item.active&&<Button size="sm" variant="outline" onClick={()=>setActive(item,false)} disabled={busy===item.id}>Disable</Button>}
                    {item.verification_status!=="verified"&&<span className="text-xs text-muted-foreground">Await provider/domain verification before activation.</span>}
                  </div>
                </div>)}{!identities.length&&<p className="p-5 text-sm text-muted-foreground">No product-scoped communication identities yet.</p>}</div>
              </CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="providers">
            <Table headers={["Provider","Capabilities","Environment","Credentials","Verified","Status"]} rows={bindings.map((item:any)=>[
              item.pluginKey??item.provider,
              (item.capabilities??[]).join(", ")||"—",
              item.environment,
              item.credentialNamesConfigured?.length?item.credentialNamesConfigured.join(", "):"none",
              item.lastVerifiedAt?new Date(item.lastVerifiedAt).toLocaleString():"never",
              <Badge key={item.id} variant="outline">{item.status} / {item.adapterStatus}</Badge>
            ])}/>
          </TabsContent>

          <TabsContent value="whatsapp">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-0"><Header title="WhatsApp numbers" subtitle="Legacy direct Meta channels are shown here while they are progressively migrated into provider bindings."/><div className="divide-y">{whatsapp.map((item:any)=><div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{item.label||item.display_phone||item.phone_number_id}</div><div className="text-xs text-muted-foreground">{item.product_key} · {item.scope_kind}{item.scope_id?" · "+item.scope_id:""}</div></div><Badge variant="outline">{item.status}</Badge></div><div className="mt-2 flex flex-wrap gap-1.5">{item.is_primary&&<Badge>primary</Badge>}{item.ai_enabled&&<Badge variant="secondary"><Bot className="mr-1 h-3 w-3"/>AI</Badge>}{item.human_handoff_enabled&&<Badge variant="secondary">human handoff</Badge>}</div></div>)}{!whatsapp.length&&<p className="p-5 text-sm text-muted-foreground">No WhatsApp numbers mapped to this product.</p>}</div><div className="border-t p-4"><Link to="/app/whatsapp"><Button size="sm" variant="outline">Open WhatsApp operations</Button></Link></div></CardContent></Card>
              <Card><CardContent className="p-0"><Header title="Recent conversations" subtitle="Conversations attached to the product's mapped WhatsApp channels."/><div className="divide-y">{conversations.slice(0,40).map((item:any)=><div key={item.id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{item.contact?.display_name??item.contact?.wa_id??"Unknown"}</div><div className="text-xs text-muted-foreground">{item.contact?.wa_id??"—"} · {new Date(item.last_message_at).toLocaleString()}</div></div><Badge variant="outline">{item.status}</Badge></div>)}{!conversations.length&&<p className="p-5 text-sm text-muted-foreground">No conversations yet.</p>}</div><div className="border-t p-4"><Link to="/app/inbox"><Button size="sm" variant="outline"><UsersRound className="mr-2 h-4 w-4"/>Open shared inbox</Button></Link></div></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="events">
            <Table headers={["Event","Direction","Scope","Attempts","Created","Status"]} rows={events.map((item:any)=>[
              item.event_type,item.direction,item.scope_id,item.attempts,
              new Date(item.created_at).toLocaleString(),
              <Badge key={item.id} variant="outline">{item.status}</Badge>
            ])}/>
          </TabsContent>

          <TabsContent value="reception">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card><CardContent className="p-5"><h3 className="font-semibold">Reception configuration</h3><div className="mt-4 space-y-3">{receptionSettings.map((item:any)=><div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><span className="font-medium">{item.location_id?"Location scoped":"Tenant-wide"}</span><Badge variant={item.enabled?"default":"outline"}>{item.enabled?"enabled":"off"}</Badge></div><div className="mt-2 text-xs text-muted-foreground">AI drafts: {item.allow_ai_drafting?"yes":"no"} · orders: {item.allow_order_intake?"yes":"no"} · bookings: {item.allow_booking_intake?"yes":"no"}</div></div>)}{!receptionSettings.length&&<p className="text-sm text-muted-foreground">Reception is not configured for this product.</p>}</div></CardContent></Card>
              <Card className="lg:col-span-2"><CardContent className="p-0"><Header title="Reception requests" subtitle="Phone, WhatsApp, web, app, manual and API intake awaiting handoff or source-system completion."/><div className="divide-y">{receptionRequests.slice(0,50).map((item:any)=><div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{item.customer_name} · {item.kind}</div><div className="text-xs text-muted-foreground">{item.channel} · {new Date(item.created_at).toLocaleString()}</div></div><Badge variant="outline">{item.status}</Badge></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p></div>)}{!receptionRequests.length&&<p className="p-5 text-sm text-muted-foreground">No reception requests yet.</p>}</div></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="manifest">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="p-5"><h3 className="font-semibold">Product Connect contract</h3><div className="mt-4 space-y-3"><Row label="Product" value={data.manifest?.name??selected.product_key}/><Row label="Manifest status" value={data.manifest?.status??"not registered"}/><Row label="Shared modules" value={String(data.manifest?.modules?.length??0)}/><Row label="Allowed event namespaces" value={String(data.manifest?.eventPrefixes?.length??0)}/><Row label="Tools" value={String(data.manifest?.tools?.length??0)}/></div></CardContent></Card>
              <Card><CardContent className="p-5"><h3 className="font-semibold">Allowed event namespaces</h3><div className="mt-3 flex flex-wrap gap-2">{(data.manifest?.eventPrefixes??[]).map((item:string)=><Badge key={item} variant="secondary">{item}*</Badge>)}{(data.manifest?.events??[]).map((item:string)=><Badge key={item} variant="outline">{item}</Badge>)}</div><h3 className="mt-5 font-semibold">Available product tools</h3><div className="mt-3 flex flex-wrap gap-2">{(data.manifest?.tools??[]).map((item:string)=><Badge key={item} variant="outline">{item}</Badge>)}</div></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </>}
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Radio;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Row({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function Table({headers,rows}:{headers:string[];rows:React.ReactNode[][]}){return <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{headers.map((h)=><th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i} className="px-5 py-3 align-top">{cell}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={headers.length} className="px-5 py-8 text-center text-muted-foreground">No records yet.</td></tr>}</tbody></table></div></CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
