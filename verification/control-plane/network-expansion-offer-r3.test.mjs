import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const ts = createRequire(import.meta.url)("typescript");
const commercialSource = await readFile(new URL("../../src/modules/network-expansion/commercial-terms.ts", import.meta.url), "utf8");
const commercialCode = ts.transpileModule(commercialSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { MEALDECK_CURRENT_PRICING, MEALDECK_CURRENT_OFFER, MEALDECK_R2_PRICING } = await import("data:text/javascript;base64," + Buffer.from(commercialCode).toString("base64"));

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const revisionFile = "20261006133000_mealdeck_technology_and_upfront_package.sql";
const version = "2026-10-06-r3";
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for (const name of (await readdir(migrations)).filter(x => x.endsWith(".sql") && x < revisionFile).sort()) {
  const sql = await readFile(new URL(name, migrations), "utf8");
  if (name.startsWith("20260816120554")) for (const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209", "e66c0525-1787-4250-be26-79f849624521", "890c71b1-cf6e-4b68-a56e-dd6050372481", "97319fe5-82fd-44cd-b27d-6ae314ee368b"]) await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, "fixture@example.invalid"]);
  await db.exec(sql);
}

const admin = "77777777-aaaa-4aaa-8aaa-777777777777";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [admin, "offer-admin@example.invalid"]);
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
const seeded = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [programmeId])).rows[0];
assert.deepEqual(seeded.offer.pricing, MEALDECK_R2_PRICING);
assert.equal(seeded.tech_fee_minor_per_order, 0);

// Existing r2 prices, reservations, agreement schedules and application snapshots are immutable here.
await db.query("UPDATE public.network_territories SET fee_minor=777777,status='reserved',is_sellable=false,public_note='Retain this reservation',metadata=metadata||'{\"negotiationReference\":\"retain-this\"}'::jsonb WHERE programme_id=$1 AND territory_code='MD-003'", [programmeId]);
await db.query("INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,fee_minor) VALUES($1,$2,'MD-UNMARKED','Later unverified import','London',600000)", [tenant.tenantId, programmeId]);
const territoryId = (await db.query("SELECT id FROM public.network_territories WHERE programme_id=$1 AND territory_code='MD-003'", [programmeId])).rows[0].id;
const acceptedAnswers = { offerVersion: "2026-10-06-r2", offerSnapshot: MEALDECK_R2_PRICING, selectedTerritoryFee: 7777.77, acceptedQuote: "retain-signed-schedule" };
await db.query("INSERT INTO public.network_applications(tenant_id,programme_id,territory_id,applicant_name,email,stage,consent,answers) VALUES($1,$2,$3,'Existing operator','existing@example.invalid','paid',true,$4::jsonb)", [tenant.tenantId, programmeId, territoryId, JSON.stringify(acceptedAnswers)]);
await db.query("INSERT INTO public.network_management_agreements(tenant_id,programme_id,territory_id,management_provider,status,profit_share_bps,profit_basis,terms) VALUES($1,$2,$3,'Existing manager','active',2000,'managed_operating_profit',$4::jsonb)", [tenant.tenantId, programmeId, territoryId, JSON.stringify({ signedFeeSchedule: acceptedAnswers })]);
const retainedHistory = { "2026-10-06-r2": { originalTerms: "retain prior fee revision history" } };
const featuredMarkets = [{ name: "Existing operator allocation", status: "reserved" }];
await db.query("UPDATE public.network_programmes SET offer=offer||$2::jsonb WHERE id=$1", [programmeId, JSON.stringify({ pricingHistory: retainedHistory, featuredMarkets, internalReference: "retain-internal-offer-reference" })]);
const otherId = (await db.query("INSERT INTO public.network_programmes(tenant_id,programme_key,name,royalty_bps,marketing_bps,tech_fee_minor_per_order,supply_markup_bps) VALUES($1,'another-network','Other network',333,222,77,444) RETURNING id", [tenant.tenantId])).rows[0].id;

async function rows(table, where, values) { return (await db.query(`SELECT * FROM public.${table} WHERE ${where} ORDER BY id`, values)).rows; }
async function protectedRows() {
  return {
    templates: await rows("network_territory_templates", "template_key=$1", ["mealdeck-england-wales"]),
    territories: await rows("network_territories", "programme_id=$1", [programmeId]),
    applications: await rows("network_applications", "programme_id=$1", [programmeId]),
    agreements: await rows("network_management_agreements", "programme_id=$1", [programmeId]),
    otherProgramme: await rows("network_programmes", "id=$1", [otherId]),
  };
}
const before = await protectedRows();
const previousProgramme = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [programmeId])).rows[0];
const revision = await readFile(new URL(revisionFile, migrations), "utf8");
await db.exec(revision);
const programme = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [programmeId])).rows[0];
assert.equal(programme.tech_fee_minor_per_order, 35);
assert.deepEqual(programme.offer.pricing, MEALDECK_CURRENT_PRICING, "SQL migration and public/bootstrap terms agree");
assert.equal(programme.offer.pricing.offerVersion, version);
assert.equal(programme.offer.pricing.franchiseFeeVersion, "2026-10-06-r2");
assert.equal("techFeePerMonth" in programme.offer.pricing, false);
assert.equal("equipmentOpeningSuppliesEstimate" in programme.offer.pricing, false);
assert.equal(programme.royalty_bps, null);
assert.equal(programme.royalty_status, "quote_required");
const { offer: _previousOffer, updated_at: _previousUpdatedAt, tech_fee_minor_per_order: _previousTech, ...unchangedBefore } = previousProgramme;
const { offer: _offer, updated_at: _updatedAt, tech_fee_minor_per_order: _tech, ...unchangedAfter } = programme;
assert.deepEqual(unchangedAfter, unchangedBefore, "all programme fee bounds, royalties, marketing and other decisions stay unchanged");
assert.deepEqual(programme.offer.featuredMarkets, featuredMarkets);
assert.equal(programme.offer.internalReference, previousProgramme.offer.internalReference);
assert.deepEqual(programme.offer.pricingHistory["2026-10-06-r2"], retainedHistory["2026-10-06-r2"]);
assert.deepEqual(programme.offer.pricingHistory[version].previousPricing, previousProgramme.offer.pricing);
const { pricingHistory: _previousHistory, ...previousOfferWithoutHistory } = previousProgramme.offer;
assert.deepEqual(programme.offer.pricingHistory[version].previousOffer, previousOfferWithoutHistory);
assert.equal(programme.offer.pricingHistory[version].previousTechFeeMinorPerOrder, 0);
assert.ok(programme.offer.pricingHistory[version].appliedAt);
for (const key of ["brands", "positioning", "franchisorProvides", "franchiseeFunds", "operatorResponsibilities"]) assert.deepEqual(programme.offer[key], MEALDECK_CURRENT_OFFER[key]);
assert.deepEqual(await protectedRows(), before, "no template or actual fee, reservation, metadata, snapshot, agreement or other network is modified");

// Replaying r3 and reseeding must not halve fees again or create another history entry.
await db.exec(revision);
await asUser(() => db.query("SELECT public.network_seed_mealdeck_programme($1)", [tenant.tenantId]));
assert.deepEqual((await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [programmeId])).rows[0], programme);
assert.deepEqual(await protectedRows(), before);
await assert.rejects(() => db.query("UPDATE public.network_programmes SET royalty_bps=0 WHERE id=$1", [programmeId]), /network_programmes_royalty_state_check/);

// A new tenant receives r3 services and copies the existing r2 template prices without arithmetic.
const freshTenant = pilot.tenants.find(x => x.tenantId !== tenant.tenantId);
assert.ok(freshTenant?.tenantId);
const freshId = (await asUser(() => db.query("SELECT public.network_seed_mealdeck_programme($1) AS id", [freshTenant.tenantId]))).rows[0].id;
const fresh = (await db.query("SELECT * FROM public.network_programmes WHERE id=$1", [freshId])).rows[0];
assert.equal(fresh.tech_fee_minor_per_order, 35);
assert.equal(fresh.royalty_bps, null);
assert.equal(fresh.royalty_status, "quote_required");
const { managedFranchise, ...freshOffer } = fresh.offer;
assert.deepEqual(freshOffer, MEALDECK_CURRENT_OFFER);
assert.deepEqual(managedFranchise, seeded.offer.managedFranchise, "the existing managed-franchise trigger retains its separate terms");
const freshTerritories = await rows("network_territories", "programme_id=$1", [freshId]);
assert.equal(freshTerritories.length, 150);
const templateByCode = new Map(before.templates.map(row => [row.territory_code, row]));
for (const territory of freshTerritories) {
  const template = templateByCode.get(territory.territory_code);
  assert.equal(territory.fee_minor, template.fee_minor, territory.territory_code + " retains its already reduced fee");
  assert.equal(territory.metadata.franchiseFeeVersion, "2026-10-06-r2");
  assert.deepEqual(territory.metadata, template.metadata);
}
assert.deepEqual([...new Set(freshTerritories.map(row => row.fee_minor))].sort((a, b) => a - b), [375000, 500000, 625000, 750000, 875000, 1000000, 1125000, 1250000]);
await db.close();
console.log("MealDeck r3 per-order technology, upfront package, offer history, unchanged r2 fees/reservations/snapshots and migration replay verified");
