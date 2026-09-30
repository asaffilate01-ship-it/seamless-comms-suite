import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole, requireAdminTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

const queueSchema=scope.extend({
 name:z.string().min(2).max(160),emailAlias:z.string().email().optional().nullable(),
 defaultPriority:z.enum(["low","normal","high","urgent"]).default("normal"),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const createSupportQueue=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof queueSchema>)=>queueSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{...data,moduleKey:"support.core"});requireAdminTenantRole(access.role);
 const db=context.supabase as any;const{data:row,error}=await db.from("support_queues").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,name:data.name,email_alias:data.emailAlias??null,
  default_priority:data.defaultPriority,active:true,metadata:data.metadata
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Support queue could not be created");return row;
});

const ticketSchema=scope.extend({
 title:z.string().min(2).max(240),priority:z.enum(["low","normal","high","urgent"]).default("normal"),
 conversationId:z.string().uuid().optional().nullable(),queueId:z.string().uuid().optional().nullable(),
 category:z.string().max(120).optional().nullable(),
 channel:z.enum(["whatsapp","sms","email","voice","web","app","api","internal"]).default("internal"),
 customerRef:z.string().max(200).optional().nullable(),sourceProductKey:z.string().max(80).optional().nullable(),
 externalRef:z.string().max(200).optional().nullable(),tags:z.array(z.string().max(80)).max(100).default([])
});
export const createSupportTicket=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof ticketSchema>)=>ticketSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"support.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 let firstDue:string|null=null,resolutionDue:string|null=null;
 const{data:sla}=await db.from("support_sla_policies").select("first_response_minutes,resolution_minutes")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).eq("priority",data.priority).eq("active",true).limit(1).maybeSingle();
 if(sla){firstDue=new Date(Date.now()+Number(sla.first_response_minutes)*60000).toISOString();resolutionDue=new Date(Date.now()+Number(sla.resolution_minutes)*60000).toISOString();}
 const{data:ticket,error}=await db.from("cases").insert({
  tenant_id:data.tenantId,conversation_id:data.conversationId??null,title:data.title,status:"new",
  priority:data.priority,assignee:context.userId
 }).select("id").single();
 if(error||!ticket)throw new Error(error?.message??"Support ticket could not be created");
 const{error:metaError}=await db.from("support_ticket_metadata").insert({
  case_id:ticket.id,tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,queue_id:data.queueId??null,
  category:data.category??null,channel:data.channel,customer_ref:data.customerRef??null,
  first_response_due_at:firstDue,resolution_due_at:resolutionDue,tags:data.tags,
  source_product_key:data.sourceProductKey??null,external_ref:data.externalRef??null
 });
 if(metaError)throw new Error(metaError.message);return{id:ticket.id};
});

export const listSupportTickets=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{queueId?:string|null;status?:string|null})=>
 scope.extend({queueId:z.string().uuid().optional().nullable(),status:z.string().max(40).optional().nullable()}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"support.core"});
 const db=context.supabase as any;let q=db.from("support_ticket_metadata")
  .select("*,case:cases(id,title,status,priority,assignee,conversation_id,created_at,updated_at)")
  .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
  .order("created_at",{ascending:false}).limit(1000);
 if(data.queueId)q=q.eq("queue_id",data.queueId);
 const{data:rows,error}=await q;if(error)throw new Error(error.message);
 const result=(rows??[]) as any[];
 return data.status?result.filter((row:any)=>row.case?.status===data.status):result;
});
