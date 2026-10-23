import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership,requireAdminRole} from '@/modules/platform/access';
import {AEGIS_PRODUCT_KEY,aegisReadiness} from './capabilities';
export const getAegisFactoryStatus=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:{tenantId:string})=>z.object({tenantId:z.string().uuid()}).strict().parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);const db=context.supabase as any;
 const [product,governance,runtime,providers]=await Promise.all([
 db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key',AEGIS_PRODUCT_KEY).maybeSingle(),
 db.rpc('has_tenant_entitlement',{_tenant:data.tenantId,_service:'omniqora.ai-governance'}),
 db.rpc('has_tenant_entitlement',{_tenant:data.tenantId,_service:'omniqora.intelligence-runtime'}),
 db.from('provider_bindings').select('status,last_verified_at').eq('tenant_id',data.tenantId).eq('product_key',AEGIS_PRODUCT_KEY)
 ]);for(const r of [product,governance,runtime,providers])if(r.error)throw new Error('Aegis readiness could not be verified');
 const now=Date.now();return aegisReadiness({productActive:product.data?.status==='active',governanceEntitled:governance.data===true,runtimeEntitled:runtime.data===true,providerVerified:(providers.data??[]).some((p:any)=>p.status==='active'&&p.last_verified_at&&now-Date.parse(p.last_verified_at)>=0&&now-Date.parse(p.last_verified_at)<86400000)});
});
