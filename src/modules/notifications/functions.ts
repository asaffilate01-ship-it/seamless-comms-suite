import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const listMyNotifications=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{unreadOnly?:boolean})=>scope.extend({unreadOnly:z.boolean().default(false)}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"notifications.core"});
 const db=context.supabase as any;let q=db.from("user_notifications").select("*")
  .eq("tenant_id",data.tenantId).eq("user_id",context.userId)
  .or(`tenant_product_id.eq.${data.tenantProductId},tenant_product_id.is.null`)
  .is("dismissed_at",null).order("created_at",{ascending:false}).limit(500);
 if(data.unreadOnly)q=q.is("read_at",null);
 const{data:rows,error}=await q;if(error)throw new Error(error.message);
 const now=Date.now();return(rows??[]).filter((row:any)=>!row.expires_at||Date.parse(row.expires_at)>now);
});

export const updateNotificationState=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{notificationId:string;action:"read"|"dismiss"})=>
 scope.extend({notificationId:z.string().uuid(),action:z.enum(["read","dismiss"])}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"notifications.core"});
 const db=context.supabase as any;const patch=data.action==="read"?{read_at:new Date().toISOString()}:{dismissed_at:new Date().toISOString()};
 const{error}=await db.from("user_notifications").update(patch).eq("id",data.notificationId)
  .eq("tenant_id",data.tenantId).eq("user_id",context.userId);
 if(error)throw new Error(error.message);return{ok:true};
});

const pref=scope.extend({
 notificationType:z.string().min(1).max(160),inApp:z.boolean(),email:z.boolean(),
 sms:z.boolean(),whatsapp:z.boolean(),push:z.boolean(),
 quietHours:z.object({start:z.string().regex(/^\d{2}:\d{2}$/),end:z.string().regex(/^\d{2}:\d{2}$/),timezone:z.string().min(1).max(80)}).optional().nullable()
});
export const upsertNotificationPreference=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof pref>)=>pref.parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"notifications.core"});
 const db=context.supabase as any;const{data:row,error}=await db.from("notification_preferences").upsert({
  tenant_id:data.tenantId,user_id:context.userId,notification_type:data.notificationType,
  in_app:data.inApp,email:data.email,sms:data.sms,whatsapp:data.whatsapp,push:data.push,
  quiet_hours:data.quietHours??null,updated_at:new Date().toISOString()
 },{onConflict:"tenant_id,user_id,notification_type"}).select("*").single();
 if(error||!row)throw new Error(error?.message??"Notification preference could not be saved");return row;
});
