import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const ts = createRequire(import.meta.url)("typescript");
const commercialSource = await readFile(new URL("../../src/modules/network-expansion/commercial-terms.ts", import.meta.url), "utf8");
const commercialCode = ts.transpileModule(commercialSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { MEALDECK_R2_PRICING } = await import("data:text/javascript;base64," + Buffer.from(commercialCode).toString("base64"));

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const revisionFile = "20261006120000_mealdeck_franchise_pricing_revision.sql";
const version = "2026-10-06-r2";
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for (const name of (await readdir(migrations)).filter(x => x.endsWith(".sql") && x < revisionFile).sort()) {
  const sql = await readFile(new URL(name, migrations), "utf8");
  if (name.startsWith("20260816120554")) for (const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209", "e66c0525-1787-4250-be26-79f849624521", "890c71b1-cf6e-4b68-a56e-dd6050372481", "97319fe5-82fd-44cd-b27d-6ae314ee368b"]) await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, "fixture@example.invalid"]);
  await db.exec(sql);
}

const admin = "77777777-aaaa-4aaa-8aaa-777777777777";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [admin, "pricing-admin@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);
async function asUser(fn) {
  await db.exec("BEGIN;SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin]);
  try { const result = await fn(); await db.exec("COMMIT"); return result; }
  catch (error) { await db.exec("ROLLBACK"); throw error; }
}
const pilot = await asUser(async () => (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const tenant = pilot.tenants.find(x => x.tenantSlug === "mealdeck");
await asUser(() => db.query("SELECT public.network_seed_mealdeck_programme($1)", [tenant.tenantId]));
const programmeId = (await db.query("SELECT id FROM public.network_programmes WHERE tenant_id=$1 AND programme_key='mealdeck-england-wales'", [tenant.tenantId])).rows[0].id;

// This existing location has a negotiated catalogue price and a reservation to preserve.
await db.query("UPDATE public.network_territories SET fee_minor=1234567,status='reserved',is_sellable=false,public_note='Reserved following assessment',metadata=metadata||'{\"negotiationReference\":\"retain-this\"}'::jsonb WHERE programme_id=$1 AND territory_code='MD-003'", [programmeId]);
await db.query("INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,fee_minor,metadata) VALUES($1,$2,'MD-CUSTOM','Custom location','London',1823456,'{\"customLocation\":true}')", [tenant.tenantId, programmeId]);
const territoryId = (await db.query("SELECT id FROM public.network_territories WHERE programme_id=$1 AND territory_code='MD-003'", [programmeId])).rows[0].id;
const acceptedAnswers = { offerVersion: "2026-10-06", offerSnapshot: { royaltyPercent: 5.5, techFeePerOrder: 0.25 }, selectedTerritoryFee: 12345.67, acceptedQuote: "retain-signed-schedule" };
await db.query("INSERT INTO public.network_applications(tenant_id,programme_id,territory_id,applicant_name,email,stage,consent,answers) VALUES($1,$2,$3,'Existing operator','existing@example.invalid','paid',true,$4::jsonb)", [tenant.tenantId, programmeId, territoryId, JSON.stringify(acceptedAnswers)]);
await db.query("INSERT INTO public.network_management_agreements(tenant_id,programme_id,territory_id,management_provider,status,profit_share_bps,profit_basis,terms) VALUES($1,$2,$3,'Existing manager','active',2000,'managed_operating_profit',$4::jsonb)", [tenant.tenantId, programmeId, territoryId, JSON.stringify({ signedFeeSchedule: acceptedAnswers })]);

const otherId = (await db.query("INSERT INTO public.network_programmes(tenant_id,programme_key,name,royalty_bps,marketing_bps,tech_fee_minor_per_order,supply_markup_bps) VALUES($1,'another-network','Other network',333,222,77,444) RETURNING id", [tenant.tenantId])).rows[0].id;
await db.query("INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,fee_minor) VALUES($1,$2,'OTHER-1','Other location','London',876543)", [tenant.tenantId, otherId]);

async function rows(table, where, values) { return (await db.query(`SELECT * FROM public.${table} WHERE ${where} ORDER BY id`, values)).rows; }
const originalTemplates = await rows("network_territory_templates", "template_key=$1", ["mealdeck-england-wales"]);
const originalTerritories = await rows("network_territories", "programme_id=$1", [programmeId]);
const originalApplications = await rows("network_applications", "programme_id=$1", [programmeId]);
const originalAgreements = await rows("network_management_agreements", "programme_id=$1", [programmeId]);
const otherProgrammeBefore = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [otherId])).rows[0];
const otherTerritoriesBefore = await rows("network_territories", "programme_id=$1", [otherId]);

const revision = await readFile(new URL(revisionFile, migrations), "utf8");
await db.exec(revision);
const programme = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [programmeId])).rows[0];
assert.equal(programme.royalty_status, "quote_required");
assert.equal(programme.royalty_bps, null);
assert.equal(programme.fee_min_minor, 375000);
assert.equal(programme.fee_max_minor, 1250000);
assert.equal(programme.marketing_bps, 150);
assert.equal(programme.tech_fee_minor_per_order, 0);
assert.equal(programme.supply_markup_bps, 0);
assert.equal(programme.offer.pricingHistory[version].previousRoyaltyBps, 550);
assert.equal(programme.offer.pricingHistory[version].previousTechFeeMinorPerOrder, 25);
assert.equal(programme.offer.pricing.franchiseFeeVersion, version);
assert.equal(programme.offer.pricing.royaltyPercent, null);
assert.equal(programme.offer.pricing.royaltyDisplay, "To be confirmed in written quote");
assert.equal(programme.offer.pricing.techFeePerMonth, 199);
assert.equal(programme.offer.pricing.accountancyFeePerMonth, 100);
assert.equal(programme.offer.pricing.boughtInSupplyMarkupPercent, 0);
assert.equal(programme.offer.pricing.manufacturedSupplyMarkupPercent, 15);
assert.equal(programme.offer.pricing.manufacturedSupplyCostBasis, "fully_costed_production");
assert.equal(programme.offer.pricing.equipmentOpeningSuppliesEstimate, 15000);
assert.deepEqual(programme.offer.pricing, MEALDECK_R2_PRICING, "the original r2 migration retains its historical service terms");

const revisedTemplates = await rows("network_territory_templates", "template_key=$1", ["mealdeck-england-wales"]);
const revisedTerritories = await rows("network_territories", "programme_id=$1", [programmeId]);
for (const [original, revised] of [[originalTemplates, revisedTemplates], [originalTerritories, revisedTerritories]]) {
  assert.equal(revised.length, original.length);
  const byId = new Map(revised.map(row => [row.id, row]));
  for (const prior of original) {
    const current = byId.get(prior.id);
    assert.equal(current.fee_minor, Math.round(prior.fee_minor / 2), prior.territory_code + " is halved from its own prior price");
    assert.equal(current.metadata.franchiseFeeVersion, version);
    assert.equal(current.metadata.franchiseFeeRevisions[version].previousFeeMinor, prior.fee_minor);
    assert.equal(current.metadata.franchiseFeeRevisions[version].revisedFeeMinor, current.fee_minor);
    for (const key of ["name", "region", "status", "is_sellable", "is_public", "public_note", "protected_geojson", "operator_tenant_id"]) assert.deepEqual(current[key], prior[key], key + " is preserved");
  }
}
assert.equal(revisedTemplates.length, 150);
assert.deepEqual([...new Set(revisedTemplates.map(row => row.fee_minor))].sort((a, b) => a - b), [375000, 500000, 625000, 750000, 875000, 1000000, 1125000, 1250000]);
assert.equal(revisedTerritories.find(row => row.territory_code === "MD-003").fee_minor, 617284);
assert.equal(revisedTerritories.find(row => row.territory_code === "MD-CUSTOM").fee_minor, 911728);
assert.deepEqual(await rows("network_applications", "programme_id=$1", [programmeId]), originalApplications);
assert.deepEqual(await rows("network_management_agreements", "programme_id=$1", [programmeId]), originalAgreements);
const otherProgrammeAfter = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [otherId])).rows[0];
assert.deepEqual(otherProgrammeAfter, { ...otherProgrammeBefore, royalty_status: "agreed" });
assert.deepEqual(await rows("network_territories", "programme_id=$1", [otherId]), otherTerritoriesBefore);

// Replaying the migration and seed leaves prior reductions, metadata and accepted snapshots intact.
await db.exec(revision);
await asUser(() => db.query("SELECT public.network_seed_mealdeck_programme($1)", [tenant.tenantId]));
assert.deepEqual(await rows("network_territory_templates", "template_key=$1", ["mealdeck-england-wales"]), revisedTemplates);
assert.deepEqual(await rows("network_territories", "programme_id=$1", [programmeId]), revisedTerritories);
assert.deepEqual((await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [programmeId])).rows[0], programme);

// A later authorised custom price survives reseeding. A new unmarked row is not assumed to be legacy.
await db.query("UPDATE public.network_territories SET fee_minor=777777 WHERE id=$1", [territoryId]);
await db.query("INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,fee_minor) VALUES($1,$2,'MD-UNMARKED','Unmarked later import','London',600000)", [tenant.tenantId, programmeId]);
await db.exec(revision);
await asUser(() => db.query("SELECT public.network_seed_mealdeck_programme($1)", [tenant.tenantId]));
assert.equal((await db.query("SELECT fee_minor FROM public.network_territories WHERE id=$1", [territoryId])).rows[0].fee_minor, 777777);
const unmarked = (await db.query("SELECT fee_minor,metadata FROM public.network_territories WHERE programme_id=$1 AND territory_code='MD-UNMARKED'", [programmeId])).rows[0];
assert.equal(unmarked.fee_minor, 600000);
assert.equal(unmarked.metadata.franchiseFeeVersion, undefined);
assert.deepEqual(await rows("network_applications", "programme_id=$1", [programmeId]), originalApplications);
assert.deepEqual(await rows("network_management_agreements", "programme_id=$1", [programmeId]), originalAgreements);
await assert.rejects(() => db.query("UPDATE public.network_programmes SET royalty_bps=550 WHERE id=$1", [programmeId]), /network_programmes_royalty_state_check/);

await db.close();
console.log("MealDeck current-offer repricing, audit history, idempotency, custom prices and signed-schedule preservation verified");
