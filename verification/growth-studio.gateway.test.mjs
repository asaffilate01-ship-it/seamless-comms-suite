import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// The real HTTP handler and SQL migrations run against an isolated database.
// All credentials, tenants and provider results below are generated test fixtures.
// No network, production activation, model invocation or publishing takes place.
const require = createRequire(import.meta.url), ts = require('typescript');
const compile = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const zod = JSON.stringify(pathToFileURL(require.resolve('zod')).href);
const identity = compile(await read('../src/modules/platform/service-identity.ts'));
const contract = compile((await read('../src/modules/growth/studio.contract.ts')).replace('"zod"', zod));
const source = (await read('../src/modules/growth/studio.service.server.ts'))
  .replace('"@/modules/platform/service-identity"', JSON.stringify(identity))
  .replace('"./studio.contract"', JSON.stringify(contract))
  .replace('"zod"', zod)
  .replace('import("@/integrations/supabase/client.server")', '({supabaseAdmin:globalThis.__growthGatewayDB})');
const { serveGrowthService } = await import(compile(source));
const db = new PGlite();
const rows = async (sql, values = []) => (await db.query(sql, values)).rows;
let passed = 0, rpcCalls = 0, beforeRpc;
const check = async (name, fn) => { await fn(); console.log(`PASS ${++passed}: ${name}`); };
async function inRole(role, fn, user) {
  assert(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  if (user) await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
  try { const result = await fn(); await db.exec('COMMIT'); return result; }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
async function sqlCall(name, values, role = 'service_role', user) {
  assert(/^growth_studio_[a-z_]+$/.test(name));
  return inRole(role, async () => (await rows(`SELECT public.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, values))[0].result, user);
}
const rpcOrder = {
  growth_studio_ingest_product_evidence: ['_credential', '_tenant', '_product', '_brand', '_external_ref', '_data'],
  growth_studio_export_product_campaign: ['_credential', '_tenant', '_product', '_brand', '_run'],
};
globalThis.__growthGatewayDB = {
  from(table) {
    assert.equal(table, 'platform_service_credentials');
    let key;
    return {
      select(columns) { assert.equal(columns, 'id,key_id,secret_hash,status,expires_at,scopes'); return this; },
      eq(column, value) { assert.equal(column, 'key_id'); key = value; return this; },
      async maybeSingle() {
        const record = (await rows('SELECT id,key_id,secret_hash,status,expires_at::text,scopes FROM public.platform_service_credentials WHERE key_id=$1', [key]))[0];
        return { data: record ?? null, error: null };
      },
    };
  },
  async rpc(name, args) {
    rpcCalls++;
    assert(rpcOrder[name], `Unexpected gateway RPC: ${name}`);
    assert.deepEqual(Object.keys(args).sort(), [...rpcOrder[name]].sort());
    if (beforeRpc) { const hook = beforeRpc; beforeRpc = undefined; await hook(); }
    try {
      return { data: await sqlCall(name, rpcOrder[name].map((key) => key === '_data' ? JSON.stringify(args[key]) : args[key])), error: null };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  },
};
const invoke = (payload, credential, options = {}) => serveGrowthService(new Request('https://gateway.example.invalid/api/platform/growth', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: credential?.header ?? 'Bearer invalid', ...options.headers },
  body: options.raw ?? JSON.stringify(payload),
}));
const response = async (payload, credential, status = 200, options) => {
  const result = await invoke(payload, credential, options);
  const body = await result.json();
  assert.equal(result.status, status, JSON.stringify(body));
  assert.equal(result.headers.get('cache-control'), 'no-store');
  return body;
};

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE PUBLICATION supabase_realtime;`);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (file.startsWith('20260816120554')) for (const id of ['18bafcd5-3e4c-4044-bb63-10325a0b7209', 'e66c0525-1787-4250-be26-79f849624521', '890c71b1-cf6e-4b68-a56e-dd6050372481', '97319fe5-82fd-44cd-b27d-6ae314ee368b']) {
      await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, 'historic-fixture@example.invalid']);
    }
    try { await db.exec(await readFile(new URL(file, dir), 'utf8')); }
    catch (error) { throw new Error(`Migration failed: ${file}: ${error.message}`, { cause: error }); }
  }
  console.log(`Applied ${files.length} repository migrations in the isolated database.`);

  const owner = randomUUID(), tenant = randomUUID(), otherTenant = randomUUID();
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [owner, 'growth-owner@example.invalid']);
  for (const id of [tenant, otherTenant]) {
    await db.query("INSERT INTO public.organisations(id,name,slug) VALUES($1,'Gateway fixture',$2)", [id, 'growth-' + id]);
    await db.query("INSERT INTO public.tenants(id,name,slug,status,organisation_id) VALUES($1,'Gateway fixture',$2,'active',$1)", [id, 'growth-' + id]);
    await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'owner')", [id, owner]);
    for (const key of ['omniqora', 'syndriva', 'merqora', 'affivon']) {
      await db.query("INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES($1,$2,'active')", [id, key]);
    }
    for (const key of ['omniqora.campaigns', 'omniqora.creative']) {
      await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status,valid_from) VALUES($1,$2,'active',now()-interval '1 hour')", [id, key]);
    }
  }
  const human = (name, values) => sqlCall(name, values, 'authenticated', owner);
  const brand = (product, t = tenant) => human('growth_studio_save_brand', [t, product, null, null, JSON.stringify({
    name: 'Controlled brand', voice: 'Clear and factual', offer: 'A verified fixture offer', audience: 'Fixture buyers',
    rules: ['Cite the supplied evidence'], locale: 'en', disclosure: product === 'affivon' ? 'Affiliate links may earn commission.' : '',
  })]);
  const brands = {};
  for (const key of ['omniqora', 'syndriva', 'merqora', 'affivon']) brands[key] = await brand(key);
  const secondBrand = await brand('merqora');
  const foreignBrand = await brand('merqora', otherTenant);
  const scoped = (product = 'merqora', brandId = brands[product].id, capabilities = ['growth.evidence.write', 'growth.campaigns.read']) => ({ tenantId: tenant, productKey: product, brandIds: [brandId], capabilities });
  async function credential(scopes = [scoped()]) {
    const id = randomUUID(), key = 'oqsvc_fixture_' + id.replaceAll('-', '');
    const secret = randomUUID() + randomUUID();
    await db.query('INSERT INTO public.platform_service_credentials(id,key_id,secret_hash,secret_suffix,scopes) VALUES($1,$2,$3,$4,$5)',
      [id, key, createHash('sha256').update(secret).digest('hex'), secret.slice(-6), JSON.stringify(scopes)]);
    return { id, key, secret, scopes, header: 'Bearer ' + key + '.' + secret };
  }
  const mainCredential = await credential(), rotatedCredential = await credential();
  let evidence;
  const input = {
    operation: 'evidence.ingest', tenantId: tenant, productKey: 'merqora', brandId: brands.merqora.id,
    externalRef: 'catalogue:item-1', title: 'Verified product fact', content: 'The controlled product is available in blue.',
    kind: 'product_data', sourceUrl: 'https://merchant.example.invalid/items/1', validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  };
  const exportInput = (runId, operation = 'campaigns.export') => ({ operation, tenantId: tenant, productKey: 'merqora', brandId: brands.merqora.id, runId });

  await check('all four supported products ingest scoped evidence without user impersonation', async () => {
    const ids = [];
    for (const product of ['omniqora', 'syndriva', 'merqora', 'affivon']) {
      const key = product === 'merqora' ? mainCredential : await credential([scoped(product)]);
      const result = await response({ ...input, productKey: product, brandId: brands[product].id }, key, 201);
      assert.equal(result.created, true); assert.equal(result.changed, true); assert.equal(result.replayed, false);
      assert.deepEqual(result.evidence.provenance, { credentialId: key.id, externalRef: input.externalRef });
      const stored = (await rows('SELECT created_by,source_credential_id FROM public.growth_studio_evidence WHERE id=$1', [result.evidence.id]))[0];
      assert.equal(stored.created_by, null); assert.equal(stored.source_credential_id, key.id);
      ids.push(result.evidence.id);
      if (product === 'merqora') evidence = result.evidence;
    }
    assert.equal(new Set(ids).size, 4);
  });

  await check('identical retries, including credential rotation, preserve revision and provenance', async () => {
    for (const key of [mainCredential, rotatedCredential]) {
      const result = await response(input, key);
      assert.equal(result.created, false); assert.equal(result.changed, false); assert.equal(result.replayed, true);
      assert.deepEqual(result.evidence, evidence);
    }
    assert.equal((await rows('SELECT count(*)::int AS n FROM public.growth_studio_evidence WHERE tenant_id=$1 AND product_key=$2 AND brand_id=$3 AND external_ref=$4', [tenant, 'merqora', input.brandId, input.externalRef]))[0].n, 1);
  });

  await check('tenant, product, brand and capability restrictions cannot be omitted or broadened', async () => {
    for (const payload of [
      { ...input, tenantId: otherTenant, brandId: foreignBrand.id },
      { ...input, productKey: 'syndriva', brandId: brands.syndriva.id },
      { ...input, brandId: secondBrand.id },
    ]) {
      const before = rpcCalls; await response(payload, mainCredential, 403); assert.equal(rpcCalls, before);
    }
    const { brandId: omitted, ...noBrand } = input;
    await response(noBrand, mainCredential, 422);
    await response({ ...input, productKey: 'dishbee' }, mainCredential, 422);
    const reader = await credential([scoped('merqora', input.brandId, ['growth.campaigns.read'])]);
    const writer = await credential([scoped('merqora', input.brandId, ['growth.evidence.write'])]);
    await response(input, reader, 403); await response(exportInput(randomUUID()), writer, 403);
    for (const scope of [
      { ...scoped(), locationIds: [randomUUID()] },
      { ...scoped(), capabilities: ['growth.*'] },
    ]) await response(input, await credential([scope]), 403);
  });

  await check('the database independently enforces restricted scope and service-only grants', async () => {
    const args = [mainCredential.id, tenant, 'merqora', input.brandId, input.externalRef, JSON.stringify({
      title: input.title, content: input.content, sourceUrl: input.sourceUrl, kind: input.kind, validUntil: input.validUntil,
    })];
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(sqlCall('growth_studio_ingest_product_evidence', args, role, owner), /permission denied/i);
      await assert.rejects(sqlCall('growth_studio_export_product_campaign', args.slice(0, 4).concat(randomUUID()), role, owner), /permission denied/i);
    }
    await assert.rejects(sqlCall('growth_studio_assert_service_scope', args.slice(0, 4).concat('growth.evidence.write')), /permission denied/i);
    await assert.rejects(inRole('service_role', () => db.query("UPDATE public.growth_studio_evidence SET content='forged' WHERE id=$1", [evidence.id])), /permission denied/i);
    for (const [index, value] of [[1, otherTenant], [2, 'syndriva'], [3, secondBrand.id], [3, null]]) {
      const denied = [...args]; denied[index] = value;
      await assert.rejects(sqlCall('growth_studio_ingest_product_evidence', denied), (error) => error.code === '42501');
    }
    const location = await credential([{ ...scoped(), locationIds: [randomUUID()] }]);
    await assert.rejects(sqlCall('growth_studio_ingest_product_evidence', [location.id, ...args.slice(1)]), (error) => error.code === '42501');
  });

  await check('revoked, expired and wrong-secret credentials fail before ingress', async () => {
    for (const update of ["status='disabled'", "status='expired'", "expires_at=now()-interval '1 second'"]) {
      await db.query(`UPDATE public.platform_service_credentials SET ${update} WHERE id=$1`, [mainCredential.id]);
      const before = rpcCalls; await response(input, mainCredential, 403); assert.equal(rpcCalls, before);
      await db.query("UPDATE public.platform_service_credentials SET status='active',expires_at=NULL WHERE id=$1", [mainCredential.id]);
    }
    await response(input, { header: 'Bearer ' + mainCredential.key + '.' + 'wrong-secret'.repeat(5) }, 403);
    await response(input, null, 403);
  });

  await check('revocation or expiry between HTTP authentication and the RPC still fails closed', async () => {
    for (const update of ["status='disabled'", "expires_at=now()-interval '1 second'"]) {
      beforeRpc = () => db.query(`UPDATE public.platform_service_credentials SET ${update} WHERE id=$1`, [mainCredential.id]);
      await response(input, mainCredential, 403);
      await db.query("UPDATE public.platform_service_credentials SET status='active',expires_at=NULL WHERE id=$1", [mainCredential.id]);
    }
    beforeRpc = () => db.query('UPDATE public.platform_service_credentials SET scopes=$2 WHERE id=$1', [mainCredential.id, JSON.stringify([scoped('merqora', input.brandId, ['growth.campaigns.read'])])]);
    await response(input, mainCredential, 403);
    await db.query('UPDATE public.platform_service_credentials SET scopes=$2 WHERE id=$1', [mainCredential.id, JSON.stringify(mainCredential.scopes)]);
  });

  await check('each request checks current tenant, product and dated campaigns entitlement', async () => {
    for (const [table, update, restore, extra] of [
      ['tenants', "status='suspended'", "status='active'", 'id=$1'],
      ['tenant_products', "status='suspended'", "status='active'", "tenant_id=$1 AND product_key='merqora'"],
      ['tenant_services', "status='suspended'", "status='active'", "tenant_id=$1 AND service_key='omniqora.campaigns'"],
      ['tenant_services', "valid_from=now()+interval '1 day'", "valid_from=now()-interval '1 hour'", "tenant_id=$1 AND service_key='omniqora.campaigns'"],
      ['tenant_services', "valid_until=now()-interval '1 second'", 'valid_until=NULL', "tenant_id=$1 AND service_key='omniqora.campaigns'"],
    ]) {
      await db.query(`UPDATE public.${table} SET ${update} WHERE ${extra}`, [tenant]);
      await response(input, mainCredential, 403);
      await db.query(`UPDATE public.${table} SET ${restore} WHERE ${extra}`, [tenant]);
    }
  });

  await check('request bounds, TTL, source URLs and errors are enforced without leaking details', async () => {
    for (const payload of [
      { ...input, validUntil: null }, { ...input, kind: 'affiliate_offer', validUntil: null },
      { ...input, validUntil: '2000-01-01T00:00:00Z' }, { ...input, validUntil: 'infinity' },
      { ...input, content: 'x'.repeat(12001) }, { ...input, externalRef: 'x'.repeat(201) },
      { ...input, sourceUrl: 'javascript:alert(1)' }, { ...input, sourceUrl: 'https://user:password@example.invalid/a' },
      { ...input, sourceUrl: 'not-a-valid-url' }, { ...input, sourceUrl: 'https://[broken' },
      { ...input, createdBy: owner },
    ]) await response(payload, mainCredential, 422);
    await response(input, mainCredential, 415, { headers: { 'content-type': 'text/plain' } });
    await response(input, mainCredential, 400, { raw: '{invalid json' });
    await response(input, mainCredential, 413, { raw: ' '.repeat(65537) });
    await response(input, mainCredential, 413, { headers: { 'content-length': '65537' } });
    const originalRpc = globalThis.__growthGatewayDB.rpc;
    globalThis.__growthGatewayDB.rpc = async () => ({ error: { code: 'XX000', message: 'internal secret_hash ' + mainCredential.secret } });
    const denied = await response(input, mainCredential, 503);
    assert(!JSON.stringify(denied).includes(mainCredential.secret)); assert(!JSON.stringify(denied).includes('secret_hash'));
    globalThis.__growthGatewayDB.rpc = originalRpc;
  });

  const campaign = await human('growth_studio_save_campaign', [tenant, 'merqora', null, null, input.brandId, JSON.stringify({
    title: 'Controlled campaign', objective: 'Draft a factual product introduction', channel: 'social', locale: 'en', evidenceIds: [evidence.id],
  })]);
  const start = () => human('growth_studio_start_run', [tenant, 'merqora', campaign.id, randomUUID(), null, null, 'fixture.writer', 'fixture-model']);
  const generated = {
    output: { angle: 'A verified introduction', rationale: 'Uses the supplied product fact',
      variants: [{ key: 'v1', headline: 'Available in blue', body: 'Explore the controlled product, available in blue.', callToAction: 'View product',
        hashtags: [], evidenceIds: [evidence.id], disclosure: '' }],
      creativeBrief: { direction: 'Use a factual product photograph.', assetTypes: ['copy', 'image'] }, warnings: [] },
    checks: [{ key: 'evidence', label: 'Evidence', status: 'pass', detail: 'Fixture citations are valid.' }],
    provider: { providerKey: 'fixture.writer', model: 'fixture-model' },
    privateProviderDebug: 'This internal fixture metadata must not be exported.',
  };
  const finish = (claim) => sqlCall('growth_studio_finish_run', [tenant, 'merqora', claim.run.id, claim.claimToken, 'completed', JSON.stringify(generated), null]);
  const review = (run, decision = 'approved') => human('growth_studio_review_run', [tenant, 'merqora', run.id, run.revision, decision, 'Controlled human review']);
  let approved;

  await check('exports expose only completed and approved content, never running, pending or rejected drafts', async () => {
    const claim = await start();
    for (const operation of ['campaigns.export', 'campaigns.get']) {
      const denied = await response(exportInput(claim.run.id, operation), mainCredential, 404); assert.equal(denied.output, undefined);
    }
    let run = await finish(claim);
    await response(exportInput(run.id), mainCredential, 404);
    run = await review(run, 'rejected');
    const rejected = await response(exportInput(run.id), mainCredential, 404); assert.equal(rejected.output, undefined);
    approved = await review(run);
    const result = await response(exportInput(approved.id), mainCredential);
    assert.deepEqual(result.output, generated.output); assert.equal(result.reviewStatus, 'approved');
    assert.deepEqual(result.handoff, { marketingCampaignId: null, marketingStatus: null, creativeBriefId: null, creativeStatus: null });
    assert.deepEqual(result.provenance.evidence[0].provenance, evidence.provenance);
    for (const excluded of ['claimToken', 'execution_token', 'secret_hash', 'privateProviderDebug', 'inputSnapshot']) assert(!JSON.stringify(result).includes(excluded));
    const another = await credential([scoped('merqora', secondBrand.id)]);
    await response({ ...exportInput(approved.id), brandId: secondBrand.id }, another, 404);
    await response({ ...exportInput(approved.id), productKey: 'syndriva', brandId: brands.syndriva.id }, await credential([scoped('syndriva')]), 404);
  });

  await check('identical evidence retries preserve approval and repeated exports have no draft/publication effects', async () => {
    await response(input, rotatedCredential);
    const first = await response(exportInput(approved.id), mainCredential);
    const second = await response(exportInput(approved.id, 'campaigns.get'), mainCredential);
    assert.equal(first.provenance.runRevision, approved.revision); assert.equal(second.provenance.runRevision, approved.revision);
    assert.equal((await rows('SELECT count(*)::int AS n FROM public.marketing_campaigns WHERE tenant_id=$1', [tenant]))[0].n, 0);
    assert.equal((await rows('SELECT count(*)::int AS n FROM public.creative_briefs WHERE tenant_id=$1', [tenant]))[0].n, 0);
    beforeRpc = () => db.query("UPDATE public.tenant_products SET status='suspended' WHERE tenant_id=$1 AND product_key='merqora'", [tenant]);
    await response(exportInput(approved.id), mainCredential, 403);
    await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='merqora'", [tenant]);
  });

  await check('exports return actual draft handoff identifiers and states without creating or publishing them', async () => {
    approved = await human('growth_studio_handoff_run', [tenant, 'merqora', approved.id, approved.revision]);
    const result = await response(exportInput(approved.id), mainCredential);
    assert.deepEqual(result.handoff, {
      marketingCampaignId: approved.marketingCampaignId, marketingStatus: 'draft',
      creativeBriefId: approved.creativeBriefId, creativeStatus: 'draft',
    });
    await response(exportInput(approved.id), mainCredential);
    assert.equal((await rows('SELECT count(*)::int AS n FROM public.marketing_campaigns WHERE tenant_id=$1', [tenant]))[0].n, 1);
    assert.equal((await rows('SELECT count(*)::int AS n FROM public.creative_briefs WHERE tenant_id=$1', [tenant]))[0].n, 1);
  });

  await check('changed evidence increments once and prevents exporting an immutable handed-off campaign', async () => {
    input.content = 'The controlled product is now available in green.';
    const changed = await response(input, rotatedCredential);
    assert.equal(changed.changed, true); assert.equal(changed.created, false); assert.equal(changed.replayed, false);
    assert.equal(changed.evidence.revision, evidence.revision + 1); assert.equal(changed.evidence.provenance.credentialId, rotatedCredential.id);
    evidence = changed.evidence;
    assert.deepEqual((await response(input, rotatedCredential)).evidence, evidence);
    await response(exportInput(approved.id), mainCredential, 409);
    assert.equal((await rows('SELECT status FROM public.marketing_campaigns WHERE id=$1', [approved.marketingCampaignId]))[0].status, 'draft');
  });

  await check('changes revoke unhanded approvals and stale in-flight runs while retaining their original snapshots', async () => {
    const claim = await start(); let current = await finish(claim); current = await review(current);
    input.content = 'The controlled product now has a verified revised description.';
    await response(input, mainCredential);
    const stale = (await rows('SELECT status,review_status,input_snapshot FROM public.growth_studio_runs WHERE id=$1', [current.id]))[0];
    assert.equal(stale.status, 'stale'); assert.equal(stale.review_status, 'pending');
    assert.equal(stale.input_snapshot.evidence[0].content, evidence.content);
    await response(exportInput(current.id), mainCredential, 404);
    const active = await start(); input.title = 'Updated verified product fact'; await response(input, mainCredential);
    assert.equal((await rows('SELECT status FROM public.growth_studio_runs WHERE id=$1', [active.run.id]))[0].status, 'stale');
    const late = await finish(active); assert.equal(late.status, 'stale');
  });

  await check('expired evidence blocks exports even when the stored snapshot exactly matches current evidence', async () => {
    // A historical completed/approved fixture simulates a formerly valid TTL. This
    // privileged setup is confined to the test database; gateway roles cannot do it.
    await db.query("UPDATE public.growth_studio_evidence SET valid_until=now()-interval '1 hour' WHERE id=$1", [evidence.id]);
    const expiredRun = randomUUID();
    await db.query(`INSERT INTO public.growth_studio_runs(id,tenant_id,product_key,brand_id,campaign_id,request_key,
      provider_key,model,input_snapshot,status,review_status,result,reviewed_by,reviewed_at,finished_at,created_by)
      VALUES($1,$2,'merqora',$3,$4,$5,'fixture.writer','fixture-model',
        public.growth_studio_snapshot($2,'merqora',$4)||'{"writerBindingId":null,"classifierBindingId":null}'::jsonb,
        'completed','approved',$6,$7,now()-interval '2 hours',now()-interval '2 hours',$7)`,
    [expiredRun, tenant, input.brandId, campaign.id, randomUUID(), JSON.stringify(generated), owner]);
    assert.equal((await rows(`SELECT (input_snapshot-'writerBindingId'-'classifierBindingId')=
      public.growth_studio_snapshot(tenant_id,product_key,campaign_id) AS same FROM public.growth_studio_runs WHERE id=$1`, [expiredRun]))[0].same, true);
    await response(exportInput(expiredRun), mainCredential, 409);
  });

  console.log(`Growth product gateway: ${passed} verification groups passed.`);
} finally {
  delete globalThis.__growthGatewayDB;
  await db.close();
}
