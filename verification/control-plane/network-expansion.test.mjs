import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
  const sql=await readFile(new URL(name,migrations),"utf8");
  if(name.startsWith("20260816120554"))for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
  await db.exec(sql);
}
const admin="77777777-aaaa-4aaa-8aaa-777777777777";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[admin,admin+"@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asUser(fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

const pilot=await asUser(async()=> (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result);
const mealdeck=pilot.tenants.find(x=>x.tenantSlug==="mealdeck");
assert(mealdeck?.tenantId);
await asUser(()=>db.query("SELECT public.network_seed_mealdeck_programme($1)",[mealdeck.tenantId]));

const programme=await db.query("SELECT * FROM public.network_programmes WHERE tenant_id=$1 AND programme_key='mealdeck-england-wales'",[mealdeck.tenantId]);
assert.equal(programme.rows.length,1);
assert.equal(programme.rows[0].royalty_bps,null);
assert.equal(programme.rows[0].royalty_status,"quote_required");
assert.equal(programme.rows[0].marketing_bps,150);
assert.equal(programme.rows[0].tech_fee_minor_per_order,0);
assert.equal(programme.rows[0].supply_markup_bps,0);
assert.equal(programme.rows[0].fee_min_minor,375000);
assert.equal(programme.rows[0].fee_max_minor,1250000);
assert.equal(programme.rows[0].offer.pricing.franchiseFeeVersion,"2026-10-06-r2");
assert.equal(programme.rows[0].offer.pricing.royaltyPercent,null);
assert.equal(programme.rows[0].offer.pricing.techFeePerMonth,199);
assert.equal(programme.rows[0].offer.pricing.accountancyFeePerMonth,100);
assert.equal(programme.rows[0].offer.pricing.boughtInSupplyMarkupPercent,0);
assert.equal(programme.rows[0].offer.pricing.manufacturedSupplyMarkupPercent,15);
assert.equal(programme.rows[0].offer.pricing.equipmentOpeningSuppliesEstimate,15000);
assert.equal(programme.rows[0].managed_franchise_available,true);
assert.equal(programme.rows[0].managed_profit_share_bps,2000);
assert.equal(programme.rows[0].managed_profit_basis,"managed_operating_profit");

const count=await db.query("SELECT count(*)::int AS n FROM public.network_territories WHERE programme_id=$1",[programme.rows[0].id]);
assert.equal(count.rows[0].n,150);
const named=await db.query("SELECT name,status,is_sellable,metadata FROM public.network_territories WHERE programme_id=$1 AND name IN ('Bedford','Milton Keynes','Luton / Dunstable','St Albans','Islington / Camden') ORDER BY name",[programme.rows[0].id]);
const byName=Object.fromEntries(named.rows.map(r=>[r.name,r]));
assert.equal(byName["Bedford"].status,"taken");
assert.equal(byName["Bedford"].is_sellable,false);
assert.equal(byName["Milton Keynes"].status,"taken");
assert.equal(byName["Luton / Dunstable"].status,"taken");
assert.equal(byName["Luton / Dunstable"].is_sellable,false);
assert.equal(byName["Luton / Dunstable"].metadata.centrePostcode,"LU4 8NU");
assert.equal(byName["St Albans"].status,"taken");
assert.equal(byName["St Albans"].is_sellable,false);
assert.equal(byName["St Albans"].metadata.centrePostcode,"AL1 3JU");
assert.equal(byName["Islington / Camden"].status,"taken");
assert.equal(byName["Islington / Camden"].is_sellable,false);
assert.equal(byName["Islington / Camden"].metadata.anchor,"Caledonian Road");
const islington=await db.query("SELECT t.id,d.centre_postcode,d.core_drive_minutes,d.shared_drive_minutes,d.overflow_drive_minutes,d.target_population_min,d.target_population_max FROM public.network_territories t JOIN public.network_territory_designs d ON d.territory_id=t.id WHERE t.programme_id=$1 AND t.name='Islington / Camden'",[programme.rows[0].id]);
assert.equal(islington.rows.length,1);
assert.equal(islington.rows[0].centre_postcode,"N7 8XH");
assert.equal(islington.rows[0].core_drive_minutes,25);
assert.equal(islington.rows[0].shared_drive_minutes,30);
assert.equal(islington.rows[0].overflow_drive_minutes,35);
assert.equal(islington.rows[0].target_population_min,150000);
assert.equal(islington.rows[0].target_population_max,200000);

await db.query("INSERT INTO public.geo_demographic_cells(geography_code,geography_type,name,centroid_lat,centroid_lng,population,households,population_source,household_source,source_year) VALUES('E010TEST','LSOA21','Test LSOA',51.543,-0.114,1700,720,'ONS test fixture','Census test fixture',2025)");
const demo=await db.query("SELECT population,households FROM public.geo_demographic_cells WHERE geography_code='E010TEST'");
assert.equal(demo.rows[0].population,1700);
assert.equal(demo.rows[0].households,720);

const agreement=await db.query("INSERT INTO public.network_management_agreements(tenant_id,programme_id,territory_id,management_provider,status,profit_share_bps,profit_basis) VALUES($1,$2,$3,'MealDeck Operations','proposed',2000,'managed_operating_profit') RETURNING profit_share_bps,profit_basis",[mealdeck.tenantId,programme.rows[0].id,islington.rows[0].id]);
assert.equal(agreement.rows[0].profit_share_bps,2000);
assert.equal(agreement.rows[0].profit_basis,"managed_operating_profit");

const channels=await db.query("SELECT count(*)::int AS n FROM public.growth_channel_catalogue WHERE status='active'");
assert(channels.rows[0].n>=20);
const services=await db.query("SELECT service_key,implementation_status FROM public.service_catalogue WHERE service_key IN('omniqora.network-expansion','omniqora.attribution') ORDER BY service_key");
assert.equal(services.rows.length,2);
assert(services.rows.every(r=>r.implementation_status==="built_main"));

await db.close();
console.log("Network expansion, franchise sales and acquisition foundations verified");
