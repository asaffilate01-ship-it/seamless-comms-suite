import {createFileRoute} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {AppShell,StatusBadge} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {approveEmbeddedFinanceTransfer,createEmbeddedFinanceBeneficiary,createEmbeddedFinanceProfile,createEmbeddedFinanceTransfer,getEmbeddedFinanceWorkspace} from "@/modules/reconciliation/functions";
import {Building2,CreditCard,Landmark,RefreshCw} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/embedded-finance")({component:EmbeddedFinance,head:()=>({meta:[{title:"Embedded Finance — Omniqora"},{name:"robots",content:"noindex"}]})});
function EmbeddedFinance(){
 const t=useTenant(),tenantId=t.tenantId??"";const tenantFn=useServerFn(getTenantControlPlane),getFn=useServerFn(getEmbeddedFinanceWorkspace),profileFn=useServerFn(createEmbeddedFinanceProfile),beneficiaryFn=useServerFn(createEmbeddedFinanceBeneficiary),transferFn=useServerFn(createEmbeddedFinanceTransfer),approveFn=useServerFn(approveEmbeddedFinanceTransfer);
 const tenant=useQuery({queryKey:["finance-tenant",tenantId],queryFn:()=>tenantFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(tenant.data?.products??[]).map((p:any)=>p.product_key);const[productKey,setProductKey]=useState("");
 useEffect(()=>{if(!productKey&&products[0])setProductKey(products[0]);},[productKey,products.join("|")]);
 const q=useQuery({queryKey:["embedded-finance",tenantId,productKey],queryFn:()=>getFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const[vendorRef,setVendorRef]=useState(""),[beneficiaryName,setBeneficiaryName]=useState(""),[amount,setAmount]=useState("1000");
 async function run(fn:()=>Promise<unknown>,msg:string){try{await fn();toast.success(msg);await q.refetch();}catch(e){toast.error(e instanceof Error?e.message:String(e));}}
 const firstProfile=(q.data?.profiles??[])[0],firstBeneficiary=(q.data?.beneficiaries??[])[0];
 return <AppShell title="Embedded Finance" subtitle="Provider-neutral merchant onboarding, business accounts, tokenised cards, supplier beneficiaries and approval-gated transfers."
 actions={<Button size="sm" variant="outline" onClick={()=>q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <Card><CardContent className="p-5"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map((p:string)=><option key={p}>{p}</option>)}</select></CardContent></Card>
  <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={Building2} label="Profiles" value={q.data?.profiles?.length??0}/><Metric icon={Landmark} label="Accounts" value={q.data?.accounts?.length??0}/><Metric icon={CreditCard} label="Cards" value={q.data?.cards?.length??0}/><Metric icon={Landmark} label="Transfers" value={q.data?.transfers?.length??0}/></div>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <Card><CardContent className="p-5"><h2 className="font-semibold">Merchant/business profile</h2><Input className="mt-3" placeholder="Vendor or merchant reference" value={vendorRef} onChange={e=>setVendorRef(e.target.value)}/><Button className="mt-3" disabled={!vendorRef} onClick={()=>run(()=>profileFn({data:{tenantId,productKey,crmCompanyId:null,vendorRef,providerKey:"payments.adyen",capabilities:["payments","payouts","balance_accounts","issuing"]}}),"Finance profile created")}>Create provider profile</Button><div className="mt-4 space-y-2">{(q.data?.profiles??[]).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><b>{x.vendor_ref||x.id}</b><StatusBadge status={x.status}/></div>)}</div></CardContent></Card>
   <Card><CardContent className="p-5"><h2 className="font-semibold">Approved beneficiary</h2><Input className="mt-3" placeholder="Supplier name" value={beneficiaryName} onChange={e=>setBeneficiaryName(e.target.value)}/><Button className="mt-3" disabled={!firstProfile||!beneficiaryName} onClick={()=>run(()=>beneficiaryFn({data:{tenantId,profileId:firstProfile.id,beneficiaryRef:"supplier-"+Date.now(),name:beneficiaryName,beneficiaryType:"supplier",providerKey:"payments.adyen",externalBeneficiaryRef:null,destinationMasked:"****"}}),"Beneficiary added for review")}>Add beneficiary</Button><p className="mt-3 text-xs text-muted-foreground">Provider bank/card credentials are never stored here; only tokenised external references and masked destinations are retained.</p></CardContent></Card>
  </div>
  <Card className="mt-6"><CardContent className="p-5"><h2 className="font-semibold">Transfers</h2><div className="mt-3 flex gap-2"><Input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/><Button disabled={!firstProfile||!firstBeneficiary} onClick={()=>run(()=>transferFn({data:{tenantId,productKey,profileId:firstProfile.id,sourceAccountId:null,beneficiaryId:firstBeneficiary.id,amountMinor:Number(amount)||1,currency:"GBP",purpose:"Supplier payment",idempotencyKey:"ui-"+crypto.randomUUID()}}),"Transfer sent to review")}>Create review item</Button></div><div className="mt-4 space-y-2">{(q.data?.transfers??[]).map((x:any)=><div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><b>{x.amount_minor} {x.currency}</b><p className="text-xs text-muted-foreground">{x.purpose||x.id}</p></div><div className="flex items-center gap-2"><StatusBadge status={x.status}/>{["draft","review"].includes(x.status)&&<Button size="sm" variant="outline" onClick={()=>run(()=>approveFn({data:{tenantId,transferId:x.id}}),"Transfer approved for provider submission")}>Approve</Button>}</div></div>)}</div></CardContent></Card>
 </AppShell>
}
function Metric({icon:Icon,label,value}:{icon:typeof Building2;label:string;value:number}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><div className="mt-2 font-display text-2xl font-semibold">{value}</div></CardContent></Card>}
