import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getManagedTenantProductConfiguration,
  setManagedTenantMemberRole,
} from "@/modules/platform/tenant-management.functions";
import {
  getTenantIdentityPolicy,
  upsertTenantIdentityPolicy,
} from "@/modules/identity/functions";
import {
  getTenantBrandingWorkspace,
  saveTenantBranding,
} from "@/modules/branding/functions";
import {
  listTenantRuntimeConfig,
  setTenantRuntimeConfig,
} from "@/modules/platform/launch.functions";
import { Cable, Globe2, KeyRound, Palette, Settings2, ShieldCheck, UsersRound } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/settings")({
  head:()=>({meta:[{title:"Settings — Omniqora"},{name:"robots",content:"noindex"}]}),
  component:Settings,
});

const identityMethods=["password","magic_link","sms_otp","whatsapp_otp","google","apple","microsoft","passkey"] as const;
const mfaMethods=["totp","sms_otp","whatsapp_otp","passkey"] as const;

function Settings(){
  const queryClient=useQueryClient();
  const workspace=useProductWorkspace();
  const selected=workspace.selected;
  const scope=selected?{tenantId:selected.tenant_id,tenantProductId:selected.id}:null;

  const managedFn=useServerFn(getManagedTenantProductConfiguration);
  const identityFn=useServerFn(getTenantIdentityPolicy);
  const saveIdentityFn=useServerFn(upsertTenantIdentityPolicy);
  const brandingFn=useServerFn(getTenantBrandingWorkspace);
  const saveBrandFn=useServerFn(saveTenantBranding);
  const runtimeFn=useServerFn(listTenantRuntimeConfig);
  const saveRuntimeFn=useServerFn(setTenantRuntimeConfig);
  const memberRoleFn=useServerFn(setManagedTenantMemberRole);

  const managed=useQuery({
    queryKey:["settings-managed",selected?.id],
    enabled:!!selected,
    queryFn:()=>managedFn({data:{tenantProductId:selected!.id}}),
    retry:false,
  });
  const identity=useQuery({
    queryKey:["settings-identity",selected?.id],
    enabled:!!scope,
    queryFn:()=>identityFn({data:{...scope!}}),
    retry:false,
  });
  const branding=useQuery({
    queryKey:["settings-branding",selected?.id],
    enabled:!!scope,
    queryFn:()=>brandingFn({data:scope!}),
    retry:false,
  });
  const runtime=useQuery({
    queryKey:["settings-runtime",selected?.id],
    enabled:!!scope,
    queryFn:()=>runtimeFn({data:scope!}),
    retry:false,
  });

  const[enabledMethods,setEnabledMethods]=useState<string[]>(["magic_link","password"]);
  const[primaryMethod,setPrimaryMethod]=useState("magic_link");
  const[requireMfa,setRequireMfa]=useState(false);
  const[allowedMfa,setAllowedMfa]=useState<string[]>(["totp"]);
  const[sessionMinutes,setSessionMinutes]=useState(480);
  const[rememberDays,setRememberDays]=useState(30);
  const[inviteOnly,setInviteOnly]=useState(false);
  const[blockDisposable,setBlockDisposable]=useState(true);

  useEffect(()=>{
    const p=identity.data as any;
    if(!p)return;
    setEnabledMethods(p.enabled_methods??["magic_link","password"]);
    setPrimaryMethod(p.primary_method??"magic_link");
    setRequireMfa(Boolean(p.require_mfa));
    setAllowedMfa(p.allowed_mfa_methods??[]);
    setSessionMinutes(Number(p.session_minutes??480));
    setRememberDays(Number(p.remember_device_days??30));
    setInviteOnly(Boolean(p.invite_only));
    setBlockDisposable(Boolean(p.block_disposable_email));
  },[identity.data]);

  const brand=(branding.data?.brands??[])[0] as any|undefined;
  const[brandName,setBrandName]=useState("");
  const[appName,setAppName]=useState("");
  const[legalName,setLegalName]=useState("");
  const[website,setWebsite]=useState("");
  const[logo,setLogo]=useState("");
  const[favicon,setFavicon]=useState("");
  const[primaryColour,setPrimaryColour]=useState("");
  const[supportEmail,setSupportEmail]=useState("");
  const[supportPhone,setSupportPhone]=useState("");
  const[facebook,setFacebook]=useState("");
  const[instagram,setInstagram]=useState("");
  const[linkedin,setLinkedin]=useState("");
  const[brandingMode,setBrandingMode]=useState<"landlord"|"co_branded"|"white_label">("co_branded");

  useEffect(()=>{
    if(!brand)return;
    setBrandName(brand.name??"");setAppName(brand.app_name??"");setLegalName(brand.legal_name??"");
    setWebsite(brand.website_url??"");setLogo(brand.logo_url??"");setFavicon(brand.favicon_url??"");
    setPrimaryColour(brand.primary_colour??"");setSupportEmail(brand.support_email??"");setSupportPhone(brand.support_phone??"");
    setFacebook(brand.social_links?.facebook??"");setInstagram(brand.social_links?.instagram??"");setLinkedin(brand.social_links?.linkedin??"");
    setBrandingMode(brand.branding_mode??"co_branded");
  },[brand?.id,brand?.revision]);

  const[configKey,setConfigKey]=useState("");
  const[configValue,setConfigValue]=useState("{}");
  const[busy,setBusy]=useState("");

  async function refresh(){
    await Promise.all([
      queryClient.invalidateQueries({queryKey:["settings-managed",selected?.id]}),
      queryClient.invalidateQueries({queryKey:["settings-identity",selected?.id]}),
      queryClient.invalidateQueries({queryKey:["settings-branding",selected?.id]}),
      queryClient.invalidateQueries({queryKey:["settings-runtime",selected?.id]}),
    ]);
  }

  async function saveIdentity(event:FormEvent){
    event.preventDefault();if(!scope)return;
    if(!enabledMethods.includes(primaryMethod)){toast.error("Primary sign-in method must be enabled");return;}
    try{
      setBusy("identity");
      await saveIdentityFn({data:{
        ...scope,enabledMethods:enabledMethods as any,primaryMethod:primaryMethod as any,
        requireMfa,allowedMfaMethods:allowedMfa as any,sessionMinutes,rememberDeviceDays:rememberDays,
        allowedEmailDomains:[],blockDisposableEmail:blockDisposable,inviteOnly,config:{}
      }});
      await refresh();toast.success("Identity policy saved");
    }catch(error){toast.error(errorText(error));}finally{setBusy("");}
  }

  async function saveBrand(event:FormEvent){
    event.preventDefault();if(!scope||!selected)return;
    try{
      setBusy("brand");
      await saveBrandFn({data:{
        ...scope,brandKey:brand?.brand_key??selected.brand_key??"default",brandingMode,
        name:brandName||managed.data?.tenant?.name||selected.product_key,
        appName:appName||null,legalName:legalName||null,logoUrl:logo||null,
        logoLightUrl:null,logoDarkUrl:null,iconUrl:null,faviconUrl:favicon||null,splashUrl:null,ogImageUrl:null,
        websiteUrl:website||null,primaryColour:primaryColour||null,secondaryColour:null,accentColour:null,
        fontFamily:null,supportEmail:supportEmail||null,supportPhone:supportPhone||null,
        locale:selected.brands?.[0]?.locale??null,poweredByLabel:brandingMode==="white_label"?null:"Powered by Omniqora",
        terminology:{},theme:{},socialLinks:{facebook:facebook||null,instagram:instagram||null,linkedin:linkedin||null},
        legalDetails:{companyName:legalName||null,registeredAddress:{}},seo:{},brandVoice:{},
        contactDetails:{publicEmail:supportEmail||null,publicPhone:supportPhone||null,address:{}}
      }});
      await refresh();toast.success("Branding saved");
    }catch(error){toast.error(errorText(error));}finally{setBusy("");}
  }

  async function saveRuntime(event:FormEvent){
    event.preventDefault();if(!scope)return;
    let value:unknown;
    try{value=JSON.parse(configValue);}catch{toast.error("Runtime value must be valid JSON");return;}
    try{
      setBusy("runtime");
      await saveRuntimeFn({data:{...scope,locationId:null,configKey:configKey.trim(),value,enabled:true}});
      setConfigKey("");setConfigValue("{}");await refresh();toast.success("Runtime configuration saved");
    }catch(error){toast.error(errorText(error));}finally{setBusy("");}
  }

  async function setMemberRole(userId:string,role:"owner"|"admin"|"agent"|"viewer"){
    if(!selected)return;
    try{
      setBusy("member:"+userId);
      await memberRoleFn({data:{tenantProductId:selected.id,userId,role}});
      await refresh();toast.success("Member role updated");
    }catch(error){toast.error(errorText(error));}finally{setBusy("");}
  }

  const providerMethods=useMemo(()=>{
    const integrations=(managed.data?.integrations??[]) as any[];
    return{
      whatsapp_otp:integrations.some((row)=>row.integrationKind==="communications"&&row.status==="active"),
      sms_otp:integrations.some((row)=>row.integrationKind==="communications"&&row.status==="active"),
      google:integrations.some((row)=>row.provider==="google"&&row.status==="active"),
      microsoft:integrations.some((row)=>row.provider?.includes("microsoft")&&row.status==="active"),
      apple:integrations.some((row)=>row.provider==="apple"&&row.status==="active"),
      passkey:true,password:true,magic_link:true
    } as Record<string,boolean>;
  },[managed.data]);

  return <AppShell
    title="Settings"
    subtitle="Actual tenant/product identity, branding, communications, members and runtime configuration."
    actions={<ProductWorkspacePicker products={workspace.products} selectedId={workspace.selectedId} onChange={workspace.setSelectedId}/>}
  >
    {workspace.loading?<State text="Loading product workspace…"/>:workspace.error?<State text={workspace.error} destructive/>:!selected?
      <State text="No active product workspace is available."/>:managed.isPending?
      <State text="Loading settings…"/>:managed.error?<State text={errorText(managed.error)} destructive/>:
      <Tabs defaultValue="tenant">
        <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="runtime">Runtime</TabsTrigger>
        </TabsList>

        <TabsContent value="tenant">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="p-5 space-y-3">
              <h3 className="font-semibold">Tenant product</h3>
              <Row label="Tenant" value={managed.data?.tenant?.name??"—"}/>
              <Row label="Tenant slug" value={managed.data?.tenant?.slug??"—"}/>
              <Row label="Product" value={selected.product_key}/>
              <Row label="Region" value={selected.region_key}/>
              <Row label="Plan" value={selected.plan_key??"—"}/>
              <Row label="Status" value={selected.status}/>
            </CardContent></Card>
            <Card><CardContent className="p-0">
              <Header title="Domains & locations" subtitle="No sample tenant values: these are the records provisioned for this product."/>
              <div className="divide-y">{(managed.data?.domains??[]).map((d:any)=><div key={d.id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{d.hostname}</div><div className="text-xs text-muted-foreground">{d.purpose}{d.is_primary?" · primary":""}</div></div><Badge variant="outline">{d.verification_status}</Badge></div>)}{(managed.data?.locations??[]).map((l:any)=><div key={l.id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.country_code||"—"} · {l.locale||"—"} · {l.time_zone||"—"}</div></div><Badge variant="outline">{l.status}</Badge></div>)}</div>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="identity">
          <Card><CardContent className="p-6">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary"/><h3 className="font-semibold">Sign-in policy</h3></div>
            <p className="mt-1 text-xs text-muted-foreground">Enabling a method here is policy only. Methods that need an external provider still require an active Connector Hub binding.</p>
            <form onSubmit={saveIdentity} className="mt-5 space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{identityMethods.map((method)=><label key={method} className="rounded-lg border p-3 text-sm"><div className="flex items-center gap-2"><input type="checkbox" checked={enabledMethods.includes(method)} onChange={(e)=>setEnabledMethods((old)=>e.target.checked?[...old,method]:old.filter((v)=>v!==method))}/><span>{method}</span></div><div className="mt-1 text-xs text-muted-foreground">{providerMethods[method]?"provider/path available":"provider not active"}</div></label>)}</div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Primary method"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={primaryMethod} onChange={(e)=>setPrimaryMethod(e.target.value)}>{enabledMethods.map((m)=><option key={m}>{m}</option>)}</select></Field>
                <Field label="Session minutes"><Input type="number" min={5} max={10080} value={sessionMinutes} onChange={(e)=>setSessionMinutes(Number(e.target.value))}/></Field>
                <Field label="Remember device days"><Input type="number" min={0} max={365} value={rememberDays} onChange={(e)=>setRememberDays(Number(e.target.value))}/></Field>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={inviteOnly} onChange={(e)=>setInviteOnly(e.target.checked)}/>Invite-only access</label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={blockDisposable} onChange={(e)=>setBlockDisposable(e.target.checked)}/>Block disposable email</label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={requireMfa} onChange={(e)=>setRequireMfa(e.target.checked)}/>Require MFA</label>
              </div>
              {requireMfa&&<Field label="Allowed MFA"><div className="flex flex-wrap gap-2">{mfaMethods.map((method)=><label key={method} className="rounded-md border px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={allowedMfa.includes(method)} onChange={(e)=>setAllowedMfa((old)=>e.target.checked?[...old,method]:old.filter((v)=>v!==method))}/>{method}</label>)}</div></Field>}
              <Button type="submit" disabled={busy==="identity"}>Save identity policy</Button>
            </form>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card><CardContent className="p-6">
            <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary"/><h3 className="font-semibold">White-label identity</h3></div>
            <form onSubmit={saveBrand} className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Brand name"><Input required value={brandName} onChange={(e)=>setBrandName(e.target.value)}/></Field>
                <Field label="App name"><Input value={appName} onChange={(e)=>setAppName(e.target.value)}/></Field>
                <Field label="Legal name"><Input value={legalName} onChange={(e)=>setLegalName(e.target.value)}/></Field>
                <Field label="Website"><Input type="url" value={website} onChange={(e)=>setWebsite(e.target.value)}/></Field>
                <Field label="Logo URL"><Input type="url" value={logo} onChange={(e)=>setLogo(e.target.value)}/></Field>
                <Field label="Favicon URL"><Input type="url" value={favicon} onChange={(e)=>setFavicon(e.target.value)}/></Field>
                <Field label="Primary colour"><Input value={primaryColour} onChange={(e)=>setPrimaryColour(e.target.value)} placeholder="#123456"/></Field>
                <Field label="Branding mode"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={brandingMode} onChange={(e)=>setBrandingMode(e.target.value as any)}><option value="landlord">landlord</option><option value="co_branded">co_branded</option><option value="white_label">white_label</option></select></Field>
                <Field label="Support email"><Input type="email" value={supportEmail} onChange={(e)=>setSupportEmail(e.target.value)}/></Field>
                <Field label="Support phone"><Input value={supportPhone} onChange={(e)=>setSupportPhone(e.target.value)}/></Field>
                <Field label="Facebook"><Input type="url" value={facebook} onChange={(e)=>setFacebook(e.target.value)}/></Field>
                <Field label="Instagram"><Input type="url" value={instagram} onChange={(e)=>setInstagram(e.target.value)}/></Field>
                <Field label="LinkedIn"><Input type="url" value={linkedin} onChange={(e)=>setLinkedin(e.target.value)}/></Field>
              </div>
              <Button type="submit" disabled={busy==="brand"}>Save branding</Button>
            </form>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="communications">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="p-0"><Header title="Communication identities" subtitle="Only verified identities can be activated for email, WhatsApp, SMS or voice."/><div className="divide-y">{(managed.data?.communicationIdentities??[]).map((item:any)=><div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{item.channel} · {item.purpose}</div><div className="text-xs text-muted-foreground">{item.identity_value}</div></div><Badge variant="outline">{item.verification_status}</Badge></div></div>)}{!(managed.data?.communicationIdentities??[]).length&&<p className="p-5 text-sm text-muted-foreground">No communication identities configured.</p>}</div></CardContent></Card>
            <Card><CardContent className="p-0"><Header title="Provider bindings" subtitle="Configure provider credentials in Connector Hub; Settings only reports real status."/><div className="divide-y">{(managed.data?.integrations??[]).map((item:any)=><div key={item.id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-medium">{item.provider}</div><div className="text-xs text-muted-foreground">{item.integrationKind} · {item.environment}</div></div><Badge variant="outline">{item.status}</Badge></div>)}{!(managed.data?.integrations??[]).length&&<p className="p-5 text-sm text-muted-foreground">No provider bindings.</p>}</div><div className="border-t p-4"><Link to="/app/connectors"><Button size="sm" variant="outline"><Cable className="mr-2 h-4 w-4"/>Open Connector Hub</Button></Link></div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card><CardContent className="p-0"><Header title="Tenant members" subtitle="These are actual tenant memberships; the last owner cannot be demoted."/><div className="divide-y">{(managed.data?.members??[]).map((member:any)=><div key={member.user_id} className="grid gap-3 p-4 sm:grid-cols-[1fr_180px] sm:items-center"><div><div className="font-mono text-xs">{member.user_id}</div><div className="text-xs text-muted-foreground">Tenant user</div></div><select className="h-9 rounded-md border bg-background px-3 text-sm" value={member.role} disabled={busy==="member:"+member.user_id} onChange={(e)=>setMemberRole(member.user_id,e.target.value as any)}>{["owner","admin","agent","viewer"].map((r)=><option key={r}>{r}</option>)}</select></div>)}{!(managed.data?.members??[]).length&&<p className="p-5 text-sm text-muted-foreground">No tenant members.</p>}</div></CardContent></Card>
        </TabsContent>

        <TabsContent value="runtime">
          <div className="grid gap-4 lg:grid-cols-[.7fr_1.3fr]">
            <Card><CardContent className="p-5">
              <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary"/><h3 className="font-semibold">Runtime config</h3></div>
              <p className="mt-1 text-xs text-muted-foreground">Use versioned tenant/product configuration rather than hardcoding settings into a vertical app.</p>
              <form onSubmit={saveRuntime} className="mt-4 space-y-3">
                <Field label="Config key"><Input required value={configKey} onChange={(e)=>setConfigKey(e.target.value)} placeholder="ai.policy"/></Field>
                <Field label="JSON value"><textarea required className="min-h-32 w-full rounded-md border bg-background p-3 font-mono text-xs" value={configValue} onChange={(e)=>setConfigValue(e.target.value)}/></Field>
                <Button type="submit" disabled={busy==="runtime"}>Save runtime config</Button>
              </form>
            </CardContent></Card>
            <Card><CardContent className="p-0"><Header title="Current configuration" subtitle="Product-scoped settings with source and revision."/><div className="divide-y">{((runtime.data??[]) as any[]).map((item)=><div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-mono text-sm font-medium">{item.config_key}</div><div className="text-xs text-muted-foreground">{item.source} · revision {item.revision}</div></div><Badge variant="outline">{item.enabled?"enabled":"disabled"}</Badge></div><pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify(item.value,null,2)}</pre></div>)}{!((runtime.data??[]) as any[]).length&&<p className="p-5 text-sm text-muted-foreground">No runtime config overrides.</p>}</div></CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>}
  </AppShell>;
}

function Row({label,value}:{label:string;value:string}){return <div className="flex items-start justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={"p-6 text-sm "+(destructive?"text-destructive":"text-muted-foreground")}>{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
