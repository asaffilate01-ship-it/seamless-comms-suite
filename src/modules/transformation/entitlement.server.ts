import type { SupabaseClient } from '@supabase/supabase-js';

// Explicit deployment choice. Factory failures never fall back to the pilot list.
export async function business360Entitled(client: SupabaseClient, tenant: string,
  env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<boolean> {
  const mode = env.BUSINESS360_ENTITLEMENT_MODE ?? 'pilot';
  if (mode === 'pilot') return (env.BUSINESS360_ENABLED_TENANTS ?? '').split(',').map(s=>s.trim()).includes(tenant);
  if (mode !== 'factory') throw new Error('Business360 entitlement mode is invalid');
  const [workspace, service, product] = await Promise.all([
    client.from('tenants').select('status').eq('id',tenant).maybeSingle(),
    client.from('tenant_services').select('status,valid_from,valid_until').eq('tenant_id',tenant).eq('service_key','business360.core').maybeSingle(),
    client.from('tenant_products').select('status').eq('tenant_id',tenant).eq('product_key','business360').maybeSingle(),
  ]);
  if (workspace.error || service.error || product.error) throw new Error('Business360 Factory entitlement is unavailable');
  if (workspace.data?.status !== 'active' || !service.data) return false;
  // Add-on tenants can hold the service without a standalone product subscription.
  // If a product subscription exists, its suspension must take precedence.
  if (product.data && product.data.status !== 'active') return false;
  const s = service.data;
  return ['active','trial'].includes(s.status) && Number.isFinite(Date.parse(s.valid_from)) &&
    Date.parse(s.valid_from) <= now && (s.valid_until === null || Date.parse(s.valid_until) > now);
}
