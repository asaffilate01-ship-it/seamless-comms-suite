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

const one=(await db.query("SELECT product_key,name,parent_product_key,product_role FROM public.product_catalogue WHERE product_key='dishbee-one'")).rows[0];
assert.deepEqual(one,{product_key:"dishbee-one",name:"Dishbee One",parent_product_key:"dishbee",product_role:"experience"});

const buzz=await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key LIKE 'dishbee.buzz%' ORDER BY service_key");
assert.deepEqual(buzz.rows.map(r=>r.service_key),[
  "dishbee.buzz",
  "dishbee.buzz.growth",
  "dishbee.buzz.pro",
  "dishbee.buzz.voice",
]);

const haccora=(await db.query("SELECT service_key FROM public.service_catalogue WHERE service_key='haccora.compliance'")).rows[0];
assert.equal(haccora.service_key,"haccora.compliance");

const plusOffer=(await db.query(`
  SELECT offer_key,status,billing_basis,monthly_amount_minor,currency,commission_bps,delivery_charge_model
  FROM public.product_offer_catalogue WHERE offer_key='dishbee-plus.basic'
`)).rows[0];
assert.deepEqual(plusOffer,{
  offer_key:"dishbee-plus.basic",
  status:"active",
  billing_basis:"per_location",
  monthly_amount_minor:9900,
  currency:"GBP",
  commission_bps:0,
  delivery_charge_model:"customer_pass_through",
});

const kiosk=(await db.query(`
  SELECT hardware_model,monthly_amount_minor FROM public.product_offer_catalogue
  WHERE offer_key='dishbee-hive.kiosk'
`)).rows[0];
assert.deepEqual(kiosk,{hardware_model:"venue_owned",monthly_amount_minor:null});

const deps=await db.query("SELECT depends_on_service_key FROM public.service_dependencies WHERE service_key='dishbee.buzz.growth'");
const depSet=new Set(deps.rows.map(r=>r.depends_on_service_key));
for(const key of ["dishbee.buzz","omniqora.crm","omniqora.rfm","omniqora.journeys","omniqora.campaigns","omniqora.feedback"]){
  assert(depSet.has(key),key);
}

await db.close();
console.log("Dishbee product family packaging and confirmed Dishbee+ commercial model verified");
