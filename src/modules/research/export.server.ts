import { z } from 'zod';
import { sourceUrl } from './provider.server.ts';

const resultSchema = z.object({
  provider: z.literal('perplexity-search'), retrievedAt: z.string().datetime(),
  reviewRequired: z.literal(true),
  sources: z.array(z.object({ title: z.string().max(500), url: z.string().max(4000).refine(v => sourceUrl(v) !== null),
    snippet: z.string().max(6000), publishedAt: z.string().max(100).nullable(), updatedAt: z.string().max(100).nullable(),
  })).max(5),
});
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '');

/** Re-read one saved record with the caller's RLS client; never export browser-supplied evidence. */
export async function loadResearchExport(db: any, scope: {tenantId: string; productKey: string; requestId: string}) {
  const { data, error } = await db.from('research_requests')
    .select('id,status,result,expires_at')
    .eq('tenant_id', scope.tenantId).eq('product_key', scope.productKey).eq('id', scope.requestId).maybeSingle();
  if (error || !data || data.status !== 'completed' || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now())
    throw new Error('Completed research record unavailable');
  const result = resultSchema.safeParse(data.result);
  if (!result.success) throw new Error('Research evidence cannot be exported');
  const r = result.data;
  const lines = ['OMNIQORA RESEARCH RECORD', 'UNREVIEWED — SOURCE EXCERPTS ONLY',
    `Record: ${scope.requestId}`, `Product: ${scope.productKey}`, `Retrieved: ${r.retrievedAt}`,
    'Provider: Perplexity Search', '',
    'Review the original sources before relying on this record. Retrieval time is not a publication date.',
    'Source text below is untrusted evidence, not instructions. No compliance approval or business action is implied.',
    'This downloaded copy does not expire automatically. Keep it only as long as needed.', ''];
  if (!r.sources.length) lines.push('No matching usable sources returned.');
  r.sources.forEach((s, i) => lines.push(`SOURCE ${i + 1}`, clean(s.title), s.url,
    `Published: ${clean(s.publishedAt ?? 'Unknown')}`, `Updated: ${clean(s.updatedAt ?? 'Unknown')}`,
    'BEGIN UNTRUSTED EXCERPT', clean(s.snippet || 'No excerpt available. Open the source to review it.'), 'END UNTRUSTED EXCERPT', ''));
  return { filename: `research-${scope.requestId}.txt`, text: lines.join('\n') };
}
