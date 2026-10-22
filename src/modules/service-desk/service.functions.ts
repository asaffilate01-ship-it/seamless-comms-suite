import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canSubmit, normaliseTitle } from './model';

// Existing memberships only: opening this product must never bootstrap a tenant.
export const serviceWorkspaces = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from('tenant_members')
      .select('tenant_id, role, tenants(name)').eq('user_id', context.userId).order('tenant_id').limit(100);
    if (error) throw new Error('Unable to load authorised workspaces.');
    return (data ?? []).map(row => ({ tenantId: row.tenant_id, role: row.role,
      name: (row.tenants as { name: string } | null)?.name ?? 'Workspace' }));
  });

export const serviceQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: member, error: memberError } = await context.supabase.from('tenant_members')
      .select('role').eq('tenant_id', data.tenantId).eq('user_id', context.userId).maybeSingle();
    if (memberError || !member) throw new Error('Workspace access is unavailable.');
    const { data: rows, error, count } = await context.supabase.from('cases')
      .select('id, title, status, priority, assignee, created_at, updated_at', { count: 'exact' })
      .eq('tenant_id', data.tenantId).order('updated_at', { ascending: false }).order('id').limit(200);
    if (error) throw new Error('Unable to load requests. Please retry.');
    return { rows: rows ?? [], total: count ?? 0, role: member.role };
  });

const intakeSchema = z.object({ tenantId: z.string().uuid(), requestId: z.string().uuid(),
  title: z.string().transform(normaliseTitle), priority: z.enum(['low', 'normal', 'high', 'urgent']) });
export const submitServiceRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof intakeSchema>) => intakeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: member, error: memberError } = await supabase.from('tenant_members')
      .select('role').eq('tenant_id', data.tenantId).eq('user_id', userId).maybeSingle();
    if (memberError || !member || !canSubmit(member.role)) throw new Error('A staff role is required to create requests.');
    // Stable client request UUID makes a network retry safe without an upsert that could overwrite another case.
    const { error } = await supabase.from('cases').insert({ id: data.requestId, tenant_id: data.tenantId,
      title: data.title, priority: data.priority, status: 'new', assignee: userId, conversation_id: null });
    if (error) {
      if (error.code !== '23505') throw new Error('Request could not be saved. Retry with the same form.');
      const { data: prior, error: readError } = await supabase.from('cases').select('id, title, priority, assignee')
        .eq('tenant_id', data.tenantId).eq('id', data.requestId).maybeSingle();
      if (readError || !prior || prior.title !== data.title || prior.priority !== data.priority || prior.assignee !== userId)
        throw new Error('Request reference conflict. Refresh the queue before creating another request.');
      return { id: prior.id, replayed: true, auditRecorded: false };
    }
    const { error: auditError } = await supabase.from('audit_log').insert({ tenant_id: data.tenantId,
      actor: userId, action: 'service_desk.request.create', entity: 'case', entity_id: data.requestId });
    // Never describe a persisted case as failed or retry its creation when only the audit write failed.
    return { id: data.requestId, replayed: false, auditRecorded: !auditError };
  });
