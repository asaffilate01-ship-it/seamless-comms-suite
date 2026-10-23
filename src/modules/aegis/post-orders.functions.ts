import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership,requireAdminRole} from '@/modules/platform/access';
const scope=z.object({tenantId:z.string().uuid()}).strict();
export const getAegisPostOrders=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const [orders,receipts]=await Promise.all([db.from('aegis_post_orders_status').select('*').eq('tenant_id',data.tenantId).order('created_at',{ascending:false}).limit(200),db.from('aegis_post_order_receipts').select('*').eq('tenant_id',data.tenantId).order('recorded_at',{ascending:false}).limit(200)]);for(const r of [orders,receipts])if(r.error)throw new Error(r.error.message);return {orders:orders.data??[],receipts:receipts.data??[],userId:context.userId};
});
const publish=scope.extend({siteId:z.string().uuid(),title:z.string().trim().min(1).max(200),content:z.string().trim().min(1).max(15000),requestId:z.string().uuid()});
export const publishAegisPostOrder=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof publish>)=>publish.parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);const db=context.supabase as any;const old=await db.from('aegis_post_orders').select('*').eq('tenant_id',data.tenantId).eq('created_by',context.userId).eq('request_id',data.requestId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data){if(old.data.site_id!==data.siteId||old.data.title!==data.title||old.data.content!==data.content)throw new Error('Request ID reused with different instructions');return old.data;}
 const {data:row,error}=await db.from('aegis_post_orders').insert({tenant_id:data.tenantId,site_id:data.siteId,title:data.title,content:data.content,request_id:data.requestId}).select('*').single();if(error)throw new Error(error.message);return row;
});
const acknowledge=scope.extend({orderId:z.string().uuid()});
export const acknowledgeAegisPostOrder=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof acknowledge>)=>acknowledge.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const old=await db.from('aegis_post_order_receipts').select('*').eq('tenant_id',data.tenantId).eq('order_id',data.orderId).eq('actor',context.userId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data)return old.data;
 const {data:row,error}=await db.from('aegis_post_order_receipts').insert({tenant_id:data.tenantId,order_id:data.orderId}).select('*').single();if(error)throw new Error(error.message);return row;
});
