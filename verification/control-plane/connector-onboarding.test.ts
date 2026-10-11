import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {connectorSetupCatalogue} from "../../src/modules/connectors/onboarding-catalogue";

test("setup directory has unique official HTTPS destinations and tiered requirements", () => {
 const keys=new Set<string>();
 for(const item of connectorSetupCatalogue){
  assert.ok(!keys.has(item.key), `duplicate provider ${item.key}`);
  keys.add(item.key);
  const uri=new URL(item.url);
  assert.equal(uri.protocol,"https:",item.key);
  assert.equal(uri.username,"");
  assert.equal(uri.password,"");
  assert.ok(item.required.trim().length>15,item.key);
  assert.ok(["pilot","next","optional"].includes(item.priority));
 }
 for(const key of ["twilio","twilio-whatsapp","twilio-proxy","openai","adyen","routes","uber-direct","jet-go","supabase"]){
  assert.ok(keys.has(key),`missing onboarding entry ${key}`);
 }
});

test("operator health notes cannot activate, authenticate or verify provider bindings",async()=>{
 const functions=await readFile(new URL("../../src/modules/connectors/functions.ts",import.meta.url),"utf8");
 const hub=await readFile(new URL("../../src/routes/_authenticated/app.connector-hub.tsx",import.meta.url),"utf8");
 assert.match(functions,/recordConnectorObservation=createServerFn/);
 assert.match(functions,/provider_bindings"\)\.select\("id,tenant_id,product_key,provider_key,environment,status,last_verified_at"\)/);
 assert.doesNotMatch(functions,/provider_bindings"\)\.select\("\*"\)/);
 assert.match(functions,/status:z\.literal\("unverified"\)/);
 assert.match(functions,/requireAdminRole\(access\.role\)/);
 assert.match(functions,/\.eq\("provider_key",data\.providerKey\)\.eq\("id",data\.bindingId\)/);
 const block=functions.slice(functions.indexOf("export const recordConnectorObservation"),functions.indexOf("const sync=scope.extend"));
 assert.doesNotMatch(block,/provider_bindings"\)\.update/);
 assert.doesNotMatch(block,/last_verified_at\s*:/);
 assert.doesNotMatch(hub,/Mark healthy/);
 assert.doesNotMatch(hub,/recordConnectorHealth/);
 assert.match(hub,/status:"unverified"/);
 assert.match(hub,/Third-party accounts and setup links/);
});
