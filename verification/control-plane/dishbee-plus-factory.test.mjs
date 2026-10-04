import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db=new PGlite();
const migrations=new URL("../../supabase/migrations/",import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for(const name of (await readdir(migrations)).filter(x=>x.endsWith(".sql")).sort()){
  const sql=await readFile(new URL(name,migrations),"utf8");
  if(name.startsWith("20260816120554")){
    for(const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"]){
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
    }
  }
  await db.exec(sql);
}

const product=(await db.query("SELECT product_key,name,category,deployment_mode FROM public.product_catalogue WHERE product_key='dishbee-plus'")).rows[0];
assert.deepEqual(product,{product_key:"dishbee-plus",name:"Dishbee+",category:"marketplace",deployment_mode:"hybrid"});

const services=await db.query("SELECT service_key,required FROM public.product_services WHERE product_key='dishbee-plus'");
const map=new Map(services.rows.map(row=>[row.service_key,row.required]));
for(const required of ["omniqora.identity","omniqora.marketplace","omniqora.integration-hub","omniqora.catalogue-syndication","omniqora.vendor-operations","omniqora.order-orchestration","omniqora.payments","omniqora.geo"]){
  assert.equal(map.get(required),true,required);
}
assert.equal(map.get("dishbee.kds"),false);
assert.equal(map.get("dishbee.hive"),false);

const providers=await db.query("SELECT provider_key,status FROM public.integration_provider_catalogue WHERE provider_key IN ('uber_eats','deliveroo','just_eat','deliverect','otter','urbanpiper') ORDER BY provider_key");
assert.equal(providers.rows.length,6);
assert(providers.rows.every(row=>row.status!=="live"),"Provider registry must not claim live certification");

const blueprint=(await db.query("SELECT blueprint_key,country_code FROM public.tenant_blueprints WHERE blueprint_key='dishbee-plus-uk'")).rows[0];
assert.deepEqual(blueprint,{blueprint_key:"dishbee-plus-uk",country_code:"GB"});

await db.close();
console.log("Dishbee+ SaaS Factory product, services, provider registry and approval-safe defaults verified");
