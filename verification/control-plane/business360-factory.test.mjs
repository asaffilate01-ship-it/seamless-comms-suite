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

const product=(await db.query("SELECT * FROM public.product_catalogue WHERE product_key='business360'")).rows[0];
assert.equal(product.parent_product_key,'omniqora');
assert.equal(product.product_role,'landlord');
assert.equal(product.deployment_mode,'hybrid');
assert.equal(product.implementation_status,'built_main');
assert.equal(product.metadata.liveVerified,false);
const service=(await db.query("SELECT * FROM public.service_catalogue WHERE service_key='business360.core'")).rows[0];
assert.equal(service.provisioning_mode,'manual');
assert.equal(service.owner_product_key,'business360');
const mappings=(await db.query("SELECT * FROM public.product_services WHERE service_key='business360.core' ORDER BY product_key")).rows;
assert.deepEqual(mappings.map(r=>r.product_key),['business360','omniqora']);
assert.equal(mappings[1].default_enabled,false);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.tenant_services WHERE service_key='business360.core'")).rows[0].n,0);
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.tenant_products WHERE product_key='business360'")).rows[0].n,0);
const blueprint=(await db.query("SELECT * FROM public.blueprint_products WHERE blueprint_key='business360-advisory'")).rows;
assert.equal(blueprint.length,1);assert.equal(blueprint[0].product_key,'business360');
await db.exec(await readFile(new URL('20261005063000_business360_factory.sql',migrations),'utf8'));
assert.equal((await db.query("SELECT count(*)::int AS n FROM public.product_catalogue WHERE product_key='business360'")).rows[0].n,1);
await db.close();console.log('Business360 Factory registration, manual activation and repeat migration checks passed.');
const ts=await import('typescript');
const policy=await readFile(new URL('../../src/modules/control-plane/provisioning-policy.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(policy,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {decideProvisioning}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
assert.equal(decideProvisioning({job:{target_kind:'product',target_key:'business360',action:'provision'},product}).outcome,'block');
assert.equal(decideProvisioning({job:{target_kind:'service',target_key:'business360.core',action:'provision'},service}).outcome,'block');
console.log('Business360 product and service require deliberate activation.');
