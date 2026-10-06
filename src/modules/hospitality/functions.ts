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

type FactRow={
  location_id:string|null;
  business_date:string;
  channel:string|null;
  currency:string;
  gross_minor:number|string|null;
  discount_minor:number|string|null;
  refund_minor:number|string|null;
  net_minor:number|string|null;
  tax_minor:number|string|null;
  cogs_minor:number|string|null;
  item_count:number|string|null;
};

type ChannelSummary={channel:string;transactions:number;netMinor:number};

export const getHospitalityIntelligence=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof schema>)=>schema.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"hospitality.intelligence"});
  const db=context.supabase as any;
  let q=db.from("epos_transaction_facts")
    .select("location_id,business_date,channel,currency,gross_minor,discount_minor,refund_minor,net_minor,tax_minor,cogs_minor,item_count")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .gte("business_date",data.start).lte("business_date",data.end).limit(10000);
  if(data.locationId)q=q.eq("location_id",data.locationId);
  const{data:rows,error}=await q;
  if(error)throw new Error(error.message);

  const facts:FactRow[]=Array.isArray(rows)?rows as FactRow[]:[];
  const currencyValues:string[]=facts.map((row)=>String(row.currency));
  const currencies:string[]=Array.from(new Set<string>(currencyValues));
  const singleCurrency:string|null=currencies.length===1?(currencies[0]??null):null;

  const sum=(key:"gross_minor"|"discount_minor"|"refund_minor"|"net_minor"|"cogs_minor")=>
    facts.reduce((total,row)=>total+Number(row[key]??0),0);

  const gross=sum("gross_minor");
  const discounts=sum("discount_minor");
  const refunds=sum("refund_minor");
  const net=sum("net_minor");
  const cogsKnown=facts.every((row)=>row.cogs_minor!==null&&row.cogs_minor!==undefined);
  const cogs:number|null=cogsKnown?sum("cogs_minor"):null;
  const contribution:number|null=cogs===null?null:net-cogs;

  const channelMap:Record<string,ChannelSummary>={};
  for(const row of facts){
    const key=String(row.channel??"unknown");
    const current=channelMap[key]??{channel:key,transactions:0,netMinor:0};
    current.transactions+=1;
    current.netMinor+=Number(row.net_minor??0);
    channelMap[key]=current;
  }
  const byChannel:ChannelSummary[]=Object.keys(channelMap).sort().map((key)=>channelMap[key]!);

  const{data:insightRows,error:insightError}=await db.from("hospitality_insights")
    .select("id,location_id,period_start,period_end,insight_kind,title,summary,evidence_refs,metrics,model_run_id,status,created_at")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .gte("period_start",data.start+"T00:00:00Z").lte("period_end",data.end+"T23:59:59Z")
    .order("created_at",{ascending:false}).limit(100);
  if(insightError)throw new Error(insightError.message);

  const insights=(Array.isArray(insightRows)?insightRows:[]).map((row:any)=>{
    const evidenceRefs:string[]=Array.isArray(row.evidence_refs)?row.evidence_refs.map((v:unknown)=>String(v)):[];
    const metrics:Record<string,string|number|boolean|null>={};
    if(row.metrics&&typeof row.metrics==="object"&&!Array.isArray(row.metrics)){
      for(const [key,value] of Object.entries(row.metrics as Record<string,unknown>)){
        if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="boolean")metrics[key]=value;
      }
    }
    return{
      id:String(row.id),
      locationId:row.location_id?String(row.location_id):null,
      periodStart:String(row.period_start),
      periodEnd:String(row.period_end),
      kind:String(row.insight_kind),
      title:String(row.title),
      summary:String(row.summary),
      evidenceRefs,
      metrics,
      modelRunId:row.model_run_id?String(row.model_run_id):null,
      status:String(row.status),
      createdAt:String(row.created_at),
    };
  });

  return{
    period:{start:data.start,end:data.end},
    currency:singleCurrency,
    currencies,
    mixedCurrency:currencies.length>1,
    transactions:facts.length,
    grossMinor:gross,
    discountMinor:discounts,
    refundMinor:refunds,
    netMinor:net,
    cogsMinor:cogs,
    contributionMinor:contribution,
    averageOrderMinor:facts.length?Math.round(net/facts.length):0,
    discountRate:gross?discounts/gross:null,
    refundRate:gross?refunds/gross:null,
    byChannel,
    insights,
  };
});
