import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE PUBLICATION supabase_realtime;");
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
  const sql=await readFile(new URL(name,migrations),"utf8");
  if(name.startsWith("20260816120554")){
    for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
  }
  await db.exec(sql);
}

const product=await db.query("SELECT product_key,metadata FROM public.product_catalogue WHERE product_key='haccora'");
assert.equal(product.rows.length,1);
assert.equal(product.rows[0].metadata.standalone,true);
assert(product.rows[0].metadata.countryPacks.includes("GB"));
assert(product.rows[0].metadata.countryPacks.includes("DE"));

const services=await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key LIKE 'haccora.%' ORDER BY service_key");
assert.equal(services.rows.length,16);
for(const key of ["haccora.core","haccora.compliance","haccora.ai-copilot","haccora.rag","haccora.graphrag","haccora.regulatory-intelligence","haccora.dishbee-sync"])
  assert(services.rows.some(row=>row.service_key===key),key);

const blueprints=await db.query("SELECT blueprint_key,country_code FROM public.tenant_blueprints WHERE blueprint_key IN('haccora-uk','haccora-de','dishbee-haccora-uk') ORDER BY blueprint_key");
assert.equal(blueprints.rows.length,3);
assert.equal(blueprints.rows.find(row=>row.blueprint_key==="haccora-uk").country_code,"GB");
assert.equal(blueprints.rows.find(row=>row.blueprint_key==="haccora-de").country_code,"DE");

const dishbee=await db.query("SELECT service_key FROM public.product_services WHERE product_key='dishbee' AND service_key LIKE 'haccora.%' ORDER BY service_key");
assert.deepEqual(dishbee.rows.map(row=>row.service_key),["haccora.compliance","haccora.core","haccora.dishbee-sync"]);

const productDeps=await db.query("SELECT product_key FROM public.service_product_dependencies WHERE service_key='haccora.dishbee-sync' ORDER BY product_key");
assert.deepEqual(productDeps.rows.map(row=>row.product_key),["dishbee","haccora"]);

const graphDeps=await db.query("SELECT depends_on_service_key FROM public.service_dependencies WHERE service_key='haccora.graphrag' ORDER BY depends_on_service_key");
assert.deepEqual(graphDeps.rows.map(row=>row.depends_on_service_key),["haccora.rag","omniqora.graphrag"]);

await db.close();
console.log("Haccora standalone, country packs, AI services and Dishbee add-on catalogue verified");
