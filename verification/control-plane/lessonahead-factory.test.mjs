import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE PUBLICATION supabase_realtime;`);
for (const name of (await readdir(migrations)).filter((value) => value.endsWith(".sql")).sort()) {
  const sql = await readFile(new URL(name, migrations), "utf8");
  if (name.startsWith("20260816120554")) {
    for (const id of [
      "18bafcd5-3e4c-4044-bb63-10325a0b7209",
      "e66c0525-1787-4250-be26-79f849624521",
      "890c71b1-cf6e-4b68-a56e-dd6050372481",
      "97319fe5-82fd-44cd-b27d-6ae314ee368b",
    ])
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        id,
        "fixture@example.invalid",
      ]);
  }
  await db.exec(sql);
}

const product = (
  await db.query(
    "SELECT category,deployment_mode,default_base_url,metadata FROM public.product_catalogue WHERE product_key='lessonahead'",
  )
).rows[0];
assert.equal(product.category, "marketplace");
assert.equal(product.deployment_mode, "external");
assert.equal(product.default_base_url, "https://nectar-design-lab.lovable.app");
assert.deepEqual(product.metadata.productClass, ["marketplace", "operations"]);

const plans = await db.query(
  "SELECT plan_key,price_minor,trial_days,status FROM public.billing_plan_catalogue WHERE product_key='lessonahead' ORDER BY plan_key",
);
assert.equal(plans.rows.length, 4);
assert(plans.rows.every((plan) => plan.status === "active" && plan.trial_days === 60));

const calls = (
  await db.query(
    "SELECT price_minor,included_limits,status,metadata FROM public.billing_addon_catalogue WHERE addon_key='lessonahead.masked-calls'",
  )
).rows[0];
assert.equal(Number(calls.price_minor), 1499);
assert.equal(calls.included_limits.connectedMinutes, 200);
assert.equal(calls.metadata.recording, false);

const previews = await db.query(
  "SELECT addon_key,status,price_minor FROM public.billing_addon_catalogue WHERE addon_key IN('lessonahead.whatsapp-ai','lessonahead.intelligence-plus') ORDER BY addon_key",
);
assert.equal(previews.rows.length, 2);
assert(previews.rows.every((addon) => addon.status === "draft" && Number(addon.price_minor) === 0));

const addons = await db.query(
  "SELECT addon_key,data_boundary FROM public.ecosystem_addon_catalogue WHERE host_product_key='lessonahead' ORDER BY addon_key",
);
assert.deepEqual(
  addons.rows.map((row) => row.addon_key),
  ["lessonahead.intelligence-plus", "lessonahead.masked-calls", "lessonahead.whatsapp-ai"],
);
assert(addons.rows.every((row) => row.data_boundary.length > 40));

await db.close();
console.log("LessonAhead product, plans, add-ons and data boundaries verified");
