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

const services=await db.query(`
  SELECT service_key,implementation_status
  FROM public.service_catalogue
  WHERE service_key IN (
    'omniqora.promotions','omniqora.referrals','omniqora.memberships',
    'omniqora.order-scheduling','omniqora.substitutions','omniqora.vendor-capacity',
    'omniqora.commerce-risk','omniqora.store-credit','omniqora.connector-runtime'
  )
  ORDER BY service_key
`);
assert.equal(services.rows.length,9);
assert(services.rows.every(row=>row.implementation_status==="built_main"));

const plus=await db.query(`
  SELECT service_key,required
  FROM public.product_services
  WHERE product_key='dishbee-plus'
    AND service_key IN ('omniqora.vendor-capacity','omniqora.connector-runtime')
  ORDER BY service_key
`);
assert.deepEqual(plus.rows,[
  {service_key:"omniqora.connector-runtime",required:true},
  {service_key:"omniqora.vendor-capacity",required:true},
]);

for(const table of [
  "commerce_promotions","commerce_order_schedules","commerce_substitution_preferences",
  "marketplace_vendor_runtime_controls","commerce_risk_signals","commerce_disputes",
  "commerce_credit_accounts","integration_connector_instances","integration_field_mappings",
  "integration_connector_runs","integration_reconciliation_findings"
]){
  const found=(await db.query("SELECT to_regclass($1) AS name",[`public.${table}`])).rows[0].name;
  assert.equal(found,`public.${table}`,table);
}

await db.close();
console.log("Marketplace growth, risk, scheduling and connector-runtime gaps verified");
