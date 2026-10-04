import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);

await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  CREATE PUBLICATION supabase_realtime;
`);

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

const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [admin, "admin@example.invalid"]);
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

await asAdmin(() => db.query("SELECT public.platform_bootstrap_dishbee_pilot()"));

const first = await asAdmin(async () =>
  (await db.query("SELECT public.platform_enable_haccora_dishbee_pilot(true) AS result")).rows[0].result
);
assert.equal(first.tenants.length, 3);
assert(first.tenants.every((tenant) => tenant.mode === "dishbee-addon"));
assert(first.tenants.every((tenant) => tenant.aiEnabled === true));

const tenantRows = await db.query(
  "SELECT t.slug,p.status,p.config FROM public.tenants t JOIN public.tenant_products p ON p.tenant_id=t.id WHERE t.slug IN ('cafe1-luton','cafe1-st-albans','mealdeck') AND p.product_key='haccora' ORDER BY t.slug"
);
assert.equal(tenantRows.rows.length, 3);
assert(tenantRows.rows.every((row) => row.config.mode === "dishbee-addon"));
assert(tenantRows.rows.every((row) => row.config.countryPack === "GB"));

const serviceRows = await db.query(
  "SELECT t.slug,s.service_key,s.status FROM public.tenants t JOIN public.tenant_services s ON s.tenant_id=t.id WHERE t.slug IN ('cafe1-luton','cafe1-st-albans','mealdeck') AND s.service_key IN ('haccora.core','haccora.dishbee-sync','haccora.ai-copilot','haccora.rag','haccora.graphrag','haccora.regulatory-intelligence') ORDER BY t.slug,s.service_key"
);
assert.equal(serviceRows.rows.length, 18);

const second = await asAdmin(async () =>
  (await db.query("SELECT public.platform_enable_haccora_dishbee_pilot(true) AS result")).rows[0].result
);
assert.equal(second.tenants.length, 3);

const duplicateProducts = await db.query(
  "SELECT tenant_id,count(*)::integer AS n FROM public.tenant_products WHERE product_key='haccora' GROUP BY tenant_id HAVING count(*)>1"
);
assert.equal(duplicateProducts.rows.length, 0);

const sensors = await db.query(
  "SELECT count(*)::integer AS n FROM public.tenant_services s JOIN public.tenants t ON t.id=s.tenant_id WHERE t.slug IN ('cafe1-luton','cafe1-st-albans','mealdeck') AND s.service_key='haccora.sensors'"
);
assert.equal(sensors.rows[0].n, 0);

await db.close();
console.log("Dishbee Haccora pilot rollout verified for Cafe 1 Luton, Cafe 1 St Albans and MealDeck");
