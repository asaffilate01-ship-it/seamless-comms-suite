import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getBridgeStatus = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({tenantId:z.string().uuid()}))
  .handler(async({context,data})=>{
    const {data:member,error}=await context.supabase.from('tenant_members').select('role')
      .eq('tenant_id',data.tenantId).eq('user_id',context.userId).maybeSingle();
    if(error||!member||!['owner','admin'].includes(member.role))throw new Error('Workspace administrator access is required to view connection configuration');
    const {readBindings,available}=await import('./bridge-core');
    const entitled=(process.env.BUSINESS360_ENABLED_TENANTS??'').split(',').map(x=>x.trim()).includes(data.tenantId);
    return readBindings().filter(b=>b.tenant===data.tenantId).map(b=>({id:b.id,product:b.product,
      externalTenant:b.externalTenant,project:b.project,contracts:b.contracts,
      status:!b.enabled?'disabled':Date.parse(b.expiresAt)<=Date.now()?'expired':!available(b)?'credential-required':!entitled?'entitlement-required':'configured—not live-verified'}));
  });
