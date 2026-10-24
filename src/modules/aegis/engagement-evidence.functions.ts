import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
import {readEngagementEvidence,fieldEvidenceKinds} from './engagement-evidence';
const input=z.object({tenantId:z.string().uuid(),engagementId:z.string().uuid(),kind:z.enum(['all',...fieldEvidenceKinds]).default('all'),page:z.number().int().min(0).max(10000).default(0)}).strict();
export const getAegisEngagementEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof input>)=>input.parse(i)).handler(async({context,data})=>{
 const member=await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const product=await db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key','aegis-command').maybeSingle();if(product.error||product.data?.status!=='active')throw new Error('Active Aegis product required');
 return {...await readEngagementEvidence(db,data.tenantId,data.engagementId,data.kind,data.page),userId:context.userId,role:member.role};
});
