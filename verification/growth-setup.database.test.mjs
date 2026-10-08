import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Both schemas matter: the live deployment deliberately contains only the
// original six migrations and ten reviewed Growth prerequisites. Do not let a
// test accidentally rely on unrelated factory/commerce migrations from main.
const hostedPrefixes = [
  "20260723193650", "20260723193737", "20260816120438", "20260816120554", "20260816120613", "20260816120622",
  "20260915180000", "20261001171000", "20261001194500", "20261001201500", "20261001210000",
  "20261002143000", "20261002160000", "20261004170000", "20261008100000", "20261008100500",
  "20261008183000",
];
const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
let checks = 0;

async function runSuite(profile) {
  const db = new PGlite();
  const files = profile === "hosted subset"
    ? migrationFiles.filter((name) => hostedPrefixes.some((prefix) => name.startsWith(prefix)))
    : migrationFiles;
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE PUBLICATION supabase_realtime;`);
    for (const file of files) {
      if (file.startsWith("20260816120554")) {
        for (const id of ["18bafcd5-3e4c-4044-bb63-10325a0b7209", "e66c0525-1787-4250-be26-79f849624521", "890c71b1-cf6e-4b68-a56e-dd6050372481", "97319fe5-82fd-44cd-b27d-6ae314ee368b"]) {
          await db.query("INSERT INTO auth.users(id,email) VALUES($1,'historic-setup-fixture@example.invalid')", [id]);
        }
      }
      try { await db.exec(await readFile(new URL(file, migrationDir), "utf8")); }
      catch (error) { throw new Error(`${profile}: ${file}: ${error.message}`, { cause: error }); }
    }
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
    const count = (table, tenant) => one(`SELECT count(*)::integer value FROM public.${table} WHERE tenant_id=$1`, [tenant]);
    async function asRole(role, actor, fn) {
      await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [actor ?? "", role]);
      try { const value = await fn(); await db.exec("COMMIT"); return value; }
      catch (error) { await db.exec("ROLLBACK"); throw error; }
    }
    const as = (actor, fn) => asRole("authenticated", actor, fn);
    const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${profile}: ${name}`); };
    const denied = (fn, code) => assert.rejects(fn, (error) => !code || error.code === code);
    const users = Object.fromEntries(["owner", "otherOwner", "admin", "agent", "viewer", "outsider", "platformAdmin"].map((key) => [key, randomUUID()]));
    for (const id of Object.values(users)) await db.query("INSERT INTO auth.users(id,email) VALUES($1,'growth-setup-fixture@example.invalid')", [id]);
    async function tenant(name, owner = users.owner) {
      const id = randomUUID();
      await db.query("INSERT INTO public.organisations(id,name,slug) VALUES($1,$2,$3)", [id, name, "setup-" + id]);
      await db.query("INSERT INTO public.tenants(id,name,slug,status,organisation_id) VALUES($1,$2,$3,'active',$1)", [id, name, "setup-" + id]);
      await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'owner')", [id, owner]);
      return id;
    }
    const first = await tenant("Alpha setup workspace");
    const second = await tenant("Beta setup workspace", users.otherOwner);
    await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'admin')", [second, users.owner]);
    for (const [key, role] of [["admin", "admin"], ["agent", "agent"], ["viewer", "viewer"]]) {
      await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,$3)", [first, users[key], role]);
    }
    const setup = (actor, t = first, product = "omniqora", creative = true) => as(actor, () => one("SELECT public.growth_setup_workspace($1,$2,$3) value", [t, product, creative]));
    const access = (actor, t = first, product = "omniqora") => as(actor, () => one("SELECT public.growth_studio_access($1,$2) value", [t, product]));
    const request = (actor = users.owner, t = first, product = "omniqora", creative = true, key = randomUUID(), note = "Pilot setup") =>
      as(actor, () => one("SELECT public.growth_setup_request($1,$2,$3,$4,$5) value", [t, product, creative, key, note]));
    const decide = (r, actor = users.platformAdmin, decision = "approved", note = "Reviewed setup", revision = r.revision, t = r.tenantId, product = r.productKey) =>
      as(actor, () => one("SELECT public.growth_setup_decide($1,$2,$3,$4,$5,$6) value", [t, product, r.id, revision, decision, note]));
    const writer = (actor = users.owner, t = first, product = "omniqora", provider = "ai.openai", model = "fixture-model", tokens = 2048) =>
      as(actor, () => one("SELECT public.growth_setup_save_writer($1,$2,$3,'production',$4,$5) value", [t, product, provider, model, tokens]));

    await check("migration and readiness do not activate a tenant or fabricate connections", async () => {
      assert.equal(await count("tenant_products", first), 0);
      assert.equal(await count("tenant_services", first), 0);
      assert.equal(await count("provider_bindings", first), 0);
      const initial = await setup(users.owner);
      assert.equal(initial.access.allowed, false);
      assert.deepEqual(initial.permissions, { canRequest: true, canConfigure: true, canDecide: false, reviewAvailable: false });
      assert.equal(initial.product.status, null);
      assert.equal(initial.connection.verified, false);
      assert.equal(initial.request, null);
      assert.deepEqual(initial.blockers, []);
      assert.deepEqual(initial.services.map((service) => service.key), ["omniqora.ai", "omniqora.campaigns", "omniqora.creative", "omniqora.documents", "omniqora.identity"]);
      assert(initial.services.every((service) => !service.active && service.provisionable));
      assert.equal(await count("tenant_products", first), 0);
    });
    await check("workspace pagination reaches a second membership and hides foreign tenants", async () => {
      const page = await as(users.owner, () => one("SELECT public.growth_setup_list_workspaces(0,1) value"));
      assert.equal(page.workspaces.length, 1); assert.equal(page.workspaces[0].id, first);
      assert.equal(page.hasMore, true); assert.equal(page.nextOffset, 1);
      const next = await as(users.owner, () => one("SELECT public.growth_setup_list_workspaces(1,1) value"));
      assert.equal(next.workspaces[0].id, second); assert.equal(next.workspaces[0].role, "admin");
      assert.equal(next.hasMore, false); assert.equal(next.nextOffset, null);
      assert.deepEqual((await as(users.outsider, () => one("SELECT public.growth_setup_list_workspaces() value"))).workspaces, []);
      await denied(() => as(users.owner, () => one("SELECT public.growth_setup_list_workspaces(-1,100) value")), "22023");
      await denied(() => asRole("anon", null, () => one("SELECT public.growth_setup_list_workspaces() value")), "42501");
    });
    await check("read-only members and unrelated owners cannot mutate setup or bypass RPCs", async () => {
      for (const actor of [users.agent, users.viewer]) {
        assert.equal((await setup(actor)).permissions.canRequest, false);
        await denied(() => request(actor), "42501");
        await denied(() => writer(actor), "42501");
      }
      await denied(() => request(users.otherOwner), "42501");
      await denied(() => setup(users.outsider), "42501");
      await denied(() => as(users.owner, () => db.query("INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES($1,'omniqora','active')", [first])), "42501");
      await denied(() => as(users.owner, () => one("SELECT public.growth_setup_blockers($1,'omniqora',ARRAY['omniqora.campaigns']) value", [first])), "42501");
    });

    const key = randomUUID();
    let pending;
    await check("a request is durable and idempotent without granting entitlements", async () => {
      pending = await request(users.owner, first, "omniqora", true, key);
      assert.equal(pending.status, "requested"); assert.equal(pending.revision, 1); assert.equal(pending.receipt, null);
      assert.deepEqual(await request(users.owner, first, "omniqora", true, key), pending);
      assert.equal((await request(users.admin, first, "omniqora", true)).id, pending.id);
      await denied(() => request(users.owner, first, "omniqora", false, key), "23505");
      await denied(() => request(users.owner, first, "omniqora", false), "55000");
      const viewed = await setup(users.owner, first, "omniqora", false);
      assert.equal(viewed.request.includeCreative, true);
      assert(viewed.services.some((service) => service.key === "omniqora.creative"));
      assert.equal(await count("tenant_products", first), 0);
      assert.equal(await count("tenant_services", first), 0);
      assert.equal(await one("SELECT count(*)::integer value FROM public.audit_log WHERE tenant_id=$1 AND action='growth.setup.requested'", [first]), 1);
      await denied(() => as(users.owner, () => db.query("UPDATE public.growth_setup_requests SET status='approved' WHERE id=$1", [pending.id])), "42501");
      await denied(() => decide(pending, users.owner), "42501");
      await denied(() => decide(pending, users.admin), "42501");
    });
    await db.query("INSERT INTO public.platform_admins(user_id) VALUES($1)", [users.platformAdmin]);
    await check("actual platform admin has authority without a tenant membership", async () => {
      const state = await setup(users.platformAdmin);
      assert.equal(state.access.role, "platform_admin"); assert.equal(state.permissions.canDecide, true);
      assert.equal(state.permissions.reviewAvailable, true);
      const page = await as(users.platformAdmin, () => one("SELECT public.growth_setup_list_workspaces(0,1) value"));
      assert.equal(page.workspaces[0].role, "platform_admin"); assert.equal(page.hasMore, true);
      await denied(() => decide(pending, users.platformAdmin, "approved", "Reviewed setup", 99), "40001");
      await denied(() => decide(pending, users.platformAdmin, "approved", "Reviewed setup", 1, second), "P0002");
    });
    await check("approval is atomic if a downstream entitlement write fails", async () => {
      await db.exec(`CREATE FUNCTION public.fixture_setup_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.service_key='omniqora.documents' THEN RAISE EXCEPTION 'Controlled downstream failure' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER fixture_setup_failure BEFORE INSERT ON public.tenant_services FOR EACH ROW EXECUTE FUNCTION public.fixture_setup_failure();`);
      await denied(() => decide(pending), "23514");
      assert.equal(await count("tenant_products", first), 0); assert.equal(await count("tenant_services", first), 0);
      assert.equal((await setup(users.owner)).request.status, "requested");
      await db.exec("DROP TRIGGER fixture_setup_failure ON public.tenant_services; DROP FUNCTION public.fixture_setup_failure();");
    });
    let approved;
    await check("approved local plan grants only its required closure and records an immutable receipt", async () => {
      approved = await decide(pending);
      assert.equal(approved.status, "approved"); assert.equal(approved.revision, 2);
      assert.equal(approved.receipt.productActivated, true);
      assert.deepEqual(approved.receipt.servicesActivated, ["omniqora.ai", "omniqora.campaigns", "omniqora.creative", "omniqora.documents", "omniqora.identity"]);
      assert.equal(await count("tenant_products", first), 1); assert.equal(await count("tenant_services", first), 5);
      assert.equal(await one("SELECT launch_status value FROM public.tenant_products WHERE tenant_id=$1 AND product_key='omniqora'", [first]), "configuring");
      assert.equal(await count("provider_bindings", first), 0); assert.equal(await count("product_connections", first), 0);
      assert.deepEqual(await decide(pending), approved);
      await denied(() => decide(pending, users.platformAdmin, "rejected"), "40001");
      assert.equal(await one("SELECT count(*)::integer value FROM public.audit_log WHERE tenant_id=$1 AND action='growth.setup.approved'", [first]), 1);
      const ready = await access(users.platformAdmin);
      assert.equal(ready.canReview, true); assert.equal(ready.canHandoff, true);
      assert.equal((await setup(users.owner)).request, null);
    });
    await check("platform-admin authority takes precedence over an existing viewer membership", async () => {
      await db.query("INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,'viewer')", [first, users.platformAdmin]);
      const adminAccess = await access(users.platformAdmin);
      assert.equal(adminAccess.role, "platform_admin"); assert.equal(adminAccess.canWrite, true); assert.equal(adminAccess.canReview, true);
      const member = await access(users.viewer);
      assert.equal(member.allowed, true); assert.equal(member.canWrite, false); assert.equal(member.canReview, false);
      assert.equal((await access(users.agent)).canWrite, true); assert.equal((await access(users.agent)).canReview, false);
    });
    await check("valid dated trials and billing grants are preserved without extending access", async () => {
      await db.query("UPDATE public.tenant_services SET status='trial',source='billing',valid_until=now()+interval '7 days',billing_reference='fixture-billing' WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [first]);
      const before = await one("SELECT to_jsonb(s) value FROM public.tenant_services s WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [first]);
      const repeated = await request();
      const receipt = await decide(repeated);
      assert.equal(receipt.receipt.productActivated, false);
      assert.deepEqual(receipt.receipt.servicesActivated, []); assert.equal(receipt.receipt.servicesPreserved.length, 5);
      assert.deepEqual(await one("SELECT to_jsonb(s) value FROM public.tenant_services s WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [first]), before);
    });
    await check("expiry, future starts, suspension and pending billing are never silently overridden", async () => {
      const r = await request();
      for (const sql of [
        "status='suspended',source='manual',valid_from=now(),valid_until=NULL",
        "status='cancelled',source='manual',valid_from=now(),valid_until=NULL",
        "status='active',source='manual',valid_from=now(),valid_until=now()-interval '1 hour'",
        "status='trial',source='manual',valid_from=now()+interval '1 hour',valid_until=NULL",
        "status='requested',source='billing',valid_from=now(),valid_until=NULL",
      ]) {
        await db.query(`UPDATE public.tenant_services SET ${sql} WHERE tenant_id=$1 AND service_key='omniqora.campaigns'`, [first]);
        const before = await one("SELECT to_jsonb(s) value FROM public.tenant_services s WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [first]);
        assert((await setup(users.owner)).blockers.some((item) => item.code === "service_protected"));
        await denied(() => decide(r), "55000");
        assert.deepEqual(await one("SELECT to_jsonb(s) value FROM public.tenant_services s WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [first]), before);
      }
      await db.query("UPDATE public.tenant_services SET status='active',source='manual',valid_from=now(),valid_until=NULL WHERE tenant_id=$1 AND service_key='omniqora.campaigns'", [first]);
      await decide(r, users.platformAdmin, "rejected", "Awaiting billing review");
    });
    await check("an unimplemented closure fails before any grant and a changed plan needs fresh review", async () => {
      const r = await request(users.owner, second, "omniqora", true);
      await db.query("UPDATE public.service_catalogue SET implementation_status='catalogue_only' WHERE service_key='omniqora.documents'");
      await denied(() => decide(r), "55000");
      assert.equal(await count("tenant_products", second), 0); assert.equal(await count("tenant_services", second), 0);
      await db.query("UPDATE public.service_catalogue SET implementation_status='built_main' WHERE service_key='omniqora.documents'");
      await db.query("INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES('omniqora.campaigns','omniqora.connect') ON CONFLICT DO NOTHING");
      await denied(() => decide(r), "40001");
      await db.query("DELETE FROM public.service_dependencies WHERE service_key='omniqora.campaigns' AND depends_on_service_key='omniqora.connect'");
      await decide(r, users.platformAdmin, "rejected", "Review a fresh plan");
    });
    await check("remote product activation requires saved independent verification and does not write the connector", async () => {
      const remote = await tenant("Remote setup workspace");
      const r = await request(users.owner, remote, "merqora", false);
      assert((await setup(users.owner, remote, "merqora", false)).blockers.some((item) => item.code === "product_connection_required"));
      await denied(() => decide(r), "55000");
      await db.query("INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,status) VALUES($1,'merqora','remote-fixture','connected')", [remote]);
      await denied(() => decide(r), "55000");
      await db.query("UPDATE public.product_connections SET last_verified_at=now() WHERE tenant_id=$1", [remote]);
      const before = await one("SELECT to_jsonb(c) value FROM public.product_connections c WHERE tenant_id=$1", [remote]);
      const result = await decide(r);
      assert.equal(result.receipt.productActivated, true);
      assert.deepEqual(await one("SELECT to_jsonb(c) value FROM public.product_connections c WHERE tenant_id=$1", [remote]), before);
    });
    await check("writer setup uses exact scope, preserves unrelated config and cannot restore disabled bindings", async () => {
      const id = await writer();
      let binding = await one("SELECT to_jsonb(b) value FROM public.provider_bindings b WHERE id=$1", [id]);
      assert.equal(binding.status, "configured"); assert.equal(binding.last_verified_at, null);
      assert.equal(binding.secret_refs.api_key, `env:OQ_SECRET_GROWTH_${first.replaceAll("-", "").toUpperCase()}_OMNIQORA_OPENAI`);
      assert.equal(binding.config.max_output_tokens, 2048);
      await db.query("UPDATE public.provider_bindings SET config=config||'{\"unrelated\":\"preserve\"}',secret_refs=secret_refs||'{\"other_secret\":\"env:EXISTING_REFERENCE\"}' WHERE id=$1", [id]);
      assert.equal(await writer(users.admin, first, "omniqora", "ai.openai", "fixture-second-model", 512), id);
      binding = await one("SELECT to_jsonb(b) value FROM public.provider_bindings b WHERE id=$1", [id]);
      assert.equal(binding.config.unrelated, "preserve"); assert.equal(binding.secret_refs.other_secret, "env:EXISTING_REFERENCE");
      await db.query("UPDATE public.provider_bindings SET status='disabled' WHERE id=$1", [id]);
      await denied(() => writer(), "55000");
      assert.equal(await one("SELECT status value FROM public.provider_bindings WHERE id=$1", [id]), "disabled");
      await denied(() => writer(users.owner, first, "omniqora", "payments.adyen"), "22023");
      await denied(() => writer(users.owner, first, "omniqora", "ai.openai", "bad model"), "22023");
      await denied(() => writer(users.owner, first, "omniqora", "ai.openai", "fixture", 256), "22023");
      await denied(() => writer(users.otherOwner), "42501");
    });
    await check("tenant suspension blocks setup and existing runtime access without changing records", async () => {
      const r = await request();
      await db.query("UPDATE public.tenants SET status='suspended' WHERE id=$1", [first]);
      const state = await setup(users.owner);
      assert.equal(state.permissions.canRequest, false); assert.equal(state.access.allowed, false);
      await denied(() => request(), "55000"); await denied(() => writer(), "55000"); await denied(() => decide(r), "55000");
      assert.equal((await setup(users.platformAdmin)).access.allowed, false);
      await db.query("UPDATE public.tenants SET status='active' WHERE id=$1", [first]);
    });
    console.log(`Verified ${files.length} migrations for ${profile}.`);
  } finally { await db.close(); }
}

await runSuite("hosted subset");
await runSuite("complete repository");
console.log(`Growth setup: ${checks} database groups passed across both deployment profiles.`);
