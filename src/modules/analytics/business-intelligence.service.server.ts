import {z} from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

const schema=z.object({
  operation:z.literal("summary"),
  tenantId:z.string().uuid(),
  productKey:z.string().min(2).max(80),
  locationId:z.string().uuid().nullable().optional(),
  days:z.number().int().min(1).max(90).default(7),
}).strict();

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(2),
    brandIds:z.array(z.string().uuid()).optional(),
    locationIds:z.array(z.string().uuid()).optional(),
    capabilities:z.array(z.string()),
  })).parse(row.scopes);
  return{
    db,
    credential:{
      id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,
      expiresAt:row.expires_at,scopes,
    } as ServiceCredentialRecord,
  };
}

function obj(value:unknown){
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function number(value:unknown){
  const n=Number(value);return Number.isFinite(n)?n:0;
}

export async function serveBusinessIntelligenceSummary(request:Request){
  try{
    const input=schema.parse(await request.json());
    const{db,credential}=await authenticate(request);
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,locationId:input.locationId??undefined,
      capability:"intelligence.read",
    });

    const cutoff=new Date(Date.now()-input.days*86400000).toISOString();
    let query=db.from("platform_events")
      .select("event_type,payload,occurred_at,location_id")
      .eq("tenant_id",input.tenantId)
      .eq("product_key",input.productKey)
      .gte("occurred_at",cutoff)
      .order("occurred_at",{ascending:false})
      .limit(5000);
    if(input.locationId)query=query.eq("location_id",input.locationId);
    const{data:events,error}=await query;
    if(error)throw new Error(error.message);

    let created=0,cancelled=0,ready=0,totalMinor=0;
    const sources=new Map<string,{orders:number,revenueMinor:number}>();
    const hourly=new Array(24).fill(0) as number[];
    for(const event of events??[]){
      const type=String(event.event_type||"");
      const payload=obj(event.payload);
      if(type==="dishbee.order.created"){
        created++;
        const amount=number(payload["totalPence"]??payload["totalMinor"]);
        totalMinor+=amount;
        const source=String(payload["source"]??"direct");
        const current=sources.get(source)??{orders:0,revenueMinor:0};
        current.orders++;current.revenueMinor+=amount;sources.set(source,current);
        const date=new Date(String(payload["createdAt"]??event.occurred_at));
        if(Number.isFinite(date.getTime()))hourly[date.getHours()]++;
      }
      if(type.includes("cancel"))cancelled++;
      if(type.includes(".ready")||type.includes(".fulfilled")||type.includes(".completed"))ready++;
    }

    const sourceRows=[...sources.entries()]
      .map(([source,value])=>({source,...value}))
      .sort((a,b)=>b.revenueMinor-a.revenueMinor);
    const busiestHour=hourly.reduce((best,count,index)=>count>hourly[best]?index:best,0);
    const averageOrderMinor=created?Math.round(totalMinor/created):0;
    const cancellationRate=created?Math.round((cancelled/created)*1000)/10:0;
    const recommendations:string[]=[];
    if(created===0)recommendations.push("No Dishbee order events were recorded in this period.");
    if(cancellationRate>=5)recommendations.push("Cancellation rate is elevated; review unavailable items, prep-time promises and channel capacity.");
    if(sourceRows.length>1){
      const top=sourceRows[0];
      const share=totalMinor?Math.round(top.revenueMinor/totalMinor*100):0;
      if(share>=60)recommendations.push("Revenue is concentrated in "+top.source+"; compare contribution margin and customer-acquisition dependency across channels.");
    }
    if(created>=10)recommendations.push("Peak order hour is around "+String(busiestHour).padStart(2,"0")+":00; compare staffing and KDS throughput around this period.");
    if(averageOrderMinor>0)recommendations.push("Average recorded order value is £"+(averageOrderMinor/100).toFixed(2)+"; use menu pairing and bundles to test incremental basket growth.");

    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return reply({
      brandSurface:"Dishbee Buzz",
      periodDays:input.days,
      generatedAt:new Date().toISOString(),
      metrics:{
        orders:created,
        recordedRevenueMinor:totalMinor,
        averageOrderMinor,
        cancelledOrders:cancelled,
        cancellationRate,
        readyOrCompletedEvents:ready,
        busiestHour,
      },
      sources:sourceRows,
      hourlyOrders:hourly,
      recommendations,
      dataNote:"Summary is derived from tenant-scoped operational events. Provider settlement and accounting data remain authoritative for financial reporting.",
    });
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid business-intelligence request"},422);
    const message=error instanceof Error?error.message:"Business-intelligence request refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
