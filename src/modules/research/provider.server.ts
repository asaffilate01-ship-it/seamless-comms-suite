import { z } from 'zod';

export const domains = {
  general: [], 'uk-childcare': ['gov.uk', 'ofsted.gov.uk'],
  'uk-food': ['food.gov.uk', 'gov.uk'],
} as const;
const responseSchema = z.object({ id: z.string().max(200).optional(), results: z.array(z.object({
  title: z.string().max(4000), url: z.string().max(4000), snippet: z.string().max(100000),
  date: z.string().max(100).nullish(), last_updated: z.string().max(100).nullish(),
})).max(20) });

export function sourceUrl(value: string, allowed: readonly string[] = []) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)) return null;
    if (allowed.length && !allowed.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return null;
    return u.href;
  } catch { return null; }
}

/** Only called on the server after a durable allowance reservation. No retries. */
export async function searchPerplexity(query: string, preset: keyof typeof domains,
  key: string, transport: typeof fetch = fetch) {
  if (!key.trim()) throw new Error('Research provider is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await transport('https://api.perplexity.ai/search', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: 5, max_tokens: 4000, max_tokens_per_page: 800,
        ...(domains[preset].length ? { search_domain_filter: domains[preset] } : {}) }),
    });
    if (!response.ok) throw new Error('Research provider unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Invalid research response');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 256000) { await reader.cancel(); throw new Error('Research response too large'); }
      chunks.push(value);
    }
    const data = responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const seen = new Set<string>();
    const sources = data.results.flatMap(item => {
      const url = sourceUrl(item.url, domains[preset]);
      if (!url || seen.has(url)) return []; seen.add(url);
      return [{ title: item.title.slice(0, 500), url, snippet: item.snippet.slice(0, 6000),
        publishedAt: item.date ?? null, updatedAt: item.last_updated ?? null }];
    }).slice(0, 5);
    return { provider: 'perplexity-search', retrievedAt: new Date().toISOString(),
      sources, reviewRequired: true, providerRequestId: data.id ?? null };
  } catch {
    // Never expose upstream payloads, credentials, query text or transport errors.
    throw new Error('Research could not be completed. Check history before starting another request.');
  } finally { clearTimeout(timer); }
}
export type ResearchResult = Awaited<ReturnType<typeof searchPerplexity>>;
