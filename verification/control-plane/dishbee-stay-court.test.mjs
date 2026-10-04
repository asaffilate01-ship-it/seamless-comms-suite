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

const stay=(await db.query("SELECT product_key,name,parent_product_key,product_role FROM public.product_catalogue WHERE product_key='dishbee-stay'")).rows[0];
assert.deepEqual(stay,{product_key:"dishbee-stay",name:"Dishbee Stay",parent_product_key:"dishbee",product_role:"experience"});

const offers=await db.query("SELECT offer_key,monthly_amount_minor,commission_bps FROM public.product_offer_catalogue WHERE offer_key LIKE 'dishbee-stay.%' ORDER BY offer_key");
assert.deepEqual(offers.rows,[
  {offer_key:"dishbee-stay.connect",monthly_amount_minor:0,commission_bps:0},
  {offer_key:"dishbee-stay.standard",monthly_amount_minor:24900,commission_bps:0},
]);

const court=(await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key='dishbee.court-pack'")).rows[0];
assert.equal(court.service_key,"dishbee.court-pack");

const blueprints=await db.query("SELECT blueprint_key FROM public.tenant_blueprints WHERE blueprint_key IN ('dishbee-stay-connect-uk','dishbee-stay-uk','dishbee-court-uk') ORDER BY blueprint_key");
assert.deepEqual(blueprints.rows.map(r=>r.blueprint_key),["dishbee-court-uk","dishbee-stay-connect-uk","dishbee-stay-uk"]);

const pms=await db.query("SELECT provider_key,status FROM public.integration_provider_catalogue WHERE provider_key IN ('opera_cloud','mews','cloudbeds','guestline') ORDER BY provider_key");
assert.equal(pms.rows.length,4);
assert(pms.rows.every(r=>r.status==="evaluate"),"PMS providers must remain approval-safe planning targets");

await db.close();
console.log("Dishbee Stay and Court Pack SaaS Factory registration verified");
