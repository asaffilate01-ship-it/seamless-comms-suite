import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Button} from "@/components/ui/button";
import {Card,CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {createFinanceDraft,listFinanceDrafts,withdrawFinanceDraft} from "./journeys.functions";
import {FINANCE_PROVIDERS,type FinanceFamily} from "./catalogue";
import {ClipboardList,Plus,ShieldCheck,Trash2} from "lucide-react";
import {toast} from "sonner";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function parsePence(value:string):number|null{
 if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(value))return null;
 const [pounds,pence=""]=value.split(".");
 const result=Number(pounds)*100+Number(pence.padEnd(2,"0"));
 return Number.isSafeInteger(result)&&result>=100&&result<=10_000_000_000?result:null;
}
const familyLabels:Record<FinanceFamily,string>={
 merchant_capital:"Merchant working capital",
 consumer_checkout:"Consumer checkout finance",
 b2b_terms:"B2B deferred payment",
 personal_finance:"Personal loan comparison"
};
export function FinanceJourneyWorkspace({tenantId,productKey,availableKeys}:{
 tenantId:string;productKey:string;availableKeys:readonly string[];
}){
 const list=useServerFn(listFinanceDrafts),create=useServerFn(createFinanceDraft),withdraw=useServerFn(withdrawFinanceDraft);
 const [family,setFamily]=useState<FinanceFamily>("merchant_capital");
 const [providerKey,setProviderKey]=useState("");
 const [subjectRef,setSubjectRef]=useState("");
 const [amount,setAmount]=useState("");
 const [idempotencyKey,setIdempotencyKey]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false);
 const enabled=!!tenantId&&!!productKey;
 const providers=useMemo(()=>FINANCE_PROVIDERS.filter(p=>p.family===family&&availableKeys.includes(p.key)),[family,availableKeys]);
 const selection=providers.find(p=>p.key===providerKey)?.key??providers[0]?.key??"";
 const cases=useQuery({queryKey:["finance-case-drafts",tenantId,productKey],queryFn:()=>list({data:{tenantId,productKey}}),
  enabled,retry:false});
 const amountPence=parsePence(amount);
 const valid=enabled&&selection&&uuid.test(subjectRef)&&amountPence!==null&&!busy;
 async function submit(){
  if(!valid||amountPence===null)return;
  setBusy(true);
  try{
   await create({data:{tenantId,productKey,providerKey:selection,sourceSubjectRef:subjectRef,
    requestedAmountMinor:amountPence,idempotencyKey}});
   toast.success("Internal draft saved — no lender contacted");
   setIdempotencyKey(crypto.randomUUID());setSubjectRef("");setAmount("");
   await cases.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:"Unable to save draft");}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  setBusy(true);
  try{
   await withdraw({data:{tenantId,caseId:id}});
   toast.success("Draft withdrawn");
   await cases.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:"Unable to withdraw draft");}
  finally{setBusy(false);}
 }
 const money=(v:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(v/100);
 return <section className="space-y-4">
  <div><h2 className="font-display text-xl font-semibold">Finance application workspace</h2>
   <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Prepare audited internal referral drafts. Enter only an opaque UUID already issued by the authorised source SaaS. Never enter personal names, card details, bank accounts, addresses, income or credit data here.</p>
  </div>
  <Card><CardContent className="p-5">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
    <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary"/><h3 className="font-semibold">Create internal draft</h3></div>
    <Badge variant="outline">No lender transmission</Badge>
   </div>
   <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <label className="space-y-2 text-xs font-semibold text-muted-foreground">Product family
     <select className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
      value={family} onChange={e=>{setFamily(e.target.value as FinanceFamily);setProviderKey("");}}>
      {(Object.keys(familyLabels) as FinanceFamily[]).map(f=><option value={f} key={f}>{familyLabels[f]}</option>)}
     </select>
    </label>
    <label className="space-y-2 text-xs font-semibold text-muted-foreground">Provider candidate
     <select value={selection} onChange={e=>setProviderKey(e.target.value)}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
      {!providers.length&&<option value="">Not mapped to this SaaS</option>}
      {providers.map(p=><option value={p.key} key={p.key}>{p.name}</option>)}
     </select>
    </label>
    <label className="space-y-2 text-xs font-semibold text-muted-foreground">Authoritative source record UUID
     <Input aria-label="Authoritative source record UUID" value={subjectRef} onChange={e=>setSubjectRef(e.target.value.trim())}
      placeholder="UUID from source business or order"/>
    </label>
    <label className="space-y-2 text-xs font-semibold text-muted-foreground">Illustrative requested amount (£)
     <Input aria-label="Requested amount GBP" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}
      placeholder="e.g. 15000.00"/>
    </label>
   </div>
   <p className="mt-3 text-xs text-muted-foreground">The amount is an internal request, not an estimated limit, quotation, APR, eligibility check or lender offer. Merchant/borrower consent must be separately recorded in the authoritative application journey before sharing data.</p>
   <Button className="mt-4" disabled={!valid} onClick={()=>void submit()}><Plus className="mr-2 size-4"/>Save draft for review</Button>
  </CardContent></Card>
  <Card><CardContent className="p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ClipboardList className="size-5 text-primary"/><h3 className="font-semibold">My internal drafts</h3></div><Button size="sm" variant="outline" onClick={()=>void cases.refetch()}>Refresh</Button></div>
   {cases.error&&<p role="alert" className="mt-4 text-sm text-destructive">Draft history unavailable. Tenant role or finance migrations require verification.</p>}
   <div className="mt-5 space-y-2">
    {(cases.data?.drafts??[]).length===0&&<p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No internal finance drafts recorded for this product and signed-in user.</p>}
    {(cases.data?.drafts??[]).map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
     <div><b>{FINANCE_PROVIDERS.find(p=>p.key===item.provider_key)?.name??"Provider"}</b>
      <p className="mt-1 text-xs text-muted-foreground">{familyLabels[item.family as FinanceFamily]??item.family} · {money(item.requested_amount_minor)}</p>
      <p className="mt-1 text-xs text-muted-foreground">Source ref: {String(item.source_subject_ref).slice(0,8)}… · Internal only</p>
     </div>
     <div className="flex items-center gap-2"><Badge variant="outline">{item.stage}</Badge>
      {item.stage==="draft"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void remove(item.id)}>
       <Trash2 className="mr-1 size-4"/>Withdraw</Button>}</div>
    </div>)}
   </div>
  </CardContent></Card>
 </section>;
}
