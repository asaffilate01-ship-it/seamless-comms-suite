import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
import {buildControlQueue,type ControlSources} from './control-room';
const scope=z.object({tenantId:z.string().uuid()}).strict();
export const getAegisControlRoom=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const product=await db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key','aegis-command').maybeSingle();if(product.error||product.data?.status!=='active')throw new Error('Active Aegis product required');
 // Every source is independently scoped by tenant and its existing RLS. No privileged client or cross-tenant cache.
 const queries=await Promise.all([
  db.from('aegis_operations').select('id,title,status,assigned_user_id').eq('tenant_id',data.tenantId).eq('kind','incident').in('status',['open','review']).order('updated_at',{ascending:false}).order('id').limit(101),
  db.from('aegis_corrective_actions').select('id,report_id,stage,priority,due_on,assignee_id').eq('tenant_id',data.tenantId).neq('stage','closed').order('due_on').order('id').limit(101),
  db.from('aegis_handovers').select('id,summary,stage,created_by,incoming_id').eq('tenant_id',data.tenantId).in('stage',['offered','returned']).order('updated_at',{ascending:false}).order('id').limit(101),
  db.from('aegis_reports').select('id,title,stage,created_by').eq('tenant_id',data.tenantId).eq('stage','submitted').order('updated_at',{ascending:false}).order('id').limit(101),
  db.from('aegis_post_orders_status').select('id,title,version,site_id').eq('tenant_id',data.tenantId).eq('is_current',true).order('created_at',{ascending:false}).order('id').limit(101),
 ]);
 for(const q of queries)if(q.error)throw new Error('Control-room source unavailable: '+q.error.message);
 const [incidents,actions,handovers,reports,orders]=queries.map(q=>(q.data??[]).slice(0,100));
 const receiptQuery=orders.length?await db.from('aegis_post_order_receipts').select('order_id').eq('tenant_id',data.tenantId).eq('actor',context.userId).in('order_id',orders.map((o:any)=>o.id)):{data:[],error:null};
 if(receiptQuery.error)throw new Error('Instruction receipt evidence unavailable');
 const sampledAt=new Date().toISOString(),sources={incidents,actions,handovers,reports,orders,receipts:receiptQuery.data??[]} as ControlSources;
 return {items:buildControlQueue(sources,context.userId,sampledAt.slice(0,10)),sampledAt,truncated:queries.map((q,i)=>({kind:['incident','corrective','handover','report','instructions'][i],limited:(q.data??[]).length>100})),limitPerSource:100};
});
