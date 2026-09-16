import { createServerFn } from '@tanstack/react-start';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { accessSchema, browserOperations, requiredPermission, type HostAccess } from './contracts';

// Narrow extension until Supabase regenerates Database types after applying the migration.
async function currentAccess(client: unknown, workspace: string | null): Promise<HostAccess[]> {
  const db = client as SupabaseClient;
  const { data, error } = await db.rpc('get_rrci_access', { _workspace: workspace });
  if (error) throw new Error('The compliance workspace is not available.');
  return z.array(accessSchema).parse(data);
}
export const listComplianceWorkspaces = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => currentAccess(context.supabase, null));

export const complianceOperation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspace: z.string().uuid(), operation: browserOperations, payload: z.record(z.unknown()) }).strict())
  .handler(async ({ context, data }) => {
    const [access] = await currentAccess(context.supabase, data.workspace);
    if (!access || access.subject !== context.userId || !access.permissions.includes(requiredPermission[data.operation])) {
      throw new Error('Access denied.');
    }
    const { callIntelligence } = await import('./platform.server');
    const result = await callIntelligence(access, data.operation, data.payload);
    // Recheck current membership, module permission and billing after potentially slow AI work.
    const [latest] = await currentAccess(context.supabase, data.workspace);
    if (!latest || latest.subject !== context.userId || !latest.permissions.includes(requiredPermission[data.operation])) {
      throw new Error('Workspace access changed.');
    }
    return { payload: JSON.stringify(result) };
  });
