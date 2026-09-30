import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement } from "@/modules/platform/module-access";

const schema=z.object({
  tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
  locationId:z.string().uuid().optional().nullable(),
  start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getHospitalityIntelligence=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof schema>)=>schema.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"hospitality.intelligence"});
  const db=context.supabase as any;
  let q=db.from("epos_transaction_facts").select("id,location_id,business_date,channel,currency,gross_minor,discount_minor,refund_minor,net_minor,tax_minor,cogs_minor,item_count")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .gte("business_date",data.start).lte("business_date",data.end).limit(10000);
  if(data.locationId)q=q.eq("location_id",data.locationId);
  const{data:rows,error}=await q;if(error)throw new Error(error.message);
  const facts=rows??[];
  const currencies:string[]=[...new Set(facts.map((r:any)=>String(r.currency)))];
  const singleCurrency:string|null=currencies.length===1?(currencies[0]??null):null;
  const sum=(key:string)=>facts.reduce((a:number,r:any)=>a+Number(r[key]??0),0);
  const gross=sum("gross_minor"),discounts=sum("discount_minor"),refunds=sum("refund_minor"),net=sum("net_minor");
  const cogsKnown=facts.every((r:any)=>r.cogs_minor!==null&&r.cogs_minor!==undefined);
  const cogs=cogsKnown?sum("cogs_minor"):null;
  const contribution=cogs===null?null:net-cogs;
  const byChannel=Object.values(facts.reduce((acc:Record<string,{channel:string;transactions:number;netMinor:number}>,r:any)=>{
    const key=r.channel||"unknown";const row=acc[key]??={channel:key,transactions:0,netMinor:0};
    row.transactions+=1;row.netMinor+=Number(r.net_minor??0);return acc;
  },{} as Record<string,{channel:string;transactions:number;netMinor:number}>));
  const{data:insights}=await db.from("hospitality_insights").select("*")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .gte("period_start",data.start+"T00:00:00Z").lte("period_end",data.end+"T23:59:59Z")
    .order("created_at",{ascending:false}).limit(100);
  return{
    period:{start:data.start,end:data.end},
    currency:singleCurrency,
    mixedCurrency:currencies.length>1,
    transactions:facts.length,
    grossMinor:gross,discountMinor:discounts,refundMinor:refunds,netMinor:net,
    cogsMinor:cogs,contributionMinor:contribution,
    averageOrderMinor:facts.length?Math.round(net/facts.length):0,
    discountRate:gross?discounts/gross:null,
    refundRate:gross?refunds/gross:null,
    byChannel,
    insights:insights??[],
  };
});
