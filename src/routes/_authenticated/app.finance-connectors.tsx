import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useMemo,useState} from "react";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {useTenant} from "@/hooks/useTenant";
import {getTenantControlPlane} from "@/lib/control-plane.functions";
import {getFinanceConnectorCatalogue,getFinanceTenantView,requestFinanceConnectorAddon} from "@/modules/finance-connectors/functions";
import {FINANCE_ADDON_PLANS} from "@/modules/finance-connectors/commercial";
import {toast} from "sonner";
import {recommendFinanceConnectors,type FinanceFamily} from "@/modules/finance-connectors/catalogue";
import {FinanceJourneyWorkspace} from "@/modules/finance-connectors/FinanceJourneyWorkspace";
import {ArrowRight,Building2,Landmark,LockKeyhole,RefreshCw,ShieldCheck,ShoppingBag,WalletCards} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/finance-connectors")({
 component:FinanceConnectorsPage,
 head:()=>({meta:[{title:"Finance Connectors — Omniqora SaaS Factory"},{name:"robots",content:"noindex,nofollow"}]})
});
const families:{key:FinanceFamily;label:string;description:string;icon:typeof Landmark}[]=[
 {key:"merchant_capital",label:"Business funding",description:"YouLend, Liberis, iwoca and specialist SME lenders",icon:Landmark},
 {key:"consumer_checkout",label:"Pay Later checkout",description:"Klarna, PayPal, Clearpay, Affirm and retail finance",icon:ShoppingBag},
 {key:"b2b_terms",label:"Business trade terms",description:"Kriya, Billie and Mondu for approved wholesale buyers",icon:WalletCards},
 {key:"personal_finance",label:"Personal finance",description:"Regulated personal-loan matching partners; broker approval required",icon:ShieldCheck}
];
function FinanceConnectorsPage(){
 const current=useTenant(),tenantId=current.tenantId??"";
 const getTenant=useServerFn(getTenantControlPlane);
 const getCatalogue=useServerFn(getFinanceConnectorCatalogue);
 const getReadiness=useServerFn(getFinanceTenantView);
 const requestAddon=useServerFn(requestFinanceConnectorAddon);
 const [addonPlan,setAddonPlan]=useState<"finance_connect_access"|"finance_connect_pro"|"finance_connect_enterprise">("finance_connect_pro");
 const [addonBusy,setAddonBusy]=useState(false);
 const tenant=useQuery({queryKey:["finance-control-plane",tenantId],
  queryFn:()=>getTenant({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const catalogue=useQuery({queryKey:["finance-connectors-catalogue"],
  queryFn:()=>getCatalogue(),retry:false});
 const products=useMemo(()=>tenant.data?.products?.map((p:any)=>p.product_key)??[],[tenant.data?.products]);
 const [productKey,setProductKey]=useState("");
 const [brand,setBrand]=useState("");
 const [family,setFamily]=useState<FinanceFamily|"all">("all");
 useEffect(()=>{if(!products.includes(productKey))setProductKey(products[0]??"");},[products,productKey]);
 useEffect(()=>{setBrand("");},[productKey]);
 const brands=(catalogue.data?.placements??[]).filter(p=>p.productKey===productKey&&p.brand).map(p=>p.brand!);
 const tenantView=useQuery({
  queryKey:["finance-connector-tenant",tenantId,productKey,brand],
  queryFn:()=>getReadiness({data:{tenantId,productKey,...(brand?{brand}:{})}}),
  enabled:!!tenantId&&!!productKey,retry:false
 });
 const recommendations=tenantView.data?.recommendations??(productKey?recommendFinanceConnectors(productKey,brand||undefined):[]);
 const visible=recommendations.filter(r=>family==="all"||r.family===family);
 const bindings=tenantView.data?.bindings??[];
 const programmes=tenantView.data?.programmes??[];
 return <AppShell
  title="Finance Connectors"
  subtitle="One governed embedded-finance layer for Omniqora SaaS Factory products. Product recommendations never activate a finance provider."
  actions={<Button variant="outline" size="sm" onClick={()=>void Promise.all([catalogue.refetch(),tenant.refetch(),tenantView.refetch()])}><RefreshCw className="mr-2 size-4"/>Refresh</Button>}
 >
  <div className="space-y-6">
   <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
    <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-5 text-amber-500"/><div><p className="text-sm font-semibold">Catalogue and integration scaffolding only</p><p className="mt-1 text-xs text-muted-foreground">No provider contract, customer borrowing approval, checkout finance, funds movement or production deployment is represented by these records.</p></div></div>
    <Badge variant="outline">UK pilot · all disabled</Badge>
   </div>
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    {families.map(f=><button type="button" key={f.key} onClick={()=>setFamily(x=>x===f.key?"all":f.key)}
      className={"rounded-xl border bg-card p-5 text-left transition hover:border-primary/50 "+(family===f.key?"border-primary ring-1 ring-primary/20":"border-border")}>
     <f.icon className="size-5 text-primary"/>
     <div className="mt-3 flex items-center justify-between"><strong className="text-base">{f.label}</strong><span className="font-display text-xl">{(catalogue.data?.providers??[]).filter(p=>p.family===f.key).length}</span></div>
     <p className="mt-2 text-xs text-muted-foreground">{f.description}</p>
    </button>)}
   </div>
   <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
    <label className="text-xs font-medium text-muted-foreground">SaaS product / landlord
     <select aria-label="SaaS product" className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground" value={productKey} onChange={e=>setProductKey(e.target.value)}>
      {products.length?products.map((key:string)=><option key={key} value={key}>{key}</option>):<option value="">No tenant product accessible</option>}
     </select>
    </label>
    <label className="text-xs font-medium text-muted-foreground">Brand / tenant context (recommendations only)
     <select aria-label="Brand" className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground" value={brand} onChange={e=>setBrand(e.target.value)}>
      <option value="">Landlord defaults</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}
     </select>
    </label>
   </CardContent></Card>
   {tenantView.error&&<p role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
    Live tenant readiness cannot be verified. Check the finance migration, tenant permissions and the database connection. This does not affect the informational candidate catalogue.
   </p>}
   <div className="grid gap-3 md:grid-cols-4">
    {[
     {label:"Candidate providers",value:String(recommendations.length),icon:Building2},
     {label:"Stored provider bindings",value:String(bindings.length),icon:ShieldCheck},
     {label:"Review programme records",value:String(programmes.length),icon:WalletCards},
     {label:"Verified live finance",value:"0",icon:LockKeyhole}
    ].map(m=><Card key={m.label}><CardContent className="p-4"><m.icon className="size-4 text-primary"/><p className="mt-4 text-xs text-muted-foreground">{m.label}</p><div className="mt-1 font-display text-2xl font-semibold">{m.value}</div></CardContent></Card>)}
   </div>
   <div className="flex flex-wrap items-center justify-between gap-4">
    <div><h2 className="font-display text-xl font-semibold">Recommended for {productKey||"your product"}</h2>
     <p className="mt-1 text-sm text-muted-foreground">Use business type, seller of record, country and the external finance provider's eligibility before any offer is shown.</p></div>
    <button type="button" className="text-sm font-medium text-primary underline underline-offset-4" onClick={()=>setFamily("all")}>All families</button>
   </div>
   <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {visible.map(p=>{
     const b=bindings.find((x:{providerKey:string;status:string;environment:string})=>x.providerKey===p.key);
     const approved=programmes.filter((x:{providerKey:string;programmeKey:string;status:string})=>x.providerKey===p.key);
     return <Card key={p.key}><CardContent className="p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{p.family.replaceAll("_"," ")}</p><h3 className="mt-1 font-semibold">{p.name}</h3></div><Badge variant="outline">Candidate</Badge></div>
      <p className="mt-3 min-h-10 text-sm text-muted-foreground">{p.purpose}</p>
      <div className="mt-4 space-y-2 border-t pt-4 text-xs">
       <p><b>Integration:</b> {p.rail==="adyen"?"Adyen merchant-level enablement":p.rail==="multi_lender"?"Marketplace/referral agreement":"Direct partner API / referral"}</p>
       <p><b>Provider binding:</b> {b?b.status+" · "+b.environment:"Not configured"}</p>
       <p><b>Programme approvals:</b> {approved.length?approved.map((a:{programmeKey:string;status:string})=>a.programmeKey+" ("+a.status+")").join(", "):"None"}</p>
       <p className="text-muted-foreground">Always requires contract, legal review and merchant/transaction eligibility.</p>
      </div>
     </CardContent></Card>;
    })}
    {!visible.length&&<Card><CardContent className="p-6 text-sm text-muted-foreground">No finance connector is recommended for this selected context. That does not prevent a future reviewed integration.</CardContent></Card>}
   </div>
   <Card><CardContent className="p-5">
    <h2 className="font-semibold">Finance connectors — subscription add-on</h2>
    <p className="mt-2 text-sm text-muted-foreground"><b>Omniqora</b> receives only the agreed technology subscription/setup fee. <b>Zoryn Pay</b> receives any contracted external lender, BNPL, payment margin or referral income. Other SaaS brands are distribution channels, not the external commission payee.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
     {FINANCE_ADDON_PLANS.map(plan=><button type="button" key={plan.key}
      onClick={()=>setAddonPlan(plan.key)} className={"rounded-lg border p-4 text-left "+(addonPlan===plan.key?"border-primary bg-primary/5":"border-border")}>
      <b className="text-sm">{plan.name}</b><p className="mt-2 text-xs text-muted-foreground">Price to be agreed in the SaaS contract.</p>
      <p className="mt-2 text-xs text-muted-foreground">{plan.includes.join(" · ").replaceAll("_"," ")}</p>
     </button>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
     <div className="text-xs text-muted-foreground">
      Current subscription: <b>{tenantView.data?.addon?.status??"Not requested"}</b>
      {tenantView.data?.addon?.pricingStatus==="agreed"&&tenantView.data.addon.monthlyFeeMinor!==null
       ? " · "+new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(tenantView.data.addon.monthlyFeeMinor/100)+"/month"
       :" · Quote required"}
     </div>
     <Button disabled={!tenantId||!productKey||addonBusy||Boolean(tenantView.data?.addon&&tenantView.data.addon.status!=="requested")}
      onClick={async()=>{setAddonBusy(true);try{
       await requestAddon({data:{tenantId,productKey,planKey:addonPlan}});
       toast.success("Omniqora finance add-on quote requested; no payment taken");
       await tenantView.refetch();
      }catch(e){toast.error(e instanceof Error?e.message:"Unable to request add-on");}
      finally{setAddonBusy(false);}}}>Request SaaS add-on quote</Button>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">A quote request never activates a lender, processes a credit application, creates an invoice or accepts a finance provider's terms.</p>
   </CardContent></Card>
   <FinanceJourneyWorkspace tenantId={tenantId} productKey={productKey} availableKeys={recommendations.map(p=>p.key)}/>
   <Card><CardContent className="p-5">
    <h2 className="font-semibold">Activation checklist</h2>
    <p className="mt-1 text-sm text-muted-foreground">An Omniqora provider binding or a finance programme row alone is not proof of live eligibility.</p>
    <ol className="mt-4 grid list-decimal gap-2 pl-5 text-sm md:grid-cols-2">
     <li>Commercial lender/acquirer partnership signed</li><li>UK legal and financial promotion assessment completed</li>
     <li>Merchant and product-category eligibility approved</li><li>Source order/sales permissions and consent verified</li>
     <li>Secret references and sandbox security certified</li><li>Signed webhooks, idempotency, refunds and settlement reconciled</li>
     <li>Independent production readiness evidence</li><li>Separate brand/country/currency enablement before display</li>
    </ol>
    <Link to="/app/platform-kernel" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Open existing provider bindings <ArrowRight className="size-4"/></Link>
   </CardContent></Card>
  </div>
 </AppShell>;
}
