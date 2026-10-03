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
assert.equal(programme.rows[0].royalty_bps,550);
assert.equal(programme.rows[0].marketing_bps,150);
assert.equal(programme.rows[0].tech_fee_minor_per_order,25);
assert.equal(programme.rows[0].supply_markup_bps,1000);

const count=await db.query("SELECT count(*)::int AS n FROM public.network_territories WHERE programme_id=$1",[programme.rows[0].id]);
assert.equal(count.rows[0].n,150);
const named=await db.query("SELECT name,status,is_sellable,metadata FROM public.network_territories WHERE programme_id=$1 AND name IN ('Bedford','Milton Keynes','Luton / Dunstable','Islington / Camden') ORDER BY name",[programme.rows[0].id]);
const byName=Object.fromEntries(named.rows.map(r=>[r.name,r]));
assert.equal(byName["Bedford"].status,"taken");
assert.equal(byName["Bedford"].is_sellable,false);
assert.equal(byName["Milton Keynes"].status,"taken");
assert.equal(byName["Luton / Dunstable"].status,"coming_soon");
assert.equal(byName["Islington / Camden"].status,"taken");
assert.equal(byName["Islington / Camden"].is_sellable,false);
assert.equal(byName["Islington / Camden"].metadata.anchor,"Caledonian Road");

const channels=await db.query("SELECT count(*)::int AS n FROM public.growth_channel_catalogue WHERE status='active'");
assert(channels.rows[0].n>=20);
const services=await db.query("SELECT service_key,implementation_status FROM public.service_catalogue WHERE service_key IN('omniqora.network-expansion','omniqora.attribution') ORDER BY service_key");
assert.equal(services.rows.length,2);
assert(services.rows.every(r=>r.implementation_status==="built_main"));

await db.close();
console.log("Network expansion, franchise sales and acquisition foundations verified");
