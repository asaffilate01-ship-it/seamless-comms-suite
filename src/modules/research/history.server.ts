import { z } from 'zod';
import { historyScope } from './contract.ts';

export const PAGE_SIZE = 20;

/** User-scoped client only. List metadata without downloading retained source text. */
export async function loadResearchHistory(db: any, raw: z.input<typeof historyScope>) {
  const input = historyScope.parse(raw);
  let query = db.from('research_requests').select('id,status,created_at,preset')
    .eq('tenant_id', input.tenantId).eq('product_key', input.productKey);
  if (input.status !== 'all') query = query.eq('status', input.status);
  const { data, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range(input.page * PAGE_SIZE, (input.page + 1) * PAGE_SIZE);
  if (error || !Array.isArray(data)) throw new Error('Research history unavailable');
  return { history: data.slice(0, PAGE_SIZE), hasMore: data.length > PAGE_SIZE, page: input.page };
}
