import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

function response(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

const phone=z.string().regex(/^\+[1-9][0-9]{6,14}$/);
const base=z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),
  tenantProductId:z.string().uuid(),locationId:z.string().uuid().optional().nullable()
});

const receiptSchema=z.record(z.string(),z.unknown()).default({});

const requestSchema=z.discriminatedUnion("operation",[
  base.extend({
    operation:z.literal("receive"),
    kind:z.enum(["message","order","booking"]),
    channel:z.enum(["phone","whatsapp","web","app","api"]),
    callerNumber:phone.optional().nullable(),
    crmPersonId:z.string().uuid().optional().nullable(),
    customerName:z.string().trim().min(1).max(200),
    contact:z.string().max(300).optional().nullable(),
    summary:z.string().trim().min(1).max(12000),
    externalKey:z.string().min(8).max(160),
    handoffNote:z.string().max(4000).optional().nullable(),
    metadata:z.record(z.string(),z.unknown()).default({})
  }),
  base.extend({
    operation:z.literal("queue.get"),
    limit:z.number().int().min(1).max(100).default(100)
  }),
  base.extend({
    operation:z.literal("customer.lookup"),
    phone
  }),
  base.extend({
    operation:z.literal("acknowledge"),
    requestId:z.string().uuid(),
    status:z.enum(["accepted","confirmed","delivered","failed"]),
    sourceRef:z.string().max(240).optional().nullable(),
    receipt:receiptSchema
  })
]);

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),
    tenantProductId:z.string().uuid().optional().nullable(),
    locationIds:z.array(z.string().uuid()).optional(),
    capabilities:z.array(z.string().min(1))
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes
  };
  return{db,credential};
}

async function effectiveSettings(db:any,tenantProductId:string,locationId?:string|null){
  if(locationId){
    const{data:exact}=await db.from("reception_settings").select("*")
      .eq("tenant_product_id",tenantProductId).eq("location_id",locationId).eq("enabled",true).maybeSingle();
    if(exact)return exact;
  }
  const{data:fallback}=await db.from("reception_settings").select("*")
    .eq("tenant_product_id",tenantProductId).is("location_id",null).eq("enabled",true).maybeSingle();
  return fallback??null;
}

async function emit(db:any,input:any,type:string,payload:Record<string,unknown>){
  const id=randomUUID();
  const{error}=await db.from("platform_events").insert({
    id,tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,product_key:input.productKey,
    event_type:type,event_version:1,occurred_at:new Date().toISOString(),environment:"production",
    subject_type:"reception_request",subject_id:input.requestId??input.id,
    correlation_id:input.requestId??input.id,causation_id:null,
    idempotency_key:type+":"+(input.requestId??input.id)+":"+id,
    data_classification:"confidential",payload
  });
  if(error)throw new Error(error.message);
}

function canonicalReceipt(status:string,kind:string,receipt:Record<string,unknown>){
  if(status==="accepted"){
    if(kind!=="order")throw new Error("Accepted acknowledgement is only valid for orders");
    if(receipt.accepted!==true||receipt.priceValidated!==true||receipt.availabilityValidated!==true){
      throw new Error("Accepted order requires source-verified acceptance, price and availability");
    }
    const paymentState=String(receipt.paymentState??"");
    if(!["paid","pay_later_authorized","not_required"].includes(paymentState)){
      throw new Error("Accepted order requires a permitted payment state");
    }
    return{accepted:true,priceValidated:true,availabilityValidated:true,paymentState};
  }
  if(status==="delivered"){
    if(kind!=="order"||receipt.kdsAcknowledged!==true){
      throw new Error("Delivered order requires KDS acknowledgement");
    }
    return{kdsAcknowledged:true};
  }
  if(status==="confirmed"){
    if(kind!=="booking"||receipt.slotReserved!==true){
      throw new Error("Confirmed booking requires source slot reservation");
    }
    return{slotReserved:true};
  }
  const reason=String(receipt.reason??"").trim();
  if(!reason)throw new Error("Failed acknowledgement requires a reason");
  return{reason:reason.slice(0,1000)};
}

export async function serveReceptionService(request:Request){
  try{
    const raw=await request.text();if(raw.length>262144)return response({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return response({error:"Invalid JSON"},400);}
    const input=requestSchema.parse(json);
    const{db,credential}=await authenticate(request);
    const capability=input.operation==="receive"?"reception.write":
      input.operation==="acknowledge"?"reception.acknowledge":"reception.read";
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,
      locationId:input.locationId,capability
    });

    const{data:tp}=await db.from("tenant_products").select("id,status,product_key").eq("id",input.tenantProductId)
      .eq("tenant_id",input.tenantId).maybeSingle();
    if(!tp||tp.status!=="active"||tp.product_key!==input.productKey)return response({error:"Active tenant product required"},403);

    const{data:grant}=await db.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
      .eq("module_key","reception.core").eq("enabled",true).maybeSingle();
    const now=Date.now();
    if(!grant|| (grant.starts_at&&Date.parse(grant.starts_at)>now) || (grant.ends_at&&Date.parse(grant.ends_at)<=now)){
      return response({error:"Reception entitlement required"},403);
    }

    if(input.operation==="customer.lookup"){
      const{data:people,error}=await db.from("crm_people")
        .select("id,display_name,first_name,last_name,email,phone_e164,company_id,lifecycle_stage,source_product_key,external_ref")
        .eq("tenant_id",input.tenantId).eq("phone_e164",input.phone).limit(20);
      if(error)throw new Error(error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return response({
        status:(people??[]).length===0?"unknown":(people??[]).length===1?"matched":"ambiguous",
        phone:input.phone,matches:people??[],identityVerified:false
      });
    }

    const settings=await effectiveSettings(db,input.tenantProductId,input.locationId);
    if(!settings)return response({error:"Reception is not enabled for this product/location"},409);

    if(input.operation==="receive"){
      if(input.kind==="order"&&!settings.allow_order_intake)return response({error:"Order intake is not enabled"},409);
      if(input.kind==="booking"&&!settings.allow_booking_intake)return response({error:"Booking intake is not enabled"},409);
      let crmPersonId=input.crmPersonId??null;
      if(crmPersonId){
        const{data:person}=await db.from("crm_people").select("id,phone_e164")
          .eq("id",crmPersonId).eq("tenant_id",input.tenantId).maybeSingle();
        if(!person)return response({error:"CRM customer not found"},404);
        if(input.callerNumber&&person.phone_e164&&person.phone_e164!==input.callerNumber){
          return response({error:"Caller number does not match selected CRM customer"},409);
        }
      }else if(input.callerNumber){
        const{data:matches}=await db.from("crm_people").select("id").eq("tenant_id",input.tenantId)
          .eq("phone_e164",input.callerNumber).limit(2);
        if(matches?.length===1)crmPersonId=matches[0].id;
      }
      const{data:existing}=await db.from("reception_requests").select("*")
        .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
        .eq("external_key",input.externalKey).maybeSingle();
      if(existing)return response({item:existing,idempotent:true});
      const{data:item,error}=await db.from("reception_requests").insert({
        tenant_id:input.tenantId,tenant_product_id:input.tenantProductId,location_id:input.locationId??null,
        kind:input.kind,channel:input.channel,crm_person_id:crmPersonId,caller_number:input.callerNumber??null,
        customer_name:input.customerName,contact:input.contact??null,summary:input.summary,status:"new",
        handoff_note:input.handoffNote??null,receipt:{},external_key:input.externalKey,metadata:input.metadata
      }).select("*").single();
      if(error||!item)throw new Error(error?.message??"Reception request could not be recorded");
      await emit(db,{...input,id:item.id},"reception.received",{kind:item.kind,channel:item.channel,locationId:item.location_id});
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return response({item},202);
    }

    if(input.operation==="queue.get"){
      const{data:items,error}=await db.from("reception_requests").select("*")
        .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
        .in("status",["queued","accepted"]).order("created_at",{ascending:true}).limit(input.limit);
      if(error)throw new Error(error.message);
      const{data:members}=await db.from("tenant_members").select("user_id,role").eq("tenant_id",input.tenantId);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return response({
        items:items??[],
        settings:{
          instructions:settings.instructions,
          businessHours:settings.business_hours,
          escalationUserId:settings.escalation_user_id,
          escalationPhone:settings.escalation_phone,
          defaultLocale:settings.default_locale
        },
        team:(members??[]).map((m:any)=>({id:m.user_id,role:m.role}))
      });
    }

    const{data:item}=await db.from("reception_requests").select("*").eq("id",input.requestId)
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).maybeSingle();
    if(!item)return response({error:"Reception request not found"},404);

    const clean=canonicalReceipt(input.status,item.kind,input.receipt);
    const sourceRef=input.sourceRef?.trim()||null;
    if(["accepted","confirmed","delivered"].includes(input.status)&&!sourceRef){
      return response({error:"Source reference is required"},422);
    }
    if(item.source_ref&&sourceRef&&item.source_ref!==sourceRef){
      return response({error:"Source reference conflicts with saved acknowledgement"},409);
    }

    if(item.status===input.status || (item.status==="delivered"&&input.status==="accepted")){
      const saved=item.receipt??{};
      const same=Object.entries(clean).every(([k,v])=>saved[k]===v);
      if((!sourceRef||item.source_ref===sourceRef)&&same)return response({item,idempotent:true});
      return response({error:"Acknowledgement conflicts with saved state"},409);
    }

    const allowed:Record<string,string[]>={
      queued:["accepted","confirmed","failed"],
      accepted:["delivered","failed"]
    };
    if(!(allowed[item.status]??[]).includes(input.status)){
      return response({error:"Reception status transition not allowed"},409);
    }
    if(input.status==="accepted"&&item.kind!=="order")return response({error:"Only an order can be accepted"},409);
    if(input.status==="delivered"&&item.kind!=="order")return response({error:"Only an order can be delivered"},409);
    if(input.status==="confirmed"&&item.kind!=="booking")return response({error:"Only a booking can be confirmed"},409);

    const merged={...(item.receipt??{}),...clean};
    const{data:updated,error}=await db.from("reception_requests").update({
      status:input.status,source_ref:sourceRef??item.source_ref,receipt:merged,
      revision:Number(item.revision??1)+1
    }).eq("id",item.id).eq("revision",item.revision).select("*").single();
    if(error||!updated)return response({error:"Reception request changed; reconcile and retry"},409);
    await emit(db,{...input,requestId:item.id},"reception."+input.status,{
      kind:item.kind,sourceRef:updated.source_ref,receipt:clean
    });
    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return response({item:updated},202);
  }catch(error){
    if(error instanceof z.ZodError)return response({error:"Invalid Reception contract"},422);
    const message=error instanceof Error?error.message:"Reception service refused";
    if(/credential|scope|authorization|expired/i.test(message))return response({error:message},403);
    return response({error:message},503);
  }
}
