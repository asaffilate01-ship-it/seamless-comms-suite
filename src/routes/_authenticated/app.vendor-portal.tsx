import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMyMarketplaceVendorWorkspace,
  listMyMarketplaceVendors,
  saveMyMarketplaceListing,
  transitionMyMarketplaceOrder,
} from "@/modules/marketplace/functions";
import { Box, ClipboardList, PackagePlus, Store } from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/vendor-portal")({
  head:()=>({meta:[
    {title:"Vendor Portal — Omniqora"},
    {name:"description",content:"Restricted marketplace vendor workspace for listings, availability and order fulfilment."},
    {name:"robots",content:"noindex"},
  ]}),
  component:VendorPortal,
});

function VendorPortal(){
  const queryClient=useQueryClient();
  const listMemberships=useServerFn(listMyMarketplaceVendors);
  const loadWorkspace=useServerFn(getMyMarketplaceVendorWorkspace);
  const saveListing=useServerFn(saveMyMarketplaceListing);
  const transitionOrder=useServerFn(transitionMyMarketplaceOrder);

  const memberships=useQuery({
    queryKey:["my-marketplace-vendors"],
    queryFn:()=>listMemberships(),
    retry:false,
  });
  const scopes=useMemo(()=>{
    const rows=(memberships.data??[]) as any[];
    return rows.flatMap((membership:any)=>(membership.productScopes??[]).map((product:any)=>({
      membership,product,key:`${membership.vendor_id}:${product.id}`
    })));
  },[memberships.data]);
  const[selectedKey,setSelectedKey]=useState("");

  useEffect(()=>{
    if(scopes.length&&!scopes.some((item)=>item.key===selectedKey))setSelectedKey(scopes[0].key);
  },[scopes,selectedKey]);

  const selected=scopes.find((item)=>item.key===selectedKey)??scopes[0]??null;
  const scope=selected?{
    tenantId:selected.membership.tenant_id,
    tenantProductId:selected.product.id,
    vendorId:selected.membership.vendor_id
  }:null;

  const workspace=useQuery({
    queryKey:["vendor-workspace",selected?.key],
    enabled:!!scope,
    queryFn:()=>loadWorkspace({data:scope!}),
    retry:false,
  });

  const[title,setTitle]=useState("");
  const[type,setType]=useState<"product"|"service"|"rental"|"consultation"|"auction">("service");
  const[currency,setCurrency]=useState("GBP");
  const[price,setPrice]=useState("");
  const[busy,setBusy]=useState(false);

  async function createListing(event:FormEvent){
    event.preventDefault();if(!scope)return;
    try{
      setBusy(true);
      const priceMinor=price.trim()===""?null:Math.round(Number(price)*100);
      if(priceMinor!==null&&(!Number.isFinite(priceMinor)||priceMinor<0))throw new Error("Enter a valid price");
      await saveListing({data:{
        ...scope,type,title,description:null,status:"draft",categoryKeys:[],currency:currency.toUpperCase(),
        priceMinor,attributes:{},inventoryTracked:false,sku:null,quantityOnHand:null
      }});
      setTitle("");setPrice("");
      await queryClient.invalidateQueries({queryKey:["vendor-workspace",selected?.key]});
      toast.success("Draft listing created");
    }catch(e){toast.error(e instanceof Error?e.message:"Listing could not be created");}
    finally{setBusy(false);}
  }

  async function moveOrder(orderId:string,status:"accepted"|"fulfilling"|"completed"){
    if(!scope)return;
    try{
      await transitionOrder({data:{...scope,orderId,status,metadata:{source:"vendor_portal"}}});
      await queryClient.invalidateQueries({queryKey:["vendor-workspace",selected?.key]});
      toast.success("Order updated");
    }catch(e){toast.error(e instanceof Error?e.message:"Order could not be updated");}
  }

  const data=workspace.data as any;
  const orders=(data?.orders??[]) as any[];
  const listings=(data?.listings??[]) as any[];
  const availability=(data?.availability??[]) as any[];

  return <AppShell
    title="Marketplace Vendor Portal"
    subtitle="Restricted vendor identity: catalogue and fulfilment access only — not a full tenant."
    actions={scopes.length>1?<select className="h-9 rounded-md border bg-background px-3 text-sm" value={selectedKey} onChange={(e)=>setSelectedKey(e.target.value)}>{scopes.map((item)=><option key={item.key} value={item.key}>{item.membership.vendor?.name} · {item.product.product_key} · {item.product.region_key}</option>)}</select>:undefined}
  >
    {memberships.isPending?<State text="Loading vendor access…"/>:memberships.error?<State text={errorText(memberships.error)} destructive/>:!scopes.length?
      <State text="This account has no active marketplace vendor access. A tenant administrator can invite it to a vendor role without granting tenant membership."/>:
      workspace.isPending?<State text="Loading vendor workspace…"/>:workspace.error?<State text={errorText(workspace.error)} destructive/>:
      <>
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Store} label="Vendor" value={data.vendor?.name??"—"}/>
          <Metric icon={Box} label="Listings" value={listings.length}/>
          <Metric icon={ClipboardList} label="Orders" value={orders.length}/>
          <Metric icon={ClipboardList} label="Availability slots" value={availability.length}/>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
          <Card><CardContent className="p-6">
            <div className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-primary"/><h2 className="font-display text-lg font-semibold">New listing</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Vendors create drafts or submit them for review; publishing remains governed by the marketplace tenant.</p>
            <form onSubmit={createListing} className="mt-5 space-y-4">
              <Field label="Title"><Input required value={title} onChange={(e)=>setTitle(e.target.value)}/></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(e)=>setType(e.target.value as any)}>{["product","service","rental","consultation","auction"].map((item)=><option key={item}>{item}</option>)}</select></Field>
                <Field label="Currency"><Input required maxLength={3} value={currency} onChange={(e)=>setCurrency(e.target.value.toUpperCase())}/></Field>
              </div>
              <Field label="Price (optional)"><Input inputMode="decimal" value={price} onChange={(e)=>setPrice(e.target.value)} placeholder="49.99"/></Field>
              <Button type="submit" disabled={busy||!["vendor_owner","vendor_admin","vendor_staff"].includes(String(data.role))}>Create draft listing</Button>
            </form>
          </CardContent></Card>

          <Card className="overflow-hidden"><CardContent className="p-0">
            <Header title="My catalogue" subtitle="Only this vendor's listings are exposed in this restricted workspace."/>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Listing</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody className="divide-y">{listings.map((row)=><tr key={row.id}><td className="px-5 py-3 font-medium">{row.title}</td><td className="px-5 py-3">{row.listing_type}</td><td className="px-5 py-3">{row.price_minor==null?"—":formatMoney(row.price_minor,row.currency)}</td><td className="px-5 py-3"><Badge variant="outline">{row.status}</Badge></td></tr>)}{!listings.length&&<tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No listings yet.</td></tr>}</tbody>
            </table></div>
          </CardContent></Card>
        </div>

        <Card className="mt-6 overflow-hidden"><CardContent className="p-0">
          <Header title="Fulfilment queue" subtitle="Vendor-scoped orders; vendors cannot see another vendor's commercial data."/>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead>
            <tbody className="divide-y">{orders.map((row)=><tr key={row.id}><td className="px-5 py-3 font-mono text-xs">{String(row.id).slice(0,8)}…</td><td className="px-5 py-3">{(row.items??[]).length}</td><td className="px-5 py-3">{formatMoney(row.total_minor,row.currency)}</td><td className="px-5 py-3"><Badge variant="outline">{row.status}</Badge></td><td className="px-5 py-3"><OrderAction status={row.status} onMove={(status)=>moveOrder(row.id,status)}/></td></tr>)}{!orders.length&&<tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No vendor orders yet.</td></tr>}</tbody>
          </table></div>
        </CardContent></Card>
      </>}
  </AppShell>;
}

function OrderAction({status,onMove}:{status:string;onMove:(s:"accepted"|"fulfilling"|"completed")=>void}){
  if(status==="paid")return <Button size="sm" variant="outline" onClick={()=>onMove("accepted")}>Accept</Button>;
  if(status==="accepted")return <Button size="sm" variant="outline" onClick={()=>onMove("fulfilling")}>Start fulfilment</Button>;
  if(status==="fulfilling")return <Button size="sm" variant="outline" onClick={()=>onMove("completed")}>Complete</Button>;
  return <span className="text-xs text-muted-foreground">No action</span>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Store;label:string;value:number|string}){return <Card><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 truncate font-display text-2xl font-semibold">{value}</div></CardContent></Card>;}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div className="border-b px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;}
function State({text,destructive=false}:{text:string;destructive?:boolean}){return <Card><CardContent className={`p-6 text-sm ${destructive?"text-destructive":"text-muted-foreground"}`}>{text}</CardContent></Card>;}
function errorText(error:unknown){return error instanceof Error?error.message:String(error);}
function formatMoney(minor:number|string,currency:string){const value=Number(minor??0)/100;try{return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"GBP"}).format(value);}catch{return `${currency??""} ${value.toFixed(2)}`;}}
