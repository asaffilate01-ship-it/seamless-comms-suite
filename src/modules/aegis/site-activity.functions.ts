import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
import {readSiteActivity,siteActivityKinds} from './site-activity';
const input=z.object({tenantId:z.string().uuid(),parentId:z.string().uuid(),parentKind:z.enum(['site','engagement']),kind:z.enum(siteActivityKinds),page:z.number().int().min(0).max(10000).default(0)}).strict();
export const getAegisSiteActivity=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof input>)=>input.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const product=await db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key','aegis-command').maybeSingle();if(product.error||product.data?.status!=='active')throw new Error('Active Aegis product required');
 return readSiteActivity(db,data.tenantId,data.parentId,data.parentKind,data.kind,data.page);
});
