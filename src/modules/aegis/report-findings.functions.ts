import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
import {readReportFindings} from './report-findings';
const input=z.object({tenantId:z.string().uuid(),reportId:z.string().uuid()}).strict();
export const getAegisReportFindings=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof input>)=>input.parse(i)).handler(async({context,data})=>{
 const member=await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const product=await db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key','aegis-command').maybeSingle();if(product.error||product.data?.status!=='active')throw new Error('Active Aegis product required');
 return {...await readReportFindings(db,data.tenantId,data.reportId),role:member.role};
});
