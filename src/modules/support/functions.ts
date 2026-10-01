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
 requireWritableTenantRole(access.role);
 const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
 const{data:id,error}=await admin.rpc("create_support_ticket",{
  _tenant:data.tenantId,_tenant_product:data.tenantProductId,_title:data.title,_priority:data.priority,
  _conversation:data.conversationId??null,_queue:data.queueId??null,_category:data.category??null,
  _channel:data.channel,_customer_ref:data.customerRef??null,_source_product:data.sourceProductKey??null,
  _external_ref:data.externalRef??null,_tags:data.tags,_assignee:context.userId
 });
 if(error||!id)throw new Error(error?.message??"Support ticket could not be created");
 return{id};
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
