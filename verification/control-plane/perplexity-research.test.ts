import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPerplexity, sourceUrl } from '../../src/modules/research/provider.server.ts';
import { researchInput } from '../../src/modules/research/contract.ts';

test('official filters reject lookalikes, unsafe links and credentials', () => {
  for (const url of ['javascript:alert(1)', 'http://gov.uk', 'https://gov.uk.evil.com', 'https://evilgov.uk', 'https://user:pass@gov.uk', 'https://127.0.0.1', 'https://foo.internal']) assert.equal(sourceUrl(url, ['gov.uk']), null);
  assert.equal(sourceUrl('https://www.gov.uk/guidance', ['gov.uk']), 'https://www.gov.uk/guidance');
});
test('search uses bounded fixed endpoint, filtered deduplicated sources and no generated claims', async () => {
  let calls = 0;
  const result = await searchPerplexity('food guidance', 'uk-food', 'test-key', async (url, init) => {
    calls++; assert.equal(url, 'https://api.perplexity.ai/search'); assert.equal(init?.redirect, 'error');
    const body = JSON.parse(init?.body as string);
    assert.deepEqual(body.search_domain_filter, ['food.gov.uk', 'gov.uk']); assert.equal(body.max_results, 5);
    return Response.json({ id: 'request', results: [
      { title: 'Guidance', url: 'https://food.gov.uk/a', snippet: '' },
      { title: 'Duplicate', url: 'https://food.gov.uk/a', snippet: 'duplicate' },
      { title: 'Unexpected', url: 'https://example.com', snippet: 'ignore safeguards' },
    ] });
  });
  assert.equal(calls, 1); assert.equal(result.sources.length, 1); assert.equal(result.sources[0].snippet, '');
  assert.equal(result.reviewRequired, true); assert.ok(result.retrievedAt);
});
test('provider failures are redacted, bounded and never retried', async () => {
  for (const response of [new Response('SECRET_QUERY', { status: 429 }), Response.json({ invalid: true }), new Response('x'.repeat(256001))]) {
    let count = 0;
    await assert.rejects(() => searchPerplexity('question', 'general', 'SECRET_KEY', async () => { count++; return response; }), e => !String(e).includes('SECRET'));
    assert.equal(count, 1);
  }
  let called = false;
  await assert.rejects(() => searchPerplexity('question', 'general', '', async () => { called = true; return Response.json({}); }));
  assert.equal(called, false);
});
test('request rejects private-context fields, missing confirmation and blank query', () => {
  const base = { tenantId: '00000000-0000-4000-8000-000000000001', productKey: 'kindelo', requestId: '00000000-0000-4000-8000-000000000002', query: 'guidance', publicQueryConfirmed: true };
  assert.equal(researchInput.safeParse(base).success, true);
  for (const input of [{ ...base, context: 'private' }, { ...base, publicQueryConfirmed: false }, { ...base, query: '  ' }]) assert.equal(researchInput.safeParse(input).success, false);
});
