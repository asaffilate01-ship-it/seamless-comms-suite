export type FollowUpFilter = 'all' | 'overdue' | 'upcoming' | 'undated';

// Call only after CRM membership/entitlement authorization, using the user's RLS client.
export async function readDealFollowUps(db: any, tenantId: string, filter: FollowUpFilter, page: number, now = new Date()) {
  let query = db.from('crm_tasks').select('id,title,status,due_at,related_id,updated_at,priority')
    .eq('tenant_id', tenantId).eq('related_type', 'opportunity').in('status', ['open', 'in_progress']);
  if (filter === 'overdue') query = query.lt('due_at', now.toISOString());
  if (filter === 'upcoming') query = query.gte('due_at', now.toISOString());
  if (filter === 'undated') query = query.is('due_at', null);
  const result = await query.order('due_at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }).range(page * 25, page * 25 + 25);
  if (result.error) throw new Error('Follow-ups could not be loaded');
  const rows = (result.data ?? []).slice(0, 25);
  const ids = [...new Set(rows.map((r: any) => r.related_id).filter((id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id as string)))];
  const deals = ids.length ? await db.from('crm_opportunities').select('id,title,status').eq('tenant_id', tenantId).in('id', ids) : { data: [], error: null };
  if (deals.error) throw new Error('Linked deals could not be loaded');
  return { rows: rows.map((row: any) => ({ ...row, deal: deals.data?.find((d: any) => d.id === row.related_id) ?? null })), hasMore: (result.data ?? []).length > 25, asOf: now.toISOString() };
}
