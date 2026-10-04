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
  for(const id of["18bafcd5-3e4c-4044-bb63-10325a0b7209","e66c0525-1787-4250-be26-79f849624521","890c71b1-cf6e-4b68-a56e-dd6050372481","97319fe5-82fd-44cd-b27d-6ae314ee368b"])
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,"fixture@example.invalid"]);
 }
 await db.exec(sql);
}
const admin="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[admin,"admin@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)",[admin]);
async function asAdmin(fn){await db.exec("BEGIN;SET LOCAL ROLE authenticated;");await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);try{const v=await fn();await db.exec("COMMIT");return v;}catch(e){await db.exec("ROLLBACK");throw e;}}

await asAdmin(()=>db.query("SELECT public.platform_bootstrap_dishbee_pilot()"));
await asAdmin(()=>db.query("SELECT public.platform_enable_haccora_dishbee_pilot(true)"));

const pilot=await asAdmin(async()=> (await db.query("SELECT public.platform_haccora_pilot_readiness() AS r")).rows[0].r);
assert.equal(pilot.tenants.length,3);
assert.equal(pilot.allReady,false);
assert(pilot.tenants.every(t=>t.productStatus==="requested"));
assert(pilot.tenants.every(t=>t.connectionStatus==="not_connected"));
assert(pilot.tenants.every(t=>t.services.aiRequested===true));

const mealdeck=pilot.tenants.find(t=>t.tenantSlug==="mealdeck");
assert(mealdeck?.tenantId);

await db.query("SET ROLE service_role");
await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='haccora'",[mealdeck.tenantId]);
await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key LIKE 'haccora.%'",[mealdeck.tenantId]);
await db.query("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status,last_verified_at) VALUES($1,'haccora','haccora-mealdeck','connected',now())",[mealdeck.tenantId]);
await db.exec("RESET ROLE");

const ready=await asAdmin(async()=> (await db.query("SELECT public.platform_haccora_readiness($1) AS r",[mealdeck.tenantId])).rows[0].r);
assert.equal(ready.ready,true);
assert.equal(ready.aiReady,true);

await db.close();
console.log("Haccora rollout readiness and pilot status verified");
