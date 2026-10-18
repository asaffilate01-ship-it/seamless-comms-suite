import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);

await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE PUBLICATION supabase_realtime;`);

for (const name of (await readdir(migrations)).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = await readFile(new URL(name, migrations), "utf8");
  if (name.startsWith("20260816120554")) {
    for (const id of [
      "18bafcd5-3e4c-4044-bb63-10325a0b7209",
      "e66c0525-1787-4250-be26-79f849624521",
      "890c71b1-cf6e-4b68-a56e-dd6050372481",
      "97319fe5-82fd-44cd-b27d-6ae314ee368b",
    ]) {
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, "fixture@example.invalid"]);
    }
  }
  await db.exec(sql);
}

const admin = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [admin, "operator@example.invalid"]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);

async function asAdmin(fn) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin]);
  try {
    const value = await fn();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// P0: discovering Dishbee's three existing blueprints must never provision
// real/active Factory tenants, attach an organisation or enqueue work.
const initial = await db.query(`SELECT
  (SELECT count(*)::int FROM public.organisations WHERE slug='313-brands') AS organisations,
  (SELECT count(*)::int FROM public.tenants WHERE slug IN
     ('cafe1-st-albans','cafe1-luton','mealdeck')) AS tenants,
  (SELECT count(*)::int FROM public.provisioning_jobs) AS jobs`);
assert.deepEqual(initial.rows[0], {organisations:0,tenants:0,jobs:0});

const preview = await asAdmin(async () =>
  (await db.query("SELECT public.platform_preview_dishbee_pilot() AS result")).rows[0].result
);
assert.equal(preview.mode,"read_only");
assert.equal(preview.safeToActivate,false);
assert.equal(preview.createsTenants,false);
assert.equal(preview.activatesProviders,false);
assert.deepEqual(preview.candidates.map(x=>x.factorySlug),
  ["cafe1-luton","cafe1-st-albans","mealdeck"]);
assert.deepEqual(preview.candidates.map(x=>x.dishbeeSlug),
  ["cafe-1-luton","cafe-1-st-albans","mealdeck"]);
assert(preview.candidates.every(x=>x.factoryTenantId===null));
assert(preview.candidates.every(x=>x.factoryTenantStatus===null));
assert(preview.candidates.every(x=>x.safeToActivate===false));

await assert.rejects(
  asAdmin(async () => db.query("SELECT public.platform_bootstrap_dishbee_pilot()")),
  /permission denied|legacy_dishbee_pilot_disabled/i
);

const operator = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",
  [operator,"nonadmin@example.invalid"]);
await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[operator]);
await assert.rejects(
  db.query("SELECT public.platform_preview_dishbee_pilot()"),
  /platform_admin_required/i
);
await db.exec("ROLLBACK");

const anonymousPrivileges=await db.query(`
 SELECT
  has_function_privilege('anon','public.platform_bootstrap_dishbee_pilot()','EXECUTE') AS unsafe_anon,
  has_function_privilege('authenticated','public.platform_bootstrap_dishbee_pilot()','EXECUTE') AS unsafe_staff,
  has_function_privilege('anon','public.platform_preview_dishbee_pilot()','EXECUTE') AS preview_anon,
  has_function_privilege('authenticated','public.platform_preview_dishbee_pilot()','EXECUTE') AS preview_staff
`);
assert.deepEqual(anonymousPrivileges.rows[0], {
  unsafe_anon:false, unsafe_staff:false, preview_anon:false, preview_staff:true
});

const final = await db.query(`SELECT
  (SELECT count(*)::int FROM public.organisations WHERE slug='313-brands') AS organisations,
  (SELECT count(*)::int FROM public.tenants WHERE slug IN
     ('cafe1-st-albans','cafe1-luton','mealdeck')) AS tenants,
  (SELECT count(*)::int FROM public.provisioning_jobs) AS jobs`);
assert.deepEqual(final.rows[0], initial.rows[0]);

const mealdeck = await db.query(
  "SELECT product_role,parent_product_key FROM public.product_catalogue WHERE product_key='mealdeck'"
);
assert.deepEqual(mealdeck.rows[0],{product_role:"experience",parent_product_key:"dishbee"});

await db.close();
console.log("Dishbee landlord/tenant SaaS Factory pilot verified");
