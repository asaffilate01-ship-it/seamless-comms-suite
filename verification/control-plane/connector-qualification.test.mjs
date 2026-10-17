import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(relative){
  const source=await readFile(new URL(relative,import.meta.url),"utf8");
  const compiled=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    reportDiagnostics:true,
  });
  assert.equal(compiled.diagnostics?.length??0,0);
  const mod={exports:{}};
  vm.runInNewContext(compiled.outputText,{module:mod,exports:mod.exports,Set,Map,Object,Array});
  return mod.exports;
}
const {inspectConnectorSource}=await load("../../src/modules/connectors/connector-intelligence.ts");
const {proposeMcpManifest,assessSandboxPreparation,SANDBOX_CHECKLIST}=
  await load("../../src/modules/connectors/connector-qualification.ts");

const fixture=JSON.stringify({
  openapi:"3.0.3",
  servers:[{url:"https://sensitive-test.example.net"}],
  paths:{
    "/v1/catalogue":{get:{parameters:[{in:"query",name:"language"},{in:"query",name:"accessToken"}],
      responses:{"200":{content:{"application/json":{schema:{properties:{items:{},token:{}}}}}}}}},
    "/v1/products/{id}":{get:{responses:{"200":{}}}},
    "/v1/orders/{id}":{get:{responses:{"200":{}}}},
    "/v1/cards":{get:{responses:{"200":{}}}},
    "/v1/catalogue/upload":{post:{requestBody:{content:{"application/json":{schema:{properties:{assetName:{}}}}}},responses:{"200":{}}}},
    "/v1/transfers":{post:{responses:{"200":{}}}},
  }
});

test("Proposes inert MCP descriptors for generic read paths and quarantines sensitive/modified endpoints",()=>{
  const discovery=inspectConnectorSource("openapi",fixture);
  const proposal=proposeMcpManifest(discovery,"catalogue-provider");
  assert.equal(proposal.schemaVersion,1);
  assert.equal(proposal.proposalOnly,true);
  assert.equal(proposal.runtimeTransport,"none");
  assert.equal(proposal.authentication,"not_configured");
  assert.equal(proposal.vendorApproval,"not_verified");
  assert.equal(proposal.tenantGrant,"not_configured");
  assert.equal(proposal.tools.length,2);
  assert.equal(proposal.quarantined.length,4);
  for(const t of proposal.tools) {
    assert.equal(t.annotations.readOnlyHint,true);
    assert.equal(t.annotations.destructiveHint,false);
    assert.equal(t.qualification.state,"proposal_only");
    assert.equal(t.qualification.requiresHumanApproval,true);
    assert.equal(t.qualification.independentlyVerified,false);
  }
  assert.ok(proposal.tools[0].inputSchema.properties.query);
  assert.ok(proposal.tools[1].inputSchema.properties.pathParams);
  assert.deepEqual(Object.keys(proposal.tools[1].inputSchema.properties.pathParams.properties),["id"]);
  assert.ok(proposal.quarantined.some(op=>op.path==="/v1/orders/{id}"));
  assert.ok(proposal.quarantined.some(op=>op.path==="/v1/transfers"));
});

test("No captured credentials, hostnames, response bodies or example values are exposed in MCP proposals",()=>{
  const discovery=inspectConnectorSource("openapi",fixture);
  discovery.sourceHost="private-gateway.example.net";
  discovery.authentication=["bearer","SECRET_TOKEN_FROM_CAPTURE"];
  discovery.warnings=["private@example.net","Do something you should not do"];
  const output=JSON.stringify(proposeMcpManifest(discovery,"catalogue-provider"));
  for(const secret of ["private-gateway.example.net","SECRET_TOKEN_FROM_CAPTURE","private@example.net","sensitive-test.example.net","accessToken"])
    assert.equal(output.includes(secret),false,secret);
  assert.match(output,/review/i);
  assert.doesNotMatch(output,/"serverUrl"|"executeUrl"|"credentialValue"|"authorization"/i);
});

test("Unknown or forged discovery, provider and operation metadata fail closed",()=>{
  const base=inspectConnectorSource("openapi",fixture);
  assert.throws(()=>proposeMcpManifest(base,"../../root"),/Provider key/);
  assert.throws(()=>proposeMcpManifest(base,"Provider"),/Provider key/);
  const tampered={...base,status:"live"};
  assert.throws(()=>proposeMcpManifest(tampered,"example-vendor"),/review-only/);
  const malicious={...base,operations:[{...base.operations[0],path:"//evil.com/?token=foo"}]};
  assert.throws(()=>proposeMcpManifest(malicious,"example-vendor"),/unsafe operation/);
  const injected={...base,operations:[{...base.operations[0],id:"ok'); malicious();"}]};
  assert.throws(()=>proposeMcpManifest(injected,"example-vendor"),/unsafe operation/);
  const oversize={...base,operations:Array.from({length:81},()=>base.operations[0])};
  assert.throws(()=>proposeMcpManifest(oversize,"example-vendor"),/review-only/);
});

test("Operator checklist never treats self-attestation as live supplier or tenant approval",()=>{
  const empty=assessSandboxPreparation({});
  assert.equal(empty.completed,0);
  assert.equal(empty.executable,false);
  assert.equal(empty.canActivateProvider,false);
  const fake=assessSandboxPreparation(Object.fromEntries(SANDBOX_CHECKLIST.map(x=>[x.key,true])));
  assert.equal(fake.completed,fake.total);
  assert.equal(fake.status,"manual_review_required");
  assert.equal(fake.canActivateProvider,false);
  assert.equal(fake.executable,false);
});

test("Qualification UI never invokes network, models, tenant grants or the provider",async()=>{
  const panel=await readFile(new URL("../../src/modules/connectors/ConnectorQualificationPanel.tsx",import.meta.url),"utf8");
  const host=await readFile(new URL("../../src/modules/connectors/ConnectorIntelligenceWorkbench.tsx",import.meta.url),"utf8");
  assert.match(host,/ConnectorQualificationPanel/);
  assert.match(panel,/proposeMcpManifest/);
  assert.match(panel,/Independent review required/);
  assert.doesNotMatch(panel,/\bfetch\s*\(|useServerFn|localStorage|sessionStorage|XMLHttpRequest|provider_bindings|service_role/i);
});
