import { z } from "zod";
import { ModuleEventProcessorRegistry, type ClaimedModuleEvent } from "./event-worker.server";
import { parseStandardEventPayload } from "./standard-events";

async function admin(){const{ supabaseAdmin }=await import("@/integrations/supabase/client.server");return supabaseAdmin as any;}
function sourceProduct(job:ClaimedModuleEvent){return String(job.event.product_key??"unknown");}
function occurred(job:ClaimedModuleEvent){return String(job.event.occurred_at??new Date().toISOString());}

async function findPerson(db:any,job:ClaimedModuleEvent,ref:string){const{data}=await db.from("crm_people").select("id,company_id").eq("tenant_id",job.tenantId).eq("source_product_key",sourceProduct(job)).eq("external_ref",ref).maybeSingle();return data??null;}
async function findCompany(db:any,job:ClaimedModuleEvent,ref:string){const{data}=await db.from("crm_companies").select("id").eq("tenant_id",job.tenantId).eq("source_product_key",sourceProduct(job)).eq("external_ref",ref).maybeSingle();return data??null;}

async function crmProcessor(job:ClaimedModuleEvent){
 const db=await admin();const type=String(job.event.event_type);const payload=parseStandardEventPayload(type,job.event.payload??{});
 if(type==="customer.created"||type==="customer.updated"){const p=payload as z.infer<typeof import("./standard-events").customerPayload>;let companyId:string|null=null;if(p.companyRef){companyId=(await findCompany(db,job,p.companyRef))?.id??null;}const existing=await findPerson(db,job,p.customerRef);const values={tenant_id:job.tenantId,company_id:companyId,display_name:p.displayName,first_name:p.firstName??null,last_name:p.lastName??null,email:p.email??null,phone_e164:p.phoneE164??null,locale:p.locale??null,lifecycle_stage:"customer",marketing_consent:p.marketingConsent,source_product_key:sourceProduct(job),external_ref:p.customerRef,metadata:p.metadata};const result=existing?await db.from("crm_people").update(values).eq("id",existing.id):await db.from("crm_people").insert(values);if(result.error)throw new Error(result.error.message);return;}
 if(type==="company.created"||type==="company.updated"){const p:any=payload;const existing=await findCompany(db,job,p.companyRef);const values={tenant_id:job.tenantId,name:p.name,legal_name:p.legalName??null,website:p.website??null,industry:p.industry??null,status:"customer",source_product_key:sourceProduct(job),external_ref:p.companyRef,metadata:p.metadata};const result=existing?await db.from("crm_companies").update(values).eq("id",existing.id):await db.from("crm_companies").insert(values);if(result.error)throw new Error(result.error.message);return;}
 if(type==="lead.created"){const p:any=payload;const person=p.customerRef?await findPerson(db,job,p.customerRef):null;const company=p.companyRef?await findCompany(db,job,p.companyRef):null;const{data:existing}=await db.from("crm_leads").select("id").eq("tenant_id",job.tenantId).eq("source_product_key",sourceProduct(job)).eq("external_ref",p.leadRef).maybeSingle();const values={tenant_id:job.tenantId,person_id:person?.id??null,company_id:company?.id??null,title:p.title,source:p.source??sourceProduct(job),status:"new",score:p.score??null,source_product_key:sourceProduct(job),external_ref:p.leadRef,metadata:p.metadata};const result=existing?await db.from("crm_leads").update(values).eq("id",existing.id):await db.from("crm_leads").insert(values);if(result.error)throw new Error(result.error.message);return;}
 if(type==="order.completed"||type==="booking.completed"){const p:any=payload;if(!p.customerRef)return;const person=await findPerson(db,job,p.customerRef);if(!person)return;const{data:existing}=await db.from("crm_activities").select("id").eq("tenant_id",job.tenantId).eq("source_product_key",sourceProduct(job)).eq("external_ref",job.event.id).maybeSingle();if(existing)return;const{error}=await db.from("crm_activities").insert({tenant_id:job.tenantId,activity_type:"system_event",summary:type==="order.completed"?"Order completed":"Booking completed",person_id:person.id,company_id:person.company_id??null,source_product_key:sourceProduct(job),external_ref:job.event.id,metadata:{eventType:type,...p},occurred_at:occurred(job)});if(error)throw new Error(error.message);}
}

async function analyticsProcessor(job:ClaimedModuleEvent){
 const db=await admin();const type=String(job.event.event_type);let metric:string|null=null;let value:number|null=null;let currency:string|null=null;const p:any=parseStandardEventPayload(type,job.event.payload??{});
 if(type==="customer.created"){metric="customers.new";value=1;}else if(type==="order.completed"){metric="revenue.gross";value=p.amounts.grossMinor;currency=p.amounts.currency;}else if(type==="marketplace.order.completed"){metric="revenue.gross";value=Number(p.totalMinor??p.amounts?.grossMinor??0);currency=p.currency??p.amounts?.currency??null;}else if(type==="dispatch.job.completed"){metric="jobs.completed";value=1;}
 if(!metric||value===null)return;const d=new Date(occurred(job));const start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const end=new Date(start.getTime()+86400000);const{error}=await db.from("analytics_metric_points").upsert({tenant_id:job.tenantId,product_key:sourceProduct(job),metric_key:metric,period_start:start.toISOString(),period_end:end.toISOString(),value,currency,dimensions:{sourceProduct:sourceProduct(job)},calculated_at:new Date().toISOString(),source_event_id:job.event.id},{onConflict:"tenant_id,metric_key,source_event_id"});if(error)throw new Error(error.message);
}

async function financialProcessor(job:ClaimedModuleEvent){
 const db=await admin();const type=String(job.event.event_type);const p:any=parseStandardEventPayload(type,job.event.payload??{});let kind:string|null=null;let amount:number|null=null;let currency:string|null=null;let suffix="";
 if(type==="order.completed"){kind="revenue";amount=p.amounts.grossMinor;currency=p.amounts.currency;suffix="gross";}else if(type==="marketplace.order.completed"){kind="revenue";amount=Number(p.totalMinor??p.amounts?.grossMinor??0);currency=p.currency??p.amounts?.currency??null;suffix="gross";}else if(type==="refund.completed"||type==="marketplace.refund.completed"){kind="refund";amount=Number(p.amountMinor??p.totalMinor??0);currency=p.currency??null;suffix="refund";}
 if(!kind||amount===null||!currency)return;const day=occurred(job).slice(0,10);const{error}=await db.from("financial_actuals").upsert({tenant_id:job.tenantId,product_key:sourceProduct(job),period_start:day,period_end:day,category:kind,kind,amount_minor:amount,currency,source_ref:"event:"+job.event.id+":"+suffix,source_event_id:job.event.id,observed_at:occurred(job)},{onConflict:"tenant_id,source_ref"});if(error)throw new Error(error.message);
}



async function inventoryProcessor(job:ClaimedModuleEvent){
 const db=await admin();const type=String(job.event.event_type);const p:any=parseStandardEventPayload(type,job.event.payload??{});
 if(type!=="inventory.movement.recorded"&&type!=="hospitality.waste.recorded")return;
 if(!job.tenantProductId)throw new Error("Inventory event requires tenant product scope");
 const locationId=typeof job.event.location_id==="string"?job.event.location_id:null;
 if(!locationId)throw new Error("Inventory event requires tenant location scope");
 const movementType=type==="hospitality.waste.recorded"?"waste":p.movementType;
 const mappedType=movementType==="purchase"?"receipt":movementType;
 const{data:itemExisting}=await db.from("inventory_items").select("id").eq("tenant_id",job.tenantId)
  .eq("product_key",sourceProduct(job)).eq("external_ref",p.itemRef).maybeSingle();
 let itemId=itemExisting?.id??null;
 if(!itemId){
  const itemName=typeof p.metadata?.itemName==="string"?p.metadata.itemName:p.itemRef;
  const{data:item,error}=await db.from("inventory_items").insert({
   tenant_id:job.tenantId,tenant_product_id:job.tenantProductId,product_key:sourceProduct(job),
   external_ref:p.itemRef,sku:typeof p.metadata?.sku==="string"?p.metadata.sku:null,
   name:itemName,unit:p.unit??"each",track_stock:true,metadata:p.metadata??{}
  }).select("id").single();
  if(error||!item)throw new Error(error?.message??"Inventory item could not be projected");
  itemId=item.id;
 }
 const{data:locExisting}=await db.from("inventory_stock_locations").select("id").eq("tenant_id",job.tenantId)
  .eq("tenant_product_id",job.tenantProductId).eq("location_id",locationId).eq("location_kind","store").maybeSingle();
 let stockLocationId=locExisting?.id??null;
 if(!stockLocationId){
  const{data:tenantLocation}=await db.from("tenant_locations").select("name").eq("id",locationId).eq("tenant_id",job.tenantId).maybeSingle();
  const{data:stockLocation,error}=await db.from("inventory_stock_locations").insert({
   tenant_id:job.tenantId,tenant_product_id:job.tenantProductId,location_id:locationId,
   external_ref:"tenant-location:"+locationId,name:tenantLocation?.name??"Location stock",location_kind:"store"
  }).select("id").single();
  if(error||!stockLocation)throw new Error(error?.message??"Stock location could not be projected");
  stockLocationId=stockLocation.id;
 }
 const{error}=await db.rpc("record_inventory_movement",{
  _tenant:job.tenantId,_item:itemId,_location:stockLocationId,_type:mappedType,_quantity:p.quantity,
  _source_ref:p.sourceRef,_occurred_at:occurred(job),_unit_cost_minor:p.costMinor??null,
  _currency:p.currency??null,_metadata:p.metadata??{}
 });
 if(error)throw new Error(error.message);
}

async function hospitalityProcessor(job:ClaimedModuleEvent){
 const db=await admin();const type=String(job.event.event_type);const p:any=parseStandardEventPayload(type,job.event.payload??{});
 const tenantProductId=job.tenantProductId;
 const locationId=typeof job.event.location_id==="string"?job.event.location_id:null;
 if(!tenantProductId)throw new Error("Hospitality event requires tenant product scope");
 if((type==="epos.transaction.recorded"||type==="inventory.movement.recorded"||type==="hospitality.waste.recorded")&&!locationId)throw new Error("Hospitality event requires location scope");

 if(type==="epos.transaction.recorded"){
  const values={
   tenant_id:job.tenantId,tenant_product_id:tenantProductId,location_id:locationId,
   product_key:sourceProduct(job),source_transaction_ref:p.sourceTransactionRef,business_date:p.businessDate,
   occurred_at:occurred(job),channel:p.channel,order_type:p.orderType??null,currency:p.amounts.currency,
   gross_minor:p.amounts.grossMinor,discount_minor:p.amounts.discountMinor,refund_minor:p.amounts.refundMinor,
   net_minor:p.amounts.netMinor,tax_minor:p.amounts.taxMinor??null,cogs_minor:p.amounts.cogsMinor??null,
   item_count:p.itemCount,customer_ref:p.customerRef??null,metadata:p.metadata
  };
  const{data:fact,error}=await db.from("epos_transaction_facts").upsert(values,{onConflict:"tenant_id,product_key,source_transaction_ref"}).select("id").single();
  if(error||!fact)throw new Error(error?.message??"EPOS transaction fact failed");
  if(Array.isArray(p.items)){
   for(const item of p.items){
    const{error:itemError}=await db.from("epos_item_facts").upsert({
     tenant_id:job.tenantId,transaction_id:fact.id,line_ref:item.lineRef,item_ref:item.itemRef,item_name:item.itemName,
     category_ref:item.categoryRef??null,quantity:item.quantity,gross_minor:item.grossMinor,
     discount_minor:item.discountMinor,refund_minor:item.refundMinor,net_minor:item.netMinor,
     estimated_cogs_minor:item.estimatedCogsMinor??null,modifier_refs:item.modifierRefs
    },{onConflict:"transaction_id,line_ref"});
    if(itemError)throw new Error(itemError.message);
   }
  }
  return;
 }

 if(type==="inventory.movement.recorded"||type==="hospitality.waste.recorded"){
  const movementType=type==="hospitality.waste.recorded"?"waste":p.movementType;
  const{error}=await db.from("inventory_movement_facts").upsert({
   tenant_id:job.tenantId,tenant_product_id:tenantProductId,location_id:locationId,
   item_ref:p.itemRef,movement_type:movementType,quantity:p.quantity,unit:p.unit??null,
   cost_minor:p.costMinor??null,currency:p.currency??null,occurred_at:occurred(job),
   source_ref:p.sourceRef
  },{onConflict:"tenant_id,source_ref"});
  if(error)throw new Error(error.message);
 }
}

export function createDefaultModuleProcessorRegistry(){return new ModuleEventProcessorRegistry().register("crm.core",crmProcessor).register("analytics.core",analyticsProcessor).register("financials.core",financialProcessor).register("inventory.core",inventoryProcessor).register("hospitality.intelligence",hospitalityProcessor);}