import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
 const sql=await readFile(new URL(name,migrations),"utf8");
 if(name.startsWith("20260816120554")){
  for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 }
 await db.exec(sql);
}

const products=await db.query("SELECT product_key,product_role,parent_product_key FROM public.product_catalogue WHERE product_key IN ('gabley','domureva') ORDER BY product_key");
assert.deepEqual(products.rows.map(r=>r.product_key),["domureva","gabley"]);
for(const row of products.rows){assert.equal(row.product_role,"landlord");assert.equal(row.parent_product_key,"omniqora");}

const services=await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key IN ('omniqora.property-intelligence','omniqora.property-scout','omniqora.deal-detective','omniqora.property-underwriter','omniqora.property-match','omniqora.vacancy-scout','gabley.deal-room','domureva.funding-intelligence','domureva.gabley-sync') ORDER BY service_key");
assert.equal(services.rows.length,9);

const gabley=await db.query("SELECT service_key,default_enabled FROM public.product_services WHERE product_key='gabley' AND service_key IN ('gabley.deal-room','omniqora.property-intelligence','domureva.gabley-sync') ORDER BY service_key");
assert.equal(gabley.rows.length,3);
assert.equal(gabley.rows.find(r=>r.service_key==="gabley.deal-room").default_enabled,true);

const domureva=await db.query("SELECT service_key FROM public.product_services WHERE product_key='domureva' AND service_key IN ('domureva.funding-intelligence','omniqora.vacancy-scout','domureva.gabley-sync') ORDER BY service_key");
assert.equal(domureva.rows.length,3);

const bp=await db.query("SELECT blueprint_key FROM public.tenant_blueprints WHERE blueprint_key IN ('gabley-uk-agency','domureva-uk-regeneration','gabley-domureva-deals') ORDER BY blueprint_key");
assert.equal(bp.rows.length,3);

await db.exec(await readFile(new URL("20261006123000_property_intelligence_factory.sql",migrations),"utf8"));
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.product_catalogue WHERE product_key IN ('gabley','domureva')")).rows[0].n,2);
await db.close();

const contractSource=await readFile(new URL("../../src/modules/property-intelligence/contracts.ts",import.meta.url),"utf8");
for(const token of ["underwriteDeal","scoreVacancy","rankBuyerMatches","sourceUrl","confidence"]) assert(contractSource.includes(token),token);
const intelligenceService=await readFile(new URL("../../src/modules/intelligence/service.server.ts",import.meta.url),"utf8");
for(const token of ["serviceKey","Requested intelligence service entitlement required","has_tenant_entitlement"]) assert(intelligenceService.includes(token),token);
console.log("Gabley/DOMUREVA factory catalogue and property intelligence contracts verified");
