import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const hosted = [
  "20260723193650", "20260723193737", "20260816120438", "20260816120554", "20260816120613", "20260816120622",
  "20260915180000", "20261001171000", "20261001194500", "20261001201500", "20261001210000", "20261002143000",
  "20261002160000", "20261004170000", "20261008100000", "20261008100500", "20261008183000", "20261008183500",
];
const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
let groups = 0;

async function suite(complete) {
  const db = new PGlite();
  const profile = complete ? "complete repository" : "hosted subset";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE PUBLICATION supabase_realtime;`);
    for (const file of files.filter((name) => complete || hosted.some((prefix) => name.startsWith(prefix)))) {
      if (file.startsWith("20260816120554")) for (const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209", "e66c0525-1787-4250-be26-79f849624521", "890c71b1-cf6e-4b68-a56e-dd6050372481", "97319fe5-82fd-44cd-b27d-6ae314ee368b"]) {
        await db.query("INSERT INTO auth.users(id,email) VALUES($1,'historic-syndriva@example.invalid')", [id]);
      }
      try { await db.exec(await readFile(new URL(file, migrationDir), "utf8")); }
      catch (error) { throw new Error(`${profile}: ${file}: ${error.message}`, { cause: error }); }
    }
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
    const check = async (name, fn) => { await fn(); groups++; console.log(`PASS ${profile}: ${name}`); };
    const denied = (fn, code) => assert.rejects(fn, (error) => !code || error.code === code);
    async function asRole(role, actor, fn) {
      await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [actor ?? "", role]);
      try { const result = await fn(); await db.exec("COMMIT"); return result; }
      catch (error) { await db.exec("ROLLBACK"); throw error; }
    }
    const as = (actor, fn) => asRole("authenticated", actor, fn);
    const service = (fn) => asRole("service_role", null, fn);
    const owner = randomUUID(), viewer = randomUUID(), outsider = randomUUID();
    for (const id of [owner, viewer, outsider]) await db.query("INSERT INTO auth.users(id,email) VALUES($1,'syndriva-fixture@example.invalid')", [id]);
    async function tenant(actor) {
      const id = randomUUID();
      await db.query("INSERT INTO public.organisations(id,name,slug) VALUES($1,'Syndriva fixture',$2)", [id, "syndriva-" + id]);
      await db.query("INSERT INTO public.tenants(id,name,slug,status,organisation_id) VALUES($1,'Syndriva fixture',$2,'active',$1)", [id, "syndriva-" + id]);
      await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'owner')", [id, actor]);
      for (const product of ["syndriva", "merqora"]) await db.query("INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES($1,$2,'active')", [id, product]);
      for (const key of ["omniqora.campaigns", "omniqora.creative"]) await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES($1,$2,'active')", [id, key]);
      return id;
    }
    const t = await tenant(owner), other = await tenant(outsider);
    await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'viewer')", [t, viewer]);
    const makeBrand = (tenantId, actor, product = "syndriva") => as(actor, () => one("SELECT public.growth_studio_save_brand($1,$2,NULL,NULL,$3) value", [tenantId, product, JSON.stringify({
      name: "Catalogue brand", voice: "Clear and factual", offer: "Current catalogue products", rules: [], audience: "Local buyers", locale: "en", disclosure: "",
    })]));
    const brand = await makeBrand(t, owner), otherBrand = await makeBrand(other, outsider), wrongProductBrand = await makeBrand(t, owner, "merqora");
    const list = (actor = owner, brandId = brand.id, tenantId = t, offset = 0) => as(actor, () => one("SELECT public.growth_syndriva_list_sources($1,$2,$3) value", [tenantId, brandId, offset]));
    const ingest = (listingId, actor = owner, brandId = brand.id, tenantId = t) => as(actor, () => one("SELECT public.growth_syndriva_import_source($1,$2,$3) value", [tenantId, brandId, listingId]));
    await check("scope is checked before catalogue access and helpers cannot be called directly", async () => {
      await denied(() => list(outsider), "42501");
      await denied(() => list(owner, otherBrand.id), "P0002");
      await denied(() => list(owner, wrongProductBrand.id), "P0002");
      await denied(() => ingest(randomUUID(), viewer), "42501");
      await denied(() => as(owner, () => one("SELECT public.growth_syndriva_source_snapshot($1,$2) value", [t, randomUUID()])), "42501");
      await denied(() => service(() => one("SELECT public.growth_syndriva_import_source($1,$2,$3) value", [t, brand.id, randomUUID()])), "42501");
    });
    if (!complete) {
      await check("optional commerce schema is reported unavailable without creating source data", async () => {
        const response = await list();
        assert.equal(response.available, false); assert.deepEqual(response.items, []); assert.equal(response.hasMore, false);
        assert.match(response.message, /not installed/);
        assert.equal(await one("SELECT to_regclass('public.marketplace_listings') value"), null);
        await denied(() => ingest(randomUUID()), "55000");
        assert.equal(await one("SELECT count(*)::integer value FROM public.growth_syndriva_sources"), 0);
        assert.equal(await one("SELECT count(*)::integer value FROM public.growth_studio_evidence WHERE tenant_id=$1", [t]), 0);
      });
      return;
    }

    async function vendor(tenantId = t, product = "syndriva", status = "active", brandId = null) {
      const id = randomUUID();
      await db.query("INSERT INTO public.marketplace_vendors(id,tenant_id,product_key,name,vendor_key,status,brand_id,payout_account_ref) VALUES($1::uuid,$2,$3,'Current supplier',$1::uuid::text,$4,$5,'private-payout-reference')", [id, tenantId, product, status, brandId]);
      return id;
    }
    const supplier = await vendor(), foreignSupplier = await vendor(other), pausedSupplier = await vendor(t, "syndriva", "paused");
    async function stock(tenantId = t, product = "syndriva", locationTenant = tenantId, available = 8) {
      const item = randomUUID(), location = randomUUID();
      await db.query("INSERT INTO public.inventory_items(id,tenant_id,product_key,external_ref,name,unit) VALUES($1::uuid,$2,$3,$1::uuid::text,'Current item','each')", [item, tenantId, product]);
      await db.query("INSERT INTO public.inventory_stock_locations(id,tenant_id,product_key,name,location_kind) VALUES($1,$2,$3,'Current warehouse','warehouse')", [location, locationTenant, product]);
      await db.query("INSERT INTO public.inventory_stock_balances(tenant_id,item_id,stock_location_id,on_hand,reserved) VALUES($1,$2,$3,$4,2)", [tenantId, item, location, available + 2]);
      return { item, location };
    }
    const inventory = await stock(), zeroInventory = await stock(t, "syndriva", t, 0), foreignLocation = await stock(t, "syndriva", other), wrongProductStock = await stock(t, "merqora");
    async function listing({ tenantId = t, vendorId = supplier, product = "syndriva", title = "Verified product", status = "active", stock: inventory = null, price = "1250" } = {}) {
      const id = randomUUID();
      await db.query("INSERT INTO public.marketplace_listings(id,tenant_id,product_key,vendor_id,title,description,price_minor,currency,status,inventory_tracked,inventory_item_id,stock_location_id,metadata) VALUES($1,$2,$3,$4,$5,'Recorded cotton product',$6,'GBP',$7,$8,$9,$10,'{\"private_note\":\"Do not export internal notes\"}')",
        [id, tenantId, product, vendorId, title, price, status, !!inventory, inventory?.item ?? null, inventory?.location ?? null]);
      return id;
    }
    const tracked = await listing({ title: "A tracked product", stock: inventory });
    const untracked = await listing({ title: "B untracked product", price: null });
    const badIds = [
      await listing({ title: "Foreign vendor", vendorId: foreignSupplier }),
      await listing({ title: "Paused vendor", vendorId: pausedSupplier }),
      await listing({ title: "Paused listing", status: "paused" }),
      await listing({ title: "Zero inventory", stock: zeroInventory }),
      await listing({ title: "Foreign location", stock: foreignLocation }),
      await listing({ title: "Wrong item product", stock: wrongProductStock }),
      await listing({ title: "Other tenant", tenantId: other, vendorId: foreignSupplier }),
      await listing({ title: "Other product", product: "merqora" }),
    ];
    await check("only same-product active vendors/listings and positive correctly scoped stock are eligible", async () => {
      const response = await list();
      assert.equal(response.available, true);
      assert.deepEqual(response.items.map((item) => item.listingId), [tracked, untracked]);
      assert.equal(response.items[0].priceMinor, "1250"); assert.equal(response.items[0].availableQuantity, "8");
      assert.equal(response.items[1].priceMinor, null); assert.equal(response.items[1].availableQuantity, null);
      assert.equal(response.items[1].inventoryTracked, false);
      for (const id of badIds) await denied(() => ingest(id), "55000");
      assert.equal(JSON.stringify(response).includes("private-payout-reference"), false);
      assert.equal(JSON.stringify(response).includes("private_note"), false);
    });
    await check("vendor brands and physical stock locations cannot cross tenant boundaries", async () => {
      const foreignBrand = randomUUID(), foreignPhysical = randomUUID();
      await db.query("INSERT INTO public.tenant_brands(id,tenant_id,product_key,name,slug) VALUES($1,$2,'syndriva','Foreign brand','foreign-fixture')", [foreignBrand, other]);
      const vendorWithForeignBrand = await vendor(t, "syndriva", "active", foreignBrand);
      const invalid = await listing({ title: "Foreign vendor brand", vendorId: vendorWithForeignBrand });
      await denied(() => ingest(invalid), "55000");
      await db.query("INSERT INTO public.tenant_locations(id,tenant_id,name,code) VALUES($1,$2,'Foreign location','foreign-fixture')", [foreignPhysical, other]);
      await db.query("UPDATE public.inventory_stock_locations SET location_id=$1 WHERE id=$2", [foreignPhysical, inventory.location]);
      await denied(() => ingest(tracked), "55000");
      await db.query("UPDATE public.inventory_stock_locations SET location_id=NULL WHERE id=$1", [inventory.location]);
    });
    let imported;
    await check("canonical import fixes TTL, stores provenance and replays without evidence revision churn", async () => {
      const before = Date.now();
      imported = await ingest(tracked);
      assert.equal(imported.created, true); assert.equal(imported.changed, true); assert.equal(imported.replayed, false);
      assert.equal(imported.evidence.kind, "product_data"); assert.equal(imported.evidence.sourceUrl, null);
      assert.equal(imported.evidence.revision, 1);
      const ttl = Date.parse(imported.evidence.validUntil) - before;
      assert(ttl >= 14.9 * 60_000 && ttl <= 15.1 * 60_000);
      assert(imported.evidence.content.includes('"priceMinor": "1250"'));
      assert.equal(imported.evidence.content.includes("private-payout-reference"), false);
      assert.equal(imported.evidence.content.includes("private_note"), false);
      const source = await one("SELECT to_jsonb(s) value FROM public.growth_syndriva_sources s WHERE evidence_id=$1", [imported.evidence.id]);
      assert.match(source.source_fingerprint, /^[a-f0-9]{64}$/); assert.equal(source.evidence_revision, 1);
      const repeated = await ingest(tracked);
      assert.equal(repeated.replayed, true); assert.equal(repeated.changed, false);
      assert.deepEqual(repeated.evidence, imported.evidence);
      assert.equal((await list()).items.find((item) => item.listingId === tracked).current, true);
      await denied(() => as(owner, () => db.query("UPDATE public.growth_syndriva_sources SET evidence_revision=2 WHERE evidence_id=$1", [imported.evidence.id])), "42501");
    });

    const campaign = await as(owner, () => one("SELECT public.growth_studio_save_campaign($1,'syndriva',NULL,NULL,$2,$3) value", [t, brand.id, JSON.stringify({
      title: "Catalogue campaign", objective: "Explain the recorded current product", channel: "social", locale: "en", evidenceIds: [imported.evidence.id],
    })]));
    const start = () => as(owner, () => one("SELECT public.growth_studio_start_run($1,'syndriva',$2,$3,'fixture-binding',NULL,'ai.openai','fixture-model') value", [t, campaign.id, randomUUID()]));
    const result = () => ({ output: { angle: "A factual product", rationale: "Based on the current catalogue", variants: [{ key: "a", headline: "Current cotton product", body: "Recorded product details for review.", callToAction: "View the product", hashtags: [], evidenceIds: [imported.evidence.id], disclosure: "" }], creativeBrief: { direction: "Show the product", assetTypes: ["copy"] }, warnings: [] },
      checks: [{ key: "evidence_refs", status: "pass" }, { key: "evidence_validity", status: "pass" }, { key: "disclosure", status: "pass" }, { key: "variant_keys", status: "pass" }],
      provider: { providerKey: "ai.openai", model: "fixture-model" } });
    const finish = (run) => service(() => one("SELECT public.growth_studio_finish_run($1,'syndriva',$2,$3,'completed',$4,NULL) value", [t, run.run.id, run.claimToken, JSON.stringify(result())]));
    const review = (run) => as(owner, () => one("SELECT public.growth_studio_review_run($1,'syndriva',$2,$3,'approved','Checked catalogue') value", [t, run.id, run.revision]));
    const handoff = (run) => as(owner, () => one("SELECT public.growth_studio_handoff_run($1,'syndriva',$2,$3) value", [t, run.id, run.revision]));
    const credential = randomUUID();
    await db.query("INSERT INTO public.platform_service_credentials(id,key_id,secret_hash,secret_suffix,scopes) VALUES($1,$2,$3,'fixture',$4)", [credential, "nativefixture_" + randomUUID().replaceAll("-", ""), "a".repeat(64), JSON.stringify([{ tenantId: t, productKey: "syndriva", brandIds: [brand.id], capabilities: ["growth.campaigns.read"] }])]);
    const exportRun = (run) => service(() => one("SELECT public.growth_studio_export_product_campaign($1,$2,'syndriva',$3,$4) value", [credential, t, brand.id, run.id]));

    await check("source changes prevent a provider run from being claimed until refreshed", async () => {
      await db.query("UPDATE public.marketplace_listings SET price_minor=1500 WHERE id=$1", [tracked]);
      assert.equal((await list()).items.find((item) => item.listingId === tracked).current, false);
      await denied(() => start(), "55000");
      assert.equal(await one("SELECT count(*)::integer value FROM public.growth_studio_runs WHERE campaign_id=$1", [campaign.id]), 0);
      imported = await ingest(tracked);
      assert.equal(imported.evidence.revision, 2); assert.equal(imported.created, false); assert.equal(imported.changed, true);
    });
    await check("a source changed during generation cannot complete as a usable draft", async () => {
      const run = await start();
      await db.query("UPDATE public.inventory_stock_balances SET reserved=3 WHERE item_id=$1 AND stock_location_id=$2", [inventory.item, inventory.location]);
      const completed = await finish(run);
      assert.equal(completed.status, "stale"); assert.equal(completed.result, null);
      imported = await ingest(tracked);
    });
    await check("approved output is rechecked for changed price, vendor status and depleted inventory", async () => {
      const approved = await review(await finish(await start()));
      assert.equal((await exportRun(approved)).runId, approved.id);
      for (const mutation of [
        ["UPDATE public.marketplace_listings SET price_minor=1700 WHERE id=$1", [tracked], "UPDATE public.marketplace_listings SET price_minor=1500 WHERE id=$1", [tracked]],
        ["UPDATE public.marketplace_vendors SET status='paused' WHERE id=$1", [supplier], "UPDATE public.marketplace_vendors SET status='active' WHERE id=$1", [supplier]],
        ["UPDATE public.inventory_stock_balances SET on_hand=reserved WHERE item_id=$1 AND stock_location_id=$2", [inventory.item, inventory.location], "UPDATE public.inventory_stock_balances SET on_hand=10 WHERE item_id=$1 AND stock_location_id=$2", [inventory.item, inventory.location]],
      ]) {
        await db.query(mutation[0], mutation[1]);
        await denied(() => exportRun(approved)); await denied(() => handoff(approved));
        await db.query(mutation[2], mutation[3]);
      }
      const handed = await handoff(approved);
      assert(handed.marketingCampaignId); assert(handed.creativeBriefId);
      await db.query("UPDATE public.marketplace_listings SET price_minor=1750 WHERE id=$1", [tracked]);
      await denied(() => exportRun(handed));
      imported = await ingest(tracked);
      await denied(() => exportRun(handed));
    });
    await check("manual edits of linked evidence remain noncurrent until canonical reimport", async () => {
      const e = imported.evidence;
      const edited = await as(owner, () => one("SELECT public.growth_studio_save_evidence($1,'syndriva',$2,$3,$4,$5) value", [t, e.id, e.revision, brand.id, JSON.stringify({ title: e.title, content: "A manually edited product claim.", sourceUrl: null, kind: "product_data", validUntil: new Date(Date.now() + 600_000).toISOString() })]));
      assert.equal((await list()).items.find((item) => item.listingId === tracked).current, false);
      await denied(() => start(), "55000");
      imported = await ingest(tracked);
      assert.equal(imported.evidence.revision, edited.revision + 1);
      assert(imported.evidence.content.includes("Recorded Syndriva catalogue facts"));
      assert.equal((await list()).items.find((item) => item.listingId === tracked).current, true);
    });
    await check("expired snapshots refresh their revision and invalidate unhanded approvals", async () => {
      const approved = await review(await finish(await start()));
      await db.query("UPDATE public.growth_studio_evidence SET valid_until=now()-interval '1 minute' WHERE id=$1", [imported.evidence.id]);
      await denied(() => start(), "55000"); await denied(() => exportRun(approved));
      const priorRevision = imported.evidence.revision;
      imported = await ingest(tracked);
      assert.equal(imported.evidence.revision, priorRevision + 1);
      assert.equal(await one("SELECT status value FROM public.growth_studio_runs WHERE id=$1", [approved.id]), "stale");
      assert.equal(await one("SELECT review_status value FROM public.growth_studio_runs WHERE id=$1", [approved.id]), "pending");
    });
    await check("deleted source records and access revocation fail closed", async () => {
      const ordinary = await ingest(untracked);
      await db.query("DELETE FROM public.marketplace_listings WHERE id=$1", [untracked]);
      const source = await one("SELECT to_jsonb(s) value FROM public.growth_syndriva_sources s WHERE evidence_id=$1", [ordinary.evidence.id]);
      assert(source); await denied(() => ingest(untracked), "55000");
      await db.query("UPDATE public.tenant_products SET status='suspended' WHERE tenant_id=$1 AND product_key='syndriva'", [t]);
      await denied(() => list(), "42501"); await denied(() => ingest(tracked), "42501");
      await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='syndriva'", [t]);
      await db.query("UPDATE public.tenant_services SET valid_until=now()-interval '1 hour' WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [t]);
      await denied(() => ingest(tracked), "42501");
      await db.query("UPDATE public.tenant_services SET valid_until=NULL WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [t]);
    });
    await check("source pagination is bounded and preserves exact large prices", async () => {
      for (let i = 0; i < 26; i++) await listing({ title: "Paged item " + String(i).padStart(2, "0"), price: "9007199254740993" });
      const firstPage = await list(), next = await list(owner, brand.id, t, firstPage.nextOffset);
      assert.equal(firstPage.items.length, 25); assert.equal(firstPage.hasMore, true); assert.equal(firstPage.nextOffset, 25);
      assert.equal(next.hasMore, false);
      const all = [...firstPage.items, ...next.items];
      assert.equal(new Set(all.map((item) => item.listingId)).size, all.length);
      assert(all.filter((item) => item.title.startsWith("Paged")).every((item) => item.priceMinor === "9007199254740993"));
      await denied(() => list(owner, brand.id, t, -1), "22023");
    });
  } finally { await db.close(); }
}

try {
  await suite(false);
  await suite(true);
  console.log(`Syndriva native Growth source verification: ${groups} database groups passed.`);
} catch (error) {
  console.error(error.message, { code: error.code, where: error.where, query: error.query, cause: error.cause?.message });
  process.exitCode = 1;
}
