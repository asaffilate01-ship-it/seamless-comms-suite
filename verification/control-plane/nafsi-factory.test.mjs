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
    "SELECT product_role,deployment_mode,implementation_status,metadata FROM public.product_catalogue WHERE product_key='nafsi'",
  )
).rows[0];
assert.deepEqual(
  [product.product_role, product.deployment_mode, product.implementation_status],
  ["landlord", "external", "external_product"],
);
assert.equal(product.metadata.dataAuthority, "nafsi");
assert.equal(product.metadata.aiPolicy.prohibitFabricatedCitations, true);
assert.equal(product.metadata.aiPolicy.prohibitFatwaOrMedicalClaims, true);

const services = await db.query(
  "SELECT service_key,required,default_enabled FROM public.product_services WHERE product_key='nafsi' ORDER BY service_key",
);
assert.deepEqual(
  services.rows.map((row) => row.service_key),
  [
    "nafsi.core",
    "omniqora.ai",
    "omniqora.analytics",
    "omniqora.connect",
    "omniqora.identity",
    "omniqora.journeys",
    "omniqora.payments",
  ],
);
assert.equal(services.rows.find((row) => row.service_key === "nafsi.core").required, true);
assert.equal(services.rows.find((row) => row.service_key === "omniqora.ai").required, true);
assert.equal(
  services.rows.find((row) => row.service_key === "omniqora.connect").default_enabled,
  false,
);

const admin = "77777777-aaaa-4aaa-8aaa-777777777777";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
  admin,
  "nafsi-operator@example.invalid",
]);
await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [admin]);
await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin]);
const tenant = (
  await db.query(
    "SELECT public.platform_create_tenant(NULL,'Nafsi','Nafsi UK','nafsi-gb','GB','GBP','Europe/London','nafsi-gb-consumer') AS id",
  )
).rows[0].id;
await db.query(
  "SELECT public.platform_link_product($1,'nafsi','nafsi-gb','https://www.nafsi.app',ARRAY['control-plane','intelligence','events'])",
  [tenant],
);
await db.exec("COMMIT");

const connection = (
  await db.query(
    "SELECT status,external_tenant_id,capabilities FROM public.product_connections WHERE tenant_id=$1 AND product_key='nafsi'",
    [tenant],
  )
).rows[0];
assert.equal(connection.status, "configured");
assert.equal(connection.external_tenant_id, "nafsi-gb");
assert.deepEqual(connection.capabilities, ["control-plane", "intelligence", "events"]);

const manifest = await readFile(
  new URL("../../src/modules/connect/product-manifests.ts", import.meta.url),
  "utf8",
);
for (const token of [
  "nafsi.dua.published",
  "nafsi.ai.safety.signal",
  "retrieve_verified_dua",
  "get_launch_readiness",
]) {
  assert(manifest.includes(token), `Missing Nafsi Connect token: ${token}`);
}
const ecosystem = JSON.parse(
  await readFile(new URL("../../src/modules/ecosystem/catalogue.json", import.meta.url), "utf8"),
);
const nafsi = ecosystem.find((entry) => entry.product === "nafsi");
assert.equal(nafsi?.id, "nafsi-gb");
assert.match(nafsi?.boundary ?? "", /no prompt, journal, mood or free-text wellbeing content/i);

const nafsiServer = await readFile(
  new URL("../../src/modules/control-plane/nafsi.server.ts", import.meta.url),
  "utf8",
);
for (const token of [
  '"daily-plan"',
  '"flow-ai-slot"',
  '"weekly-report"',
  'createHmac("sha256", token)',
  "privateField(envelope.event.payload)",
  'service_key: "omniqora.ai"',
  "OMNIQORA_NAFSI_AI_CUTOVER_ENABLED",
  '"request-opt-in"',
  "claim_nafsi_connect_events",
  "serveNafsiParity",
  "nafsi_parity_receipts",
])
  assert(nafsiServer.includes(token), `Missing Nafsi governed route control: ${token}`);
assert(!nafsiServer.includes("prompt: z.string"), "Nafsi route must not accept free-form prompts");

for (const route of [
  "api.control-plane.nafsi.intelligence-shadow.ts",
  "api.control-plane.nafsi.intelligence.ts",
  "api.control-plane.nafsi.events.ts",
  "api.control-plane.nafsi.connect.ts",
  "api.control-plane.nafsi.connect-events.ts",
  "api.control-plane.nafsi.parity.ts",
]) {
  const source = await readFile(new URL(`../../src/routes/${route}`, import.meta.url), "utf8");
  assert(source.includes("serveNafsi"), `Missing Nafsi route handler: ${route}`);
}

const routeMigration = await readFile(
  new URL(
    "../../supabase/migrations/20261004160000_nafsi_intelligence_event_routes.sql",
    import.meta.url,
  ),
  "utf8",
);
assert(routeMigration.includes("shadow_intelligence_and_signed_events"));
assert(routeMigration.includes("operational_metadata_only"));

const cutoverMigration = await readFile(
  new URL("../../supabase/migrations/20261004180000_nafsi_ai_cutover_connect.sql", import.meta.url),
  "utf8",
);
assert(cutoverMigration.includes("nafsi_connect_to_source_privacy"));
assert(cutoverMigration.includes("maximumInitialCanaryPercent"));
assert(cutoverMigration.includes("explicit_double_opt_in"));

const parityMigration = await readFile(
  new URL(
    "../../supabase/migrations/20261004200000_nafsi_identity_billing_parity.sql",
    import.meta.url,
  ),
  "utf8",
);
assert(parityMigration.includes("shadow_parity_only"));
assert(parityMigration.includes("storesPaymentIdentifiers',false"));
assert(parityMigration.includes("automaticMigration',false"));
assert(manifest.includes("nafsi.parity.batch.completed"));

const webhook = await readFile(
  new URL("../../src/routes/api/public/whatsapp/webhook.ts", import.meta.url),
  "utf8",
);
assert(webhook.includes("[redacted-unsupported-message]"));
assert(webhook.includes('normalizedCommand !== "HELP"'));
assert(webhook.includes('event_type: isNafsi ? "command.received"'));

await db.close();
console.log(
  "Nafsi Factory catalogue, governed Intelligence routes, signed events and Connect manifest verified",
);
