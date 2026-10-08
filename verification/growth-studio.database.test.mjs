import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE PUBLICATION supabase_realtime;`);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    if (name.startsWith("20260816120554")) {
      for (const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209", "e66c0525-1787-4250-be26-79f849624521", "890c71b1-cf6e-4b68-a56e-dd6050372481", "97319fe5-82fd-44cd-b27d-6ae314ee368b"]) {
        await db.query("INSERT INTO auth.users(id,email) VALUES($1,'growth-fixture@example.invalid')", [id]);
      }
    }
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  const owner = randomUUID(), otherOwner = randomUUID(), agent = randomUUID(), viewer = randomUUID();
  for (const id of [owner, otherOwner, agent, viewer]) {
    await db.query("INSERT INTO auth.users(id,email) VALUES($1,'growth-fixture@example.invalid')", [id]);
  }
  async function asRole(role, actor, fn) {
    await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor ?? ""]);
    try { const result = await fn(); await db.exec("COMMIT"); return result; }
    catch (error) { await db.exec("ROLLBACK"); throw error; }
  }
  const as = (actor, fn) => asRole("authenticated", actor, fn);
  const service = (fn) => asRole("service_role", null, fn);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const denied = async (fn, code) => {
    await assert.rejects(fn, (error) => !code || error.code === code);
    checks++;
  };
  const tenant = (await as(owner, () => one("SELECT public.create_my_tenant('Growth fixture','growth-fixture') value"))).id;
  const otherTenant = (await as(otherOwner, () => one("SELECT public.create_my_tenant('Other growth','other-growth') value"))).id;
  for (const [actor, role] of [[agent, "agent"], [viewer, "viewer"]]) {
    await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,$3)", [tenant, actor, role]);
  }
  const workspace = (tenantId = tenant, product = "omniqora") => one("SELECT public.growth_studio_workspace($1,$2) value", [tenantId, product]);
  const brandData = { name: "Example brand", voice: "Clear and helpful", offer: "Fresh products", rules: ["Use only supplied evidence"], audience: "Local customers", locale: "en", disclosure: "" };
  const saveBrand = (data = brandData, id = null, revision = null, product = "omniqora", tenantId = tenant) =>
    one("SELECT public.growth_studio_save_brand($1,$2,$3,$4,$5) value", [tenantId, product, id, revision, data]);
  const evidenceData = { title: "Verified product description", content: "The listed product is a cotton hoodie.", sourceUrl: "https://example.invalid/product", kind: "product_data", validUntil: "2099-01-01T00:00:00Z" };
  const saveEvidence = (brandId, data = evidenceData, id = null, revision = null, product = "omniqora", tenantId = tenant) =>
    one("SELECT public.growth_studio_save_evidence($1,$2,$3,$4,$5,$6) value", [tenantId, product, id, revision, brandId, data]);
  const campaignData = (evidenceIds) => ({ title: "New product launch", objective: "Explain the product to existing customers", channel: "social", locale: "en", evidenceIds });
  const saveCampaign = (brandId, data, id = null, revision = null, product = "omniqora", tenantId = tenant) =>
    one("SELECT public.growth_studio_save_campaign($1,$2,$3,$4,$5,$6) value", [tenantId, product, id, revision, brandId, data]);
  const start = (campaignId, requestKey = randomUUID(), product = "omniqora", model = "fixture-model") =>
    one("SELECT public.growth_studio_start_run($1,$2,$3,$4,'fixture-writer',NULL,'ai.openai',$5) value", [tenant, product, campaignId, requestKey, model]);
  const finish = (claimed, result, status = "completed", token = claimed.claimToken) =>
    one("SELECT public.growth_studio_finish_run($1,$2,$3,$4,$5,$6,$7) value", [claimed.run.tenantId, claimed.run.productKey, claimed.run.id, token, status, result, status === "failed" ? "Provider unavailable" : null]);
  const review = (run, decision = "approved", revision = run.revision) =>
    one("SELECT public.growth_studio_review_run($1,$2,$3,$4,$5,'Reviewed source and disclosure') value", [run.tenantId, run.productKey, run.id, revision, decision]);
  const handoff = (run, revision = run.revision) =>
    one("SELECT public.growth_studio_handoff_run($1,$2,$3,$4) value", [run.tenantId, run.productKey, run.id, revision]);
  const resultFor = (evidenceId, disclosure = "") => ({
    output: { angle: "Product introduction", rationale: "Use the supplied product fact", variants: [{ key: "one", headline: "A cotton hoodie", body: "Discover the cotton hoodie from Example brand.", callToAction: "Explore the product", hashtags: ["#Product"], evidenceIds: [evidenceId], disclosure }], creativeBrief: { direction: "Use the supplied product photo and readable type", assetTypes: ["copy", "image"] }, warnings: [] },
    checks: [{ key: "evidence", label: "Evidence", status: "pass", detail: "All references match supplied records" }],
    provider: { providerKey: "ai.openai", model: "fixture-model", usage: { inputTokens: 25, outputTokens: 40 } },
  });

  // Catalogue creation does not activate any new tenant products or services.
  await denied(() => as(owner, () => workspace()), "42501");
  await db.query("INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES($1,'omniqora','requested')", [tenant]);
  await denied(() => as(owner, () => saveBrand()), "42501");
  await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1", [tenant]);
  await denied(() => as(owner, () => saveBrand()), "42501");
  await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status,valid_from) VALUES($1,'omniqora.campaigns','trial',now()+interval '1 day')", [tenant]);
  await denied(() => as(owner, () => workspace()), "42501");
  await db.query("UPDATE public.tenant_services SET valid_from=now()-interval '1 day' WHERE tenant_id=$1", [tenant]);
  for (const product of ["syndriva", "merqora", "affivon"]) {
    await db.query("INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES($1,$2,'active')", [tenant, product]);
  }
  await db.query("INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES($1,'omniqora','active')", [otherTenant]);
  await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.campaigns','active')", [otherTenant]);
  assert.equal((await as(viewer, () => workspace())).brands.length, 0); checks++;
  await denied(() => as(viewer, () => saveBrand()), "42501");
  await denied(() => as(otherOwner, () => workspace()), "42501");
  await denied(() => as(owner, () => db.query("INSERT INTO public.growth_studio_brands(tenant_id,product_key,name,created_by) VALUES($1,'omniqora','Bypass',$2)", [tenant, owner])), "42501");

  const brand = await as(agent, () => saveBrand());
  const otherBrand = await as(otherOwner, () => saveBrand(brandData, null, null, "omniqora", otherTenant));
  const sameTenantOtherBrand = await as(owner, () => saveBrand({ ...brandData, name: "Second brand" }));
  await denied(() => as(agent, () => saveEvidence(otherBrand.id)), "P0002");
  await denied(() => as(agent, () => saveEvidence(brand.id, { ...evidenceData, validUntil: null })), "23514");
  await denied(() => as(agent, () => saveEvidence(brand.id, { ...evidenceData, validUntil: "2000-01-01T00:00:00Z" })), "22023");
  await denied(() => as(agent, () => saveEvidence(brand.id, { ...evidenceData, sourceUrl: "javascript:alert(1)" })), "23514");
  const evidence = await as(agent, () => saveEvidence(brand.id));
  const unrelatedEvidence = await as(agent, () => saveEvidence(sameTenantOtherBrand.id));
  await denied(() => as(agent, () => saveCampaign(brand.id, campaignData([unrelatedEvidence.id]))), "23503");
  await denied(() => as(agent, () => saveCampaign(brand.id, campaignData([]))), "22023");
  const campaign = await as(agent, () => saveCampaign(brand.id, campaignData([evidence.id])));
  assert.deepEqual(campaign.evidenceIds, [evidence.id]); checks++;
  await denied(() => db.query("INSERT INTO public.growth_studio_campaign_evidence(campaign_id,evidence_id,brand_id,tenant_id,product_key) VALUES($1,$2,$3,$4,'omniqora')", [campaign.id, unrelatedEvidence.id, brand.id, tenant]), "23503");
  await denied(() => as(agent, () => one("SELECT public.growth_studio_snapshot($1,'omniqora',$2) value", [tenant, campaign.id])), "42501");
  await denied(() => as(agent, () => saveBrand(brandData, brand.id, 999)), "40001");
  await denied(() => as(agent, () => saveEvidence(brand.id, evidenceData, evidence.id, null)), "40001");
  await denied(() => as(agent, () => saveCampaign(brand.id, campaignData([evidence.id]), campaign.id, null)), "40001");
  await denied(() => as(agent, () => db.query("UPDATE public.growth_studio_evidence SET content='Changed without revision' WHERE id=$1", [evidence.id])), "42501");

  const key = randomUUID();
  const claimed = await as(agent, () => start(campaign.id, key));
  assert.equal(claimed.created, true); assert(claimed.claimToken); assert.equal(claimed.run.status, "running");
  assert.equal(claimed.run.inputSnapshot.writerBindingId, "fixture-writer");
  assert.equal(claimed.run.inputSnapshot.brand.id, brand.id); checks++;
  const repeated = await as(agent, () => start(campaign.id, key));
  assert.equal(repeated.created, false); assert.equal(repeated.claimToken, null); assert.equal(repeated.run.id, claimed.run.id); checks++;
  await denied(() => as(agent, () => start(campaign.id)), "55000");
  await denied(() => as(agent, () => start(campaign.id, key, "omniqora", "different-model")), "23505");
  await denied(() => as(agent, () => db.query("SELECT execution_token FROM public.growth_studio_runs WHERE id=$1", [claimed.run.id])), "42501");
  await denied(() => as(agent, () => finish(claimed, resultFor(evidence.id))), "42501");
  await denied(() => service(() => finish(claimed, resultFor(evidence.id), "completed", randomUUID())), "42501");
  for (const provider of [
    undefined, null, {},
    { providerKey: "ai.anthropic", model: "fixture-model" },
    { providerKey: "ai.openai", model: "different-model" },
    { providerKey: null, model: "fixture-model" },
    { providerKey: "ai.openai", model: null },
  ]) {
    await denied(() => service(() => finish(claimed, { ...resultFor(evidence.id), provider })), "23514");
  }
  assert.equal((await db.query("SELECT status FROM public.growth_studio_runs WHERE id=$1", [claimed.run.id])).rows[0].status, "running"); checks++;
  await denied(() => service(() => start(campaign.id)), "42501");
  await denied(() => service(() => db.query("UPDATE public.growth_studio_runs SET result='{}' WHERE id=$1", [claimed.run.id])), "42501");
  await denied(() => db.query("UPDATE public.growth_studio_runs SET input_snapshot='{}' WHERE id=$1", [claimed.run.id]), "23514");
  await denied(() => as(owner, () => one("SELECT public.growth_studio_get_run($1,'merqora',$2) value", [tenant, claimed.run.id])), "P0002");
  const completed = await service(() => finish(claimed, resultFor(evidence.id)));
  assert.equal(completed.status, "completed"); assert.equal(completed.reviewStatus, "pending"); assert.equal(completed.revision, 2); checks++;
  const reFinished = await service(() => finish(claimed, resultFor(unrelatedEvidence.id)));
  assert.deepEqual(reFinished.result, completed.result); checks++;
  await denied(() => as(agent, () => review(completed)), "42501");
  await denied(() => as(owner, () => review(completed, "approved", 1)), "40001");
  await denied(() => as(owner, () => handoff(completed)), "42501");
  await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,'omniqora.creative','active')", [tenant]);
  await denied(() => as(owner, () => handoff(completed)), "22023");
  const approved = await as(owner, () => review(completed));
  // A failure in the second draft insert must roll back the first and leave no handoff receipt.
  await db.exec(`CREATE FUNCTION public.growth_fixture_fail_creative() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fixture creative storage failure' USING ERRCODE='23514'; END; $$;
    CREATE TRIGGER growth_fixture_fail_creative AFTER INSERT ON public.creative_briefs
      FOR EACH ROW EXECUTE FUNCTION public.growth_fixture_fail_creative();`);
  await denied(() => as(owner, () => handoff(approved)), "23514");
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.marketing_campaigns WHERE content->>'growthRunId'=$1", [approved.id])).rows[0].count, 0);
  assert.equal((await db.query("SELECT marketing_campaign_id FROM public.growth_studio_runs WHERE id=$1", [approved.id])).rows[0].marketing_campaign_id, null); checks++;
  await db.exec("DROP TRIGGER growth_fixture_fail_creative ON public.creative_briefs; DROP FUNCTION public.growth_fixture_fail_creative();");
  const handedOff = await as(owner, () => handoff(approved));
  assert(handedOff.marketingCampaignId); assert(handedOff.creativeBriefId); checks++;
  const handoffAgain = await as(owner, () => handoff(approved));
  assert.deepEqual(handoffAgain, handedOff); checks++;
  const marketing = (await db.query("SELECT * FROM public.marketing_campaigns WHERE id=$1", [handedOff.marketingCampaignId])).rows[0];
  const creative = (await db.query("SELECT * FROM public.creative_briefs WHERE id=$1", [handedOff.creativeBriefId])).rows[0];
  assert.equal(marketing.status, "draft"); assert.equal(marketing.sent_count, 0); assert.equal(marketing.content.intendedChannel, "social");
  assert.deepEqual(marketing.content.output, completed.result.output);
  assert.equal(creative.status, "draft"); assert.equal(creative.campaign_id, marketing.id);
  for (const text of [completed.result.output.variants[0].headline, completed.result.output.variants[0].body, completed.result.output.variants[0].callToAction]) assert(creative.message.includes(text)); checks++;
  await denied(() => as(owner, () => review(handedOff, "rejected")), "22023");
  await denied(() => db.query("UPDATE public.growth_studio_runs SET note='Tampered handoff' WHERE id=$1", [handedOff.id]), "23514");
  await as(otherOwner, async () => {
    assert.equal((await db.query("SELECT id FROM public.growth_studio_runs WHERE tenant_id=$1", [tenant])).rows.length, 0);
    assert.equal((await db.query("SELECT id FROM public.growth_studio_brands WHERE tenant_id=$1", [tenant])).rows.length, 0);
    assert.equal((await db.query("SELECT id FROM public.growth_studio_evidence WHERE tenant_id=$1", [tenant])).rows.length, 0);
  }); checks++;

  // Output review enforces evidence membership independently of the model/runtime.
  const invalidClaim = await as(agent, () => start(campaign.id));
  const invalidComplete = await service(() => finish(invalidClaim, resultFor(unrelatedEvidence.id)));
  await denied(() => as(owner, () => review(invalidComplete)), "23503");
  const failedCheckClaim = await as(agent, () => start(campaign.id));
  const failedCheckResult = resultFor(evidence.id); failedCheckResult.checks[0].status = "fail";
  const failedCheckComplete = await service(() => finish(failedCheckClaim, failedCheckResult));
  await denied(() => as(owner, () => review(failedCheckComplete)), "22023");

  // Source changes while a provider runs make its eventual result unusable.
  const staleClaim = await as(agent, () => start(campaign.id));
  const revisedEvidence = await as(agent, () => saveEvidence(brand.id, { ...evidenceData, content: "The product is cotton in blue." }, evidence.id, evidence.revision));
  const staleResult = await service(() => finish(staleClaim, resultFor(evidence.id)));
  assert.equal(staleResult.status, "stale"); assert.equal(staleResult.result, null); checks++;
  await denied(() => as(owner, () => review(staleResult)), "22023");
  assert.equal((await as(owner, () => workspace())).runs.find((run) => run.id === handedOff.id).status, "completed"); checks++;

  const revokeClaim = await as(agent, () => start(campaign.id));
  await db.query("DELETE FROM public.tenant_members WHERE tenant_id=$1 AND user_id=$2", [tenant, agent]);
  const revokedFinish = await service(() => finish(revokeClaim, resultFor(evidence.id)));
  assert.equal(revokedFinish.status, "stale"); assert.equal(revokedFinish.result, null); checks++;
  await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'agent')", [tenant, agent]);

  const expiryClaim = await as(agent, () => start(campaign.id));
  await db.query("UPDATE public.growth_studio_evidence SET valid_until=now()-interval '1 second' WHERE id=$1", [evidence.id]);
  const expiredFinish = await service(() => finish(expiryClaim, resultFor(evidence.id)));
  assert.equal(expiredFinish.status, "stale"); checks++;
  const blockedExpired = await as(agent, () => start(campaign.id));
  assert.equal(blockedExpired.run.status, "blocked"); assert.equal(blockedExpired.claimToken, null); checks++;
  await as(agent, () => saveEvidence(brand.id, evidenceData, evidence.id, revisedEvidence.revision));

  // Affiliate disclosures are mandatory and cannot be removed by provider output.
  await denied(() => as(owner, () => saveBrand(brandData, null, null, "affivon")), "23514");
  const affiliateBrand = await as(owner, () => saveBrand({ ...brandData, disclosure: "We may earn a commission from this link." }, null, null, "affivon"));
  const affiliateEvidence = await as(owner, () => saveEvidence(affiliateBrand.id, { ...evidenceData, kind: "affiliate_offer" }, null, null, "affivon"));
  const affiliateCampaign = await as(owner, () => saveCampaign(affiliateBrand.id, campaignData([affiliateEvidence.id]), null, null, "affivon"));
  const missingDisclosureClaim = await as(owner, () => start(affiliateCampaign.id, randomUUID(), "affivon"));
  const missingDisclosure = await service(() => finish(missingDisclosureClaim, resultFor(affiliateEvidence.id)));
  await denied(() => as(owner, () => review(missingDisclosure)), "22023");
  const affiliateClaim = await as(owner, () => start(affiliateCampaign.id, randomUUID(), "affivon"));
  const affiliateComplete = await service(() => finish(affiliateClaim, resultFor(affiliateEvidence.id, affiliateBrand.disclosure)));
  const affiliateApproved = await as(owner, () => review(affiliateComplete));
  const affiliateHandoff = await as(owner, () => handoff(affiliateApproved));
  assert((await db.query("SELECT message FROM public.creative_briefs WHERE id=$1", [affiliateHandoff.creativeBriefId])).rows[0].message.includes(affiliateBrand.disclosure)); checks++;

  // A crashed worker has a durable timeout; reads reconcile it without an actual wait.
  const expiredId = (await db.query(`INSERT INTO public.growth_studio_runs(tenant_id,product_key,brand_id,campaign_id,request_key,
      provider_key,model,input_snapshot,created_by,created_at,lease_expires_at)
    VALUES($1,'omniqora',$2,$3,$4,'ai.openai','fixture-model',
      public.growth_studio_snapshot($1,'omniqora',$3)||'{"writerBindingId":null,"classifierBindingId":null}'::jsonb,
      $5,now()-interval '10 minutes',now()-interval '5 minutes') RETURNING id`, [tenant, brand.id, campaign.id, randomUUID(), owner])).rows[0].id;
  const expiredRun = await as(viewer, () => one("SELECT public.growth_studio_get_run($1,'omniqora',$2) value", [tenant, expiredId]));
  assert.equal(expiredRun.status, "failed"); assert.match(expiredRun.error, /timed out/); checks++;

  // One tenant/product's daily limit is enforced inside the same claim transaction.
  const existingCount = Number((await db.query("SELECT count(*) AS count FROM public.growth_studio_runs WHERE tenant_id=$1 AND product_key='omniqora' AND created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')", [tenant])).rows[0].count);
  for (let index = existingCount; index < 30; index++) {
    const limitClaim = await as(owner, () => start(campaign.id));
    await service(() => finish(limitClaim, null, "failed"));
  }
  await denied(() => as(owner, () => start(campaign.id)), "54000");
  assert.equal((await as(owner, () => workspace(tenant, "affivon"))).runs.length, 2); checks++;

  // Handoff copies follow the source boundary without changing unrelated engine rows.
  const manualMarketing = await as(owner, () => one("INSERT INTO public.marketing_campaigns(tenant_id,product_key,name,channel) VALUES($1,'omniqora','Unrelated campaign','email') RETURNING id value", [tenant]));
  const manualCreative = await as(owner, () => one("INSERT INTO public.creative_briefs(tenant_id,product_key,objective,audience,message) VALUES($1,'omniqora','Unrelated brief','Customers','Unrelated creative content') RETURNING id value", [tenant]));
  const assertHandoffRead = (marketingCount, creativeCount) => as(viewer, async () => {
    assert.equal((await db.query("SELECT content FROM public.marketing_campaigns WHERE id=$1", [handedOff.marketingCampaignId])).rows.length, marketingCount);
    assert.equal((await db.query("SELECT message FROM public.creative_briefs WHERE id=$1", [handedOff.creativeBriefId])).rows.length, creativeCount);
    assert.equal((await db.query("SELECT id FROM public.marketing_campaigns WHERE id=$1", [manualMarketing])).rows.length, 1);
    assert.equal((await db.query("SELECT id FROM public.creative_briefs WHERE id=$1", [manualCreative])).rows.length, 1);
  });
  await assertHandoffRead(1, 1); checks++;
  // These editable labels are deliberately removed. Only the immutable receipt may grant access.
  await as(owner, () => db.query("UPDATE public.marketing_campaigns SET content=content-'source'-'growthRunId' WHERE id=$1", [handedOff.marketingCampaignId]));
  await as(owner, () => db.query("UPDATE public.creative_briefs SET campaign_ref='Edited campaign label' WHERE id=$1", [handedOff.creativeBriefId]));
  await assertHandoffRead(1, 1); checks++;
  await db.query("UPDATE public.tenant_services SET status='suspended' WHERE tenant_id=$1 AND service_key='omniqora.creative'", [tenant]);
  await assertHandoffRead(1, 0); checks++;
  await db.query("UPDATE public.tenant_services SET status='active',valid_from=now()+interval '1 day' WHERE tenant_id=$1 AND service_key='omniqora.creative'", [tenant]);
  await assertHandoffRead(1, 0); checks++;
  await db.query("UPDATE public.tenant_services SET valid_from=now()-interval '1 day' WHERE tenant_id=$1 AND service_key='omniqora.creative'", [tenant]);
  await assertHandoffRead(1, 1); checks++;

  await db.query("UPDATE public.tenant_services SET status='suspended' WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [tenant]);
  await denied(() => as(owner, () => workspace()), "42501");
  await as(owner, async () => assert.equal((await db.query("SELECT id FROM public.growth_studio_runs WHERE tenant_id=$1", [tenant])).rows.length, 0)); checks++;
  await assertHandoffRead(0, 0); checks++;
  await as(owner, async () => {
    assert.equal((await db.query("UPDATE public.marketing_campaigns SET content='{}'::jsonb WHERE id=$1 RETURNING id", [handedOff.marketingCampaignId])).rows.length, 0);
    assert.equal((await db.query("UPDATE public.creative_briefs SET campaign_ref='Attempted marker escape' WHERE id=$1 RETURNING id", [handedOff.creativeBriefId])).rows.length, 0);
  }); checks++;
  await db.query("UPDATE public.tenant_services SET status='active',valid_until=now()-interval '1 day' WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [tenant]);
  await denied(() => as(owner, () => saveBrand()), "42501");
  await assertHandoffRead(0, 0); checks++;
  await db.query("UPDATE public.tenant_services SET valid_until=NULL WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [tenant]);
  await db.query("UPDATE public.tenant_products SET status='suspended' WHERE tenant_id=$1 AND product_key='omniqora'", [tenant]);
  await denied(() => as(owner, () => workspace()), "42501");
  await assertHandoffRead(0, 0); checks++;
  const assertStudioRowsHidden = () => as(owner, async () => {
    for (const table of ["growth_studio_brands", "growth_studio_evidence", "growth_studio_campaigns", "growth_studio_campaign_evidence"]) {
      assert.equal((await db.query(`SELECT tenant_id FROM public.${table} WHERE tenant_id=$1 AND product_key='omniqora'`, [tenant])).rows.length, 0);
    }
    assert.equal((await db.query("SELECT input_snapshot,result FROM public.growth_studio_runs WHERE tenant_id=$1 AND product_key='omniqora'", [tenant])).rows.length, 0);
  });
  await assertStudioRowsHidden(); checks++;
  assert.equal((await as(owner, () => workspace(tenant, "affivon"))).runs.length, 2); checks++;
  await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='omniqora'", [tenant]);
  await db.query("UPDATE public.tenants SET status='suspended' WHERE id=$1", [tenant]);
  await denied(() => as(owner, () => workspace()), "42501");
  await assertHandoffRead(0, 0); checks++;
  await assertStudioRowsHidden(); checks++;
  console.log(`${checks} Growth Studio database checks passed: scoped access, source revisions, durable/idempotent provider runs, stale results, review, disclosures, quotas and atomic draft handoff.`);
} finally {
  await db.close();
}
