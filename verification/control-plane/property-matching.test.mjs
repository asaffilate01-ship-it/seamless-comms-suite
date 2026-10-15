import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";
const read=async(path)=>readFile(new URL("../../"+path,import.meta.url),"utf8");
test("property matching is offered to correct SaaS products, not unrelated or retail tenants",async()=>{
 const code=await read("src/modules/agent-factory/catalogue.ts");
 const converted=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const m={exports:{}};
 vm.runInNewContext(converted.outputText,{exports:m.exports,module:m});
 for(const productKey of ["gabley","propconnect","sharedbricks","immoviq","domureva","axiom","hmo-hub"]){
  assert.ok(m.exports.agentsForProduct(productKey).some(a=>a.key==="property.matching"),"no property match for "+productKey);
 }
 for(const key of ["merqano","dishbee","fastremit"]){
  assert.ok(!m.exports.agentsForProduct(key).some(a=>a.key==="property.matching"),"unexpected matching for "+key);
 }
 const a=m.exports.agentForProduct("gabley","property.matching");
 assert.equal(a.mode,"draft");
 assert.equal(a.risk,"sensitive");
 assert.ok(a.humanReview.includes("Never determine housing eligibility"));
});
test("property matching service is optional, non-autonomous and creates zero live tenants",async()=>{
 const sql=await read("supabase/migrations/20261012141000_property_matching_service.sql");
 assert.match(sql,/omniqora.property-matching/);
 assert.match(sql,/gabley.agency-uk/);
 assert.match(sql,/catalogue_only/);
 assert.match(sql,/source_adapter_required/);
 assert.match(sql,/false,false/);
 assert.doesNotMatch(sql,/INSERT INTO public\.tenants\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.tenant_products\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.tenant_services\b/i);
 assert.doesNotMatch(sql,/INSERT INTO public\.product_connections\b/i);
});
