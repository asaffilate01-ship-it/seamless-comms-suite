import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
import {readSourceRecord} from './source-record';
const input=z.object({tenantId:z.string().uuid(),kind:z.enum(['incident','corrective','handover','report','instructions','visitor','key','equipment']),sourceId:z.string().uuid(),page:z.number().int().min(0).max(10000).default(0)}).strict();
export const getAegisSourceRecord=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof input>)=>input.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const product=await db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key','aegis-command').maybeSingle();
 if(product.error||product.data?.status!=='active')throw new Error('Active Aegis product required');
 return readSourceRecord(db,data.tenantId,data.kind,data.sourceId,data.page);
});
