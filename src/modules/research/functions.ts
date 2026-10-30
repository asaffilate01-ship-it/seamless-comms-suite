import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { researchInput, historyScope } from './contract';

const scope = z.object({ tenantId: z.string().uuid(), productKey: z.string().min(2).max(80) });
export const getResearch = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof historyScope>) => historyScope.parse(i)).handler(async ({ context, data }) => {
    const { loadResearchHistory } = await import('./history.server');
    const db = context.supabase as any;
    const [allowance, history, member] = await Promise.all([
      db.from('research_allowances').select('request_limit,requests_used,period_start,period_end,enabled').eq('tenant_id', data.tenantId).eq('product_key', data.productKey).maybeSingle(),
      loadResearchHistory(db, data),
      db.from('tenant_members').select('role').eq('tenant_id', data.tenantId).eq('user_id', context.userId).maybeSingle(),
    ]);
    if (allowance.error || member.error) throw new Error('Research setup is not available yet');
    return { configured: process.env.PERPLEXITY_RESEARCH_ENABLED === 'true' && !!process.env.PERPLEXITY_API_KEY,
      canSearch: ['owner', 'admin', 'agent'].includes(member.data?.role),
      allowance: allowance.data, ...history };
  });

export const runResearch = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof researchInput>) => researchInput.parse(i)).handler(async ({ context, data }) => {
    if (process.env.PERPLEXITY_RESEARCH_ENABLED !== 'true' || !process.env.PERPLEXITY_API_KEY) throw new Error('Research provider is not configured');
    const { createHash } = await import('node:crypto');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { searchPerplexity } = await import('./provider.server');
    const db = supabaseAdmin as any;
    const admitted = await db.rpc('reserve_research_request', { _tenant: data.tenantId, _product: data.productKey,
      _actor: context.userId, _request: data.requestId, _hash: createHash('sha256').update(data.query).digest('hex'), _preset: data.preset });
    if (admitted.error) throw new Error('Research access or allowance unavailable');
    if (admitted.data !== true) return { replay: true };
    let result;
    try { result = await searchPerplexity(data.query, data.preset, process.env.PERPLEXITY_API_KEY); }
    catch {
      await db.from('research_requests').update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', data.requestId).eq('tenant_id', data.tenantId).eq('status', 'reserved');
      throw new Error('Research failed. This attempt counts against the allowance; no automatic retry was made.');
    }
    const saved = await db.from('research_requests').update({ status: 'completed', result, completed_at: new Date().toISOString() })
      .eq('id', data.requestId).eq('tenant_id', data.tenantId).eq('status', 'reserved').select('id').single();
    if (saved.error) throw new Error('Search completed but its receipt could not be saved. Do not retry automatically.');
    return { replay: false };
  });

const exportScope = scope.extend({ requestId: z.string().uuid() }).strict();
export const exportResearch = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof exportScope>) => exportScope.parse(i)).handler(async ({ context, data }) => {
    const { loadResearchExport } = await import('./export.server');
    return loadResearchExport(context.supabase, data);
  });

export const getResearchRecord = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof exportScope>) => exportScope.parse(i)).handler(async ({ context, data }) => {
    const { loadResearchRecord } = await import('./export.server');
    return loadResearchRecord(context.supabase, data);
  });
