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

const admin = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const stranger = "ffffffff-ffff-4fff-8fff-ffffffffffff";
for (const id of [admin, stranger]) {
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, id + "@example.invalid"]);
}
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);

async function asUser(user, fn) {
  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
  try { const value=await fn(); await db.exec("COMMIT"); return value; }
  catch (error) { await db.exec("ROLLBACK"); throw error; }
}

const pilot = await asUser(admin, async () =>
  (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result
);
const luton = pilot.tenants.find((row) => row.tenantSlug === "cafe1-luton");
assert(luton?.tenantId);

const regions = await asUser(admin, () => db.query("SELECT region_key FROM public.region_packs ORDER BY region_key"));
assert.deepEqual(regions.rows.map((r) => r.region_key), ["ae","de","gb","pk","us"]);

await asUser(admin, () => db.query(
  "SELECT public.platform_set_tenant_product_runtime($1,$2,$3,$4,$5::jsonb)",
  [luton.tenantId, "dishbee", "gb", "en-GB", JSON.stringify({ channel: "hospitality" })],
));

await assert.rejects(
  () => asUser(admin, () => db.query(
    "SELECT public.platform_set_tenant_product_runtime($1,$2,$3,$4,$5::jsonb)",
    [luton.tenantId, "dishbee", "gb", "de-DE", "{}"],
  )),
  /Locale is not supported/,
);

await asUser(admin, () => db.query(
  "SELECT public.platform_set_service_credential($1,$2,$3,$4::jsonb,$5)",
  ["oqsvc_fixture1", "a".repeat(64), "aaaaaaaa", JSON.stringify([
    { tenantId: luton.tenantId, productKey: "dishbee", capabilities: ["events.write","usage.write"] },
  ]), 365],
));

await assert.rejects(
  () => asUser(stranger, () => db.query("SELECT * FROM public.platform_service_credentials")),
  (error) => error.code === "42501",
);

const binding = await asUser(admin, async () =>
  (await db.query(
    "SELECT public.platform_upsert_provider_binding($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) AS id",
    [luton.tenantId, "dishbee", null, null, "communications.meta-whatsapp", "production", JSON.stringify({ access_token: "vault://meta/access", app_secret: "vault://meta/secret", verify_token: "vault://meta/verify" }), JSON.stringify({ phone_number_id: "fixture" })],
  )).rows[0].id
);
assert(binding);

await db.query("SET ROLE service_role");
await db.query("UPDATE public.tenant_products SET status='active' WHERE tenant_id=$1 AND product_key='dishbee'", [luton.tenantId]);
await db.query("UPDATE public.tenant_services SET status='active' WHERE tenant_id=$1 AND service_key IN ('dishbee.kds','omniqora.payments')", [luton.tenantId]);
await db.query(
  "INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status) VALUES($1,'dishbee','dishbee-luton','connected') ON CONFLICT (tenant_id,product_key,external_tenant_id) DO UPDATE SET status='connected'",
  [luton.tenantId],
);
await db.exec("RESET ROLE");

const readiness = await asUser(admin, async () =>
  (await db.query("SELECT public.get_tenant_product_readiness($1,$2) AS result", [luton.tenantId, "dishbee"])).rows[0].result
);
assert.equal(readiness.ready, true);
assert(readiness.warnings.includes("verified_domain_missing"));

await asUser(admin, () => db.query(
  "SELECT public.platform_set_data_route($1,$2,$3,$4,$5,$6::jsonb)",
  [luton.tenantId, "dishbee", "external", "eu", "vault://dishbee/luton-db", "{}"],
));
const route = await asUser(admin, () => db.query(
  "SELECT routing_mode,data_region,connection_ref FROM public.tenant_data_routes WHERE tenant_id=$1 AND product_key='dishbee'",
  [luton.tenantId],
));
assert.deepEqual(route.rows[0], { routing_mode: "external", data_region: "eu", connection_ref: "vault://dishbee/luton-db" });

const hiddenBindings = await asUser(stranger, () =>
  db.query("SELECT * FROM public.provider_bindings WHERE tenant_id=$1", [luton.tenantId])
);
assert.equal(hiddenBindings.rows.length, 0, "RLS must hide another tenant's provider bindings");

await db.close();
console.log("platform kernel v2 migration, scope and readiness verified");
