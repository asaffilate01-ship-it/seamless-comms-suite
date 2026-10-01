import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);

await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $;
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

const first = await asAdmin(async () =>
  (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result
);

assert.equal(first.organisationSlug, "313-brands");
assert.equal(first.landlordProductKey, "dishbee");
assert.equal(first.tenants.length, 3);

const tenants = await db.query(
  "SELECT name,slug FROM public.tenants WHERE slug IN ('cafe1-st-albans','cafe1-luton','mealdeck') ORDER BY slug"
);
assert.deepEqual(tenants.rows.map((row) => row.slug), ["cafe1-luton", "cafe1-st-albans", "mealdeck"]);

const products = await db.query(`
  SELECT t.slug,tp.product_key
  FROM public.tenants t
  JOIN public.tenant_products tp ON tp.tenant_id=t.id
  WHERE t.slug IN ('cafe1-st-albans','cafe1-luton','mealdeck')
  ORDER BY t.slug,tp.product_key
`);
assert(products.rows.some((row) => row.slug === "cafe1-luton" && row.product_key === "dishbee"));
assert(products.rows.some((row) => row.slug === "cafe1-st-albans" && row.product_key === "dishbee"));
assert(products.rows.some((row) => row.slug === "mealdeck" && row.product_key === "dishbee"));
assert(products.rows.some((row) => row.slug === "mealdeck" && row.product_key === "mealdeck"));

const mealdeck = await db.query("SELECT product_role,parent_product_key FROM public.product_catalogue WHERE product_key='mealdeck'");
assert.deepEqual(mealdeck.rows[0], { product_role: "experience", parent_product_key: "dishbee" });

const locations = await db.query(`
  SELECT t.slug,l.code
  FROM public.tenants t
  JOIN public.tenant_locations l ON l.tenant_id=t.id
  WHERE t.slug IN ('cafe1-st-albans','cafe1-luton')
  ORDER BY t.slug,l.code
`);
assert.deepEqual(locations.rows, [
  { slug: "cafe1-luton", code: "futures-house" },
  { slug: "cafe1-luton", code: "luton-crown-court" },
  { slug: "cafe1-st-albans", code: "st-albans-crown-court" },
]);

await asAdmin(async () => db.query("SELECT public.platform_bootstrap_dishbee_pilot()"));
const counts = await db.query(`
  SELECT
    (SELECT count(*)::int FROM public.organisations WHERE slug='313-brands') AS organisations,
    (SELECT count(*)::int FROM public.tenants WHERE slug IN ('cafe1-st-albans','cafe1-luton','mealdeck')) AS tenants,
    (SELECT count(*)::int FROM public.tenant_locations l JOIN public.tenants t ON t.id=l.tenant_id WHERE t.slug IN ('cafe1-st-albans','cafe1-luton')) AS locations
`);
assert.deepEqual(counts.rows[0], { organisations: 1, tenants: 3, locations: 3 });

await db.close();
console.log("Dishbee landlord/tenant SaaS Factory pilot verified");
