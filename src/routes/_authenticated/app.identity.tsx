import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {createCustomerPortalInvitation,getIdentityWorkspace,saveIdentityPolicy} from "@/modules/identity/functions";
import {KeyRound,RefreshCw,ShieldCheck,UserRoundCheck} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/identity")({component:Identity,head:()=>({meta:[{title:"Identity & Portal — Omniqora"},{name:"robots",content:"noindex"}]})});
function Identity(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getIdentityWorkspace),policyFn=useServerFn(saveIdentityPolicy),inviteFn=useServerFn(createCustomerPortalInvitation);
 const tenant=useQuery({queryKey:["identity-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["identity-v3",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[email,setEmail]=useState(""),[inviteToken,setInviteToken]=useState("");
 async function run(fn:()=>Promise<any>,msg:string){try{const r=await fn();toast.success(msg);await q.refetch();return r;}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 return <AppShell title="Identity, SSO & Customer Portal" subtitle="Tenant identity policy, MFA/passkeys/OTP readiness and reusable customer/client portal access."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-3"><Metric icon={ShieldCheck} label="Policy" value={q.data?.policy?"Configured":"Default"}/><Metric icon={UserRoundCheck} label="Portal users" value={String(q.data?.users?.length??0)}/><Metric icon={KeyRound} label="Pending invites" value={String((q.data?.invitations??[]).filter((x:any)=>x.status==="pending").length)}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Tenant identity policy</h2><p className="mt-1 text-xs text-muted-foreground">The default below enables password + magic link and customer portal; passkey/WhatsApp OTP are explicit tenant choices.</p>
    <div className="mt-4 flex flex-wrap gap-2">{(q.data?.policy?.allowed_methods??["password","magic_link"]).map((x:string)=><Badge key={x} variant="outline">{x}</Badge>)}</div>
    <Button className="mt-4" onClick={()=>run(()=>policyFn({data:{tenantId,productKey,allowedMethods:["password","magic_link","passkey"],mfaRequired:false,customerPortalEnabled:true,passkeysEnabled:true,whatsappOtpEnabled:false,ssoConfig:{},sessionPolicy:{}}}),"Identity policy saved")}>Enable passkey-ready policy</Button>
   </CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Invite portal user</h2><Input className="mt-3" placeholder="customer@example.com" value={email} onChange={e=>setEmail(e.target.value)}/><Button className="mt-3" disabled={!email} onClick={async()=>{const r=await run(()=>inviteFn({data:{tenantId,productKey,personId:null,email,phoneE164:null,validHours:72}}),"Invitation created");if(r?.token)setInviteToken(r.token)}}>Create secure invitation</Button>{inviteToken&&<div className="mt-3 rounded-lg border p-3"><p className="text-xs font-medium">One-time invite token</p><code className="mt-2 block break-all rounded bg-muted p-2 text-xs">{inviteToken}</code></div>}
   </CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Portal access</h2><div className="mt-4 grid gap-2 lg:grid-cols-2">{(q.data?.users??[]).map((u:any)=><div key={u.user_id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{u.person?.display_name||u.user_id}</b><p className="text-xs text-muted-foreground">{(u.permissions??[]).join(", ")||"Default product portal"}</p></div><StatusBadge status={u.status}/></div>)}</div></CardContent></Card>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof ShieldCheck;label:string;value:string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-xl font-semibold">{value}</div></CardContent></Card>}
