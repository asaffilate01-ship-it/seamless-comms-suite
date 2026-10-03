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
const services=await db.query("SELECT service_key,implementation_status FROM public.service_catalogue WHERE service_key IN ('omniqora.driver-ops','omniqora.supplier-ops') ORDER BY service_key");
assert.deepEqual(services.rows,[
  {service_key:"omniqora.driver-ops",implementation_status:"built_main"},
  {service_key:"omniqora.supplier-ops",implementation_status:"built_main"},
]);
for(const table of [
  "dispatch_agent_compliance","dispatch_agent_shifts","dispatch_agent_breaks",
  "dispatch_agent_earnings","dispatch_vehicle_inspections","supply_partners",
  "supply_catalogue_items","supply_orders","supply_order_lines","supply_invoices","supply_returns"
]){
  const found=(await db.query("SELECT to_regclass($1) AS name",[`public.${table}`])).rows[0].name;
  assert.equal(found,`public.${table}`,table);
}
const productRows=await db.query("SELECT product_key,service_key FROM public.product_services WHERE service_key IN ('omniqora.driver-ops','omniqora.supplier-ops') AND product_key IN ('dishbee-plus','dishbee-one','mealdeck')");
assert.equal(productRows.rows.length,6);
await db.close();
console.log("Shared driver and supplier operations verified");
