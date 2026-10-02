import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid=z.string().uuid();
const listSchema=z.object({tenantId:uuid,productKey:z.string().min(2).max(80).optional()});
export const listOrderIntake=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof listSchema>)=>listSchema.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 let q=db.from("order_intake_sessions").select("*,payments:order_payment_requests(*)").eq("tenant_id",data.tenantId);
 if(data.productKey)q=q.eq("product_key",data.productKey);
 const{data:rows,error}=await q.order("created_at",{ascending:false}).limit(200);
 if(error)throw new Error(error.message);return rows??[];
});

export const listOrderChannels=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string})=>z.object({tenantId:uuid}).parse(i))
.handler(async({context,data})=>{
 const{data:rows,error}=await (context.supabase as any).from("order_intake_channels").select("*").eq("tenant_id",data.tenantId).order("channel");
 if(error)throw new Error(error.message);return rows??[];
});

const createSchema=z.object({
 tenantId:uuid,productKey:z.string().min(2).max(80),brandId:uuid.nullish(),locationId:uuid.nullish(),
 channel:z.enum(["voice","whatsapp","sms","manual","webchat"]).default("manual"),
 customerPhone:z.string().max(40).nullish(),customerName:z.string().max(200).nullish(),
 items:z.array(z.object({name:z.string().min(1).max(200),sku:z.string().max(100).optional(),qty:z.number().int().min(1).max(100),unitMinor:z.number().int().min(0).max(10000000)})).min(1).max(200),
 currency:z.string().regex(/^[A-Z]{3}$/).default("GBP"),idempotencyKey:z.string().min(8).max(160)
});
export const createManualOrderIntake=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof createSchema>)=>createSchema.parse(i))
.handler(async({context,data})=>{
 const total=data.items.reduce((n,item)=>n+item.qty*item.unitMinor,0);
 const order={items:data.items.map(i=>({name:i.name,sku:i.sku??null,qty:i.qty,unit_minor:i.unitMinor})),total_minor:total,currency:data.currency};
 const r=await (context.supabase as any).rpc("order_create_manual_session",{
  _tenant:data.tenantId,_product:data.productKey,_brand:data.brandId??null,_location:data.locationId??null,_channel:data.channel,
  _customer_phone:data.customerPhone??null,_customer_name:data.customerName??null,_order:order,_idempotency:data.idempotencyKey,_expires_minutes:120
 });
 if(r.error)throw new Error(r.error.message);return{sessionId:r.data as string,totalMinor:total};
});

const channelSchema=z.object({
 tenantId:uuid,productKey:z.string().min(2).max(80),brandId:uuid.nullish(),locationId:uuid.nullish(),
 channel:z.enum(["voice","whatsapp","sms","manual","webchat"]),provider:z.string().min(2).max(80).default("twilio"),
 address:z.string().min(2).max(200),aiReceptionEnabled:z.boolean().default(false),humanHandoffEnabled:z.boolean().default(true),
 greeting:z.string().max(1000).nullish(),forwardTo:z.string().max(100).nullish()
});
export const saveOrderChannel=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof channelSchema>)=>channelSchema.parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const values={tenant_id:data.tenantId,product_key:data.productKey,brand_id:data.brandId??null,location_id:data.locationId??null,
  channel:data.channel,provider:data.provider,address:data.address,enabled:true,ai_reception_enabled:data.aiReceptionEnabled,
  human_handoff_enabled:data.humanHandoffEnabled,greeting:data.greeting??null,routing:{forward_to:data.forwardTo??null}};
 const{data:row,error}=await db.from("order_intake_channels").upsert(values,{onConflict:"provider,channel,address"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});
