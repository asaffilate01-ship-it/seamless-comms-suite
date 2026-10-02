import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo,useState } from "react";
import { AppShell,StatusBadge } from "@/components/app/shell";
import { Card,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { getTenantControlPlane } from "@/lib/control-plane.functions";
import { createManualOrderIntake,listOrderChannels,listOrderIntake,saveOrderChannel } from "@/modules/connect/order-intake.functions";
import { PhoneCall,Plus,RefreshCw,ShoppingBasket } from "lucide-react";
import { toast } from "sonner";

export const Route=createFileRoute("/_authenticated/app/order-intake")({component:OrderIntake,head:()=>({meta:[{title:"Assisted Ordering — Omniqora"},{name:"robots",content:"noindex"}]})});

function OrderIntake(){
 const tenant=useTenant();const tenantId=tenant.tenantId??"";
 const detailFn=useServerFn(getTenantControlPlane),listFn=useServerFn(listOrderIntake),channelsFn=useServerFn(listOrderChannels);
 const createFn=useServerFn(createManualOrderIntake),saveChannelFn=useServerFn(saveOrderChannel);
 const detail=useQuery({queryKey:["order-intake-tenant",tenantId],queryFn:()=>detailFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const products=(detail.data?.products??[]).filter(p=>!["cancelled","failed"].includes(p.status));
 const [productKey,setProductKey]=useState("dishbee");
 const orders=useQuery({queryKey:["order-intake",tenantId,productKey],queryFn:()=>listFn({data:{tenantId,productKey}}),enabled:!!tenantId&&!!productKey,retry:false});
 const channels=useQuery({queryKey:["order-channels",tenantId],queryFn:()=>channelsFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const [customerName,setCustomerName]=useState(""),[customerPhone,setCustomerPhone]=useState("");
 const [itemName,setItemName]=useState(""),[qty,setQty]=useState("1"),[price,setPrice]=useState("");
 const [items,setItems]=useState<Array<{name:string;qty:number;unitMinor:number}>>([]);
 const [channel,setChannel]=useState("manual"),[address,setAddress]=useState(""),[forward,setForward]=useState("");
 const [ai,setAi]=useState(false),[human,setHuman]=useState(true);
 const total=useMemo(()=>items.reduce((n,i)=>n+i.qty*i.unitMinor,0),[items]);
 async function refresh(){await Promise.all([orders.refetch(),channels.refetch(),detail.refetch()]);}
 async function create(){
  try{
   const idempotency="staff-"+crypto.randomUUID();
   await createFn({data:{tenantId,productKey,brandId:null,locationId:null,channel:channel as any,customerPhone:customerPhone||null,customerName:customerName||null,items,currency:"GBP",idempotencyKey:idempotency}});
   toast.success("Order intake session created");setItems([]);setCustomerName("");setCustomerPhone("");await orders.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:"Unable to create intake");}
 }
 async function addChannel(){
  try{
   await saveChannelFn({data:{tenantId,productKey,brandId:null,locationId:null,channel:channel as any,provider:"twilio",address,aiReceptionEnabled:ai,humanHandoffEnabled:human,greeting:null,forwardTo:forward||null}});
   toast.success("Ordering channel saved");setAddress("");await channels.refetch();
  }catch(e){toast.error(e instanceof Error?e.message:"Unable to save channel");}
 }
 return <AppShell title="Assisted Ordering" subtitle="Phone, WhatsApp and staff-entered orders with payment state and controlled Dishbee handoff." actions={<Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
  <div className="grid gap-4 md:grid-cols-4">
   <Metric label="Draft / payment" value={String((orders.data??[]).filter((o:any)=>["draft","awaiting_payment"].includes(o.status)).length)}/>
   <Metric label="Ready for Dishbee" value={String((orders.data??[]).filter((o:any)=>o.status==="handoff_ready").length)}/>
   <Metric label="Submitted" value={String((orders.data??[]).filter((o:any)=>o.status==="submitted").length)}/>
   <Metric label="Configured channels" value={String((channels.data??[]).length)}/>
  </div>
  <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
   <div className="space-y-6">
    <Card><CardContent className="p-5"><div className="flex items-center gap-2"><ShoppingBasket className="h-4 w-4"/><h2 className="font-semibold">New assisted order</h2></div>
     <select className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm" value={productKey} onChange={e=>setProductKey(e.target.value)}>{products.map(p=><option key={p.product_key}>{p.product_key}</option>)}</select>
     <div className="mt-3 grid grid-cols-2 gap-2"><Input placeholder="Customer name" value={customerName} onChange={e=>setCustomerName(e.target.value)}/><Input placeholder="+447..." value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></div>
     <div className="mt-3 grid grid-cols-[1fr_80px_100px] gap-2"><Input placeholder="Item" value={itemName} onChange={e=>setItemName(e.target.value)}/><Input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/><Input type="number" min="0" step=".01" placeholder="£" value={price} onChange={e=>setPrice(e.target.value)}/></div>
     <Button className="mt-2" variant="outline" disabled={!itemName||!price} onClick={()=>{setItems(v=>[...v,{name:itemName,qty:Number(qty||1),unitMinor:Math.round(Number(price)*100)}]);setItemName("");setQty("1");setPrice("");}}><Plus className="mr-2 h-4 w-4"/>Add item</Button>
     <div className="mt-3 space-y-2">{items.map((i,n)=><div key={n} className="flex justify-between rounded bg-muted p-2 text-sm"><span>{i.qty} × {i.name}</span><span>{money(i.qty*i.unitMinor)}</span></div>)}</div>
     <div className="mt-3 flex justify-between font-semibold"><span>Total</span><span>{money(total)}</span></div>
     <Button className="mt-3 w-full" disabled={!items.length||!tenantId} onClick={create}>Create intake session</Button>
    </CardContent></Card>
    <Card><CardContent className="p-5"><div className="flex items-center gap-2"><PhoneCall className="h-4 w-4"/><h2 className="font-semibold">Twilio ordering line</h2></div>
     <select className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm" value={channel} onChange={e=>setChannel(e.target.value)}><option value="voice">voice</option><option value="whatsapp">whatsapp</option><option value="manual">manual</option></select>
     <Input className="mt-3" placeholder="Twilio To address / number" value={address} onChange={e=>setAddress(e.target.value)}/>
     <Input className="mt-3" placeholder="Forward-to number (optional)" value={forward} onChange={e=>setForward(e.target.value)}/>
     <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={ai} onChange={e=>setAi(e.target.checked)}/>AI reception enabled</label>
     <label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={human} onChange={e=>setHuman(e.target.checked)}/>Human handoff allowed</label>
     <Button className="mt-3" disabled={!address||!tenantId} onClick={addChannel}>Save line</Button>
    </CardContent></Card>
   </div>
   <div className="space-y-6">
    <Card><CardContent className="p-0"><div className="border-b p-5"><h2 className="font-semibold">Order intake queue</h2><p className="text-xs text-muted-foreground">Paid orders become handoff-ready; Dishbee claims and acknowledges them using its service credential.</p></div>
     <div className="divide-y">{(orders.data??[]).map((o:any)=><div key={o.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{o.customer_name||o.customer_phone||"Customer"}</b><p className="text-xs text-muted-foreground">{o.channel} · {o.product_key} · {new Date(o.created_at).toLocaleString()}</p></div><div className="flex gap-2"><Badge variant="outline">{money(o.total_minor??0)}</Badge><StatusBadge status={o.status}/></div></div>{o.target_order_id&&<p className="mt-2 text-xs">Dishbee order: <code>{o.target_order_id}</code></p>}</div>)}{!(orders.data??[]).length&&<p className="p-5 text-sm text-muted-foreground">No intake sessions yet.</p>}</div>
    </CardContent></Card>
    <Card><CardContent className="p-0"><div className="border-b p-5"><h2 className="font-semibold">Configured lines</h2></div><div className="divide-y">{(channels.data??[]).map((c:any)=><div key={c.id} className="flex items-center justify-between p-4 text-sm"><div><b>{c.address}</b><p className="text-xs text-muted-foreground">{c.provider} · {c.channel} · {c.product_key}</p></div><div className="flex gap-2">{c.ai_reception_enabled&&<Badge variant="outline">AI</Badge>}{c.human_handoff_enabled&&<Badge variant="outline">Human</Badge>}</div></div>)}</div></CardContent></Card>
   </div>
  </div>
 </AppShell>;
}
function Metric({label,value}:{label:string;value:string}){return <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-semibold">{value}</p></CardContent></Card>}
function money(minor:number){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(minor/100)}
