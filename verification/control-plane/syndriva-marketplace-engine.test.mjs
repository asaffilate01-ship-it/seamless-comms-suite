import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = new URL("../../supabase/migrations/", import.meta.url);

await db.exec(`CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
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
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        id,
        "fixture@example.invalid",
      ]);
    }
  }
  await db.exec(sql);
}

const admin = "55555555-aaaa-4aaa-8aaa-555555555555";
const stranger = "66666666-bbbb-4bbb-8bbb-666666666666";
for (const id of [admin, stranger]) {
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, id + "@example.invalid"]);
}
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);

async function asUser(user, fn) {
  await db.exec("BEGIN;SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const value = await fn();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

const templates = await asUser(admin, () =>
  db.query("SELECT template_key FROM public.syndriva_marketplace_templates ORDER BY template_key"),
);
assert(templates.rows.length >= 10);
assert(templates.rows.some((row) => row.template_key === "products"));
assert(templates.rows.some((row) => row.template_key === "services"));
assert(templates.rows.some((row) => row.template_key === "rfq"));
assert(templates.rows.some((row) => row.template_key === "rental"));

const catalogue = await asUser(admin, () =>
  db.query("SELECT capability_key FROM public.syndriva_capability_catalogue"),
);
for (const key of [
  "vendors",
  "listings",
  "catalogue",
  "inventory",
  "availability",
  "pricing",
  "commission",
  "orders",
  "bookings",
  "payments",
  "payouts",
  "delivery",
  "reviews",
  "disputes",
  "white_label",
  "vendor_app",
  "omniqora_ai",
]) {
  assert(catalogue.rows.some((row) => row.capability_key === key), key);
}

const pilot = await asUser(admin, async () =>
  (await db.query("SELECT public.platform_bootstrap_dishbee_pilot() AS result")).rows[0].result,
);
const mealdeck = pilot.tenants.find((x) => x.tenantSlug === "mealdeck");
assert(mealdeck?.tenantId);

const marketplaceId = await asUser(admin, async () =>
  (
    await db.query(
      `SELECT public.syndriva_create_marketplace(
        $1,'mealdeck','MealDeck Marketplace','mealdeck-market','products',
        'mealdeck:main',NULL,$2::jsonb
      ) AS id`,
      [
        mealdeck.tenantId,
        JSON.stringify({
          seller_model: "multi_seller",
          branch_model: "multi_branch",
          currency: "GBP",
          country: "GB",
          timezone: "Europe/London",
        }),
      ],
    )
  ).rows[0].id,
);
assert(marketplaceId);

const instance = await asUser(admin, () =>
  db.query(
    "SELECT status,seller_model,branch_model,default_currency,template_key FROM public.syndriva_marketplaces WHERE id=$1",
    [marketplaceId],
  ),
);
assert.deepEqual(instance.rows[0], {
  status: "active",
  seller_model: "multi_seller",
  branch_model: "multi_branch",
  default_currency: "GBP",
  template_key: "products",
});

const enabled = await asUser(admin, () =>
  db.query(
    "SELECT capability_key FROM public.syndriva_marketplace_capabilities WHERE marketplace_id=$1 AND enabled=true",
    [marketplaceId],
  ),
);
assert(enabled.rows.length >= 15);
assert(enabled.rows.some((row) => row.capability_key === "inventory"));
assert(enabled.rows.some((row) => row.capability_key === "payouts"));
assert(enabled.rows.some((row) => row.capability_key === "white_label"));

await asUser(admin, () =>
  db.query("SELECT public.syndriva_set_capability($1,'bookings',true,$2::jsonb)", [
    marketplaceId,
    JSON.stringify({ mode: "collection-slots" }),
  ]),
);
const booking = await asUser(admin, () =>
  db.query(
    "SELECT enabled,source,config FROM public.syndriva_marketplace_capabilities WHERE marketplace_id=$1 AND capability_key='bookings'",
    [marketplaceId],
  ),
);
assert.equal(booking.rows[0].enabled, true);
assert.equal(booking.rows[0].source, "operator");
assert.equal(booking.rows[0].config.mode, "collection-slots");

const omniqora = await asUser(admin, () =>
  db.query(
    "SELECT status FROM public.syndriva_marketplace_connections WHERE marketplace_id=$1 AND connection_type='omniqora'",
    [marketplaceId],
  ),
);
assert.equal(omniqora.rows[0].status, "connected");

const hidden = await asUser(stranger, () =>
  db.query("SELECT * FROM public.syndriva_marketplaces WHERE id=$1", [marketplaceId]),
);
assert.equal(hidden.rows.length, 0);


const vendor = (
  await asUser(admin, () =>
    db.query(
      "INSERT INTO public.marketplace_vendors(tenant_id,product_key,name,vendor_key,public_slug,rating_average) VALUES($1,'mealdeck','Syndriva Test Seller','syndriva-test','syndriva-test',4.8) RETURNING id",
      [mealdeck.tenantId],
    ),
  )
).rows[0].id;
const listing = (
  await asUser(admin, () =>
    db.query(
      "INSERT INTO public.marketplace_listings(tenant_id,product_key,vendor_id,title,description,price_minor,currency,status) VALUES($1,'mealdeck',$2,'Premium Brake Kit','Performance brake kit',12999,'GBP','active') RETURNING id",
      [mealdeck.tenantId, vendor],
    ),
  )
).rows[0].id;
const category = (
  await asUser(admin, () =>
    db.query(
      "INSERT INTO public.marketplace_categories(tenant_id,product_key,category_key,name) VALUES($1,'mealdeck','brakes','Brakes') RETURNING id",
      [mealdeck.tenantId],
    ),
  )
).rows[0].id;
await asUser(admin, () =>
  db.query(
    "INSERT INTO public.marketplace_listing_categories(listing_id,category_id,tenant_id) VALUES($1,$2,$3)",
    [listing, category, mealdeck.tenantId],
  ),
);

const search = await asUser(admin, () =>
  db.query(
    "SELECT * FROM public.syndriva_search_listings($1,'brake','brakes',NULL,10000,15000,20,0)",
    [marketplaceId],
  ),
);
assert.equal(search.rows.length, 1);
assert.equal(search.rows[0].title, "Premium Brake Kit");
assert.deepEqual(search.rows[0].category_keys, ["brakes"]);

const eventId = await asUser(admin, async () =>
  (
    await db.query(
      "SELECT public.syndriva_emit_marketplace_event($1,'marketplace.listing.published',$2,$3::jsonb,'listing-published-1',NULL,NULL) AS id",
      [marketplaceId, listing, JSON.stringify({ channel: "web" })],
    )
  ).rows[0].id,
);
assert(eventId);
const event = await asUser(admin, () =>
  db.query(
    "SELECT event_type,source_service,subject_type,subject_id,payload FROM public.platform_events WHERE id=$1",
    [eventId],
  ),
);
assert.equal(event.rows[0].event_type, "marketplace.listing.published");
assert.equal(event.rows[0].source_service, "syndriva.marketplace-engine");
assert.equal(event.rows[0].subject_type, "listing");
assert.equal(event.rows[0].subject_id, listing);
assert.equal(event.rows[0].payload.marketplaceId, marketplaceId);


const vendorUser = "77777777-cccc-4ccc-8ccc-777777777777";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [vendorUser, "vendor@example.invalid"]);
await asUser(admin, () =>
  db.query(
    "INSERT INTO public.marketplace_vendor_memberships(tenant_id,vendor_id,user_id,role,status) VALUES($1,$2,$3,'manager','active')",
    [mealdeck.tenantId, vendor, vendorUser],
  ),
);

const vendorWorkspace = await asUser(vendorUser, async () =>
  (
    await db.query("SELECT public.syndriva_vendor_workspace($1,$2) AS workspace", [
      marketplaceId,
      vendor,
    ])
  ).rows[0].workspace,
);
assert.equal(vendorWorkspace.vendor.id, vendor);
assert.equal(vendorWorkspace.vendor.name, "Syndriva Test Seller");
assert.equal(vendorWorkspace.listings.length, 1);
assert.equal(vendorWorkspace.listings[0].title, "Premium Brake Kit");
assert.equal(vendorWorkspace.membership[0].role, "manager");

let denied = false;
try {
  await asUser(stranger, () =>
    db.query("SELECT public.syndriva_vendor_workspace($1,$2)", [marketplaceId, vendor]),
  );
} catch (error) {
  denied = String(error?.message ?? error).includes("vendor access denied");
}
assert.equal(denied, true, "unrelated user must not receive another vendor workspace");

await db.close();
console.log("Syndriva Marketplace Engine templates, provisioning, capabilities and RLS verified");
