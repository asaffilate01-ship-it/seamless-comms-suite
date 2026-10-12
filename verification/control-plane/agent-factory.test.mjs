import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function loadTs(relative,deps={}){
 const source=await readFile(new URL(relative,import.meta.url),"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const mod={exports:{}};
 vm.runInNewContext(compiled.outputText,{
  exports:mod.exports,module:mod,
  require(id){if(!(id in deps))throw new Error("Unapproved dependency "+id);return deps[id];},
 });
 return mod.exports;
}
const catalog=await loadTs("../../src/modules/agent-factory/catalogue.ts");
const planner=await loadTs("../../src/modules/agent-factory/planner.ts",{"./catalogue":catalog});

test("universal agent factory covers every product, plus named SaaS blueprints",()=>{
 for(const key of ["xpertjobs","autohashi","zivvo","craftvaro","gabley","taxnuvia","lawquo","eventplanr","dishbee","finvessa","haccora","kindelo","moneybridge","unipathway","formation-genie","merqano"]){
  const agents=catalog.agentsForProduct(key);
  assert.ok(agents.some(a=>a.key==="shared.daily-brief"),"missing core for "+key);
  assert.ok(agents.some(a=>a.productKeys.includes(key)),"missing vertical for "+key);
 }
 assert.ok(catalog.agentsForProduct("unregistered-saas").some(a=>a.key==="shared.crm-assistant"));
 const keys=catalog.agentBlueprints.map(x=>x.key);
 assert.equal(keys.length,new Set(keys).size);
 assert.ok(catalog.mcpConnectorFamilies.length>=15);
 assert.ok(catalog.mcpConnectorFamilies.every(f=>f.status==="catalogue_only"));
});

test("tenant tool permissions and live connector verification are both required",()=>{
 const denied=planner.planAgentActivation({productKey:"xpertjobs",blueprintKey:"xpertjobs.candidate-review",verifiedCapabilities:[],approvedCapabilities:[]});
 assert.equal(denied.status,"design_only");
 assert.deepEqual(JSON.parse(JSON.stringify(denied.unavailableCapabilities)),["recruitment.applications.read"]);
 const unapproved=planner.planAgentActivation({productKey:"xpertjobs",blueprintKey:"xpertjobs.candidate-review",
  verifiedCapabilities:["recruitment.applications.read"],approvedCapabilities:[]});
 assert.equal(unapproved.status,"design_only");
 const planned=planner.planAgentActivation({productKey:"xpertjobs",blueprintKey:"xpertjobs.candidate-review",
  verifiedCapabilities:["recruitment.applications.read"],approvedCapabilities:["recruitment.applications.read"]});
 assert.equal(planned.status,"configuration_ready");
 assert.equal(planned.requiresHumanReview,true);
 assert.match(planned.reason,/independent use-case approval/);
 assert.equal(planner.planAgentActivation({productKey:"lawquo",blueprintKey:"xpertjobs.candidate-review",
  verifiedCapabilities:[],approvedCapabilities:[]}),null);
});

const verifiedAt="2026-10-11T12:00:00.000Z",now=new Date("2026-10-12T12:00:00.000Z");
const base={currency:"GBP",priceVersion:"approved-rate-1",verifiedAt,
 inputPerMillionMinor:1000,cachedInputPerMillionMinor:100,outputPerMillionMinor:4000,
 minimumRiskGrade:"regulated",approved:true,evaluationPassed:true,supportedRegions:["GB"],supportedCapabilities:["text"]};
const rates=[
 {...base,providerKey:"provider-a",modelKey:"capable-a"},
 {...base,providerKey:"provider-b",modelKey:"capable-b",inputPerMillionMinor:500,cachedInputPerMillionMinor:undefined,outputPerMillionMinor:1000},
 {...base,providerKey:"stale",modelKey:"cheap",verifiedAt:"2025-01-01T00:00:00.000Z",inputPerMillionMinor:0,outputPerMillionMinor:0},
 {...base,providerKey:"not-evaluated",modelKey:"cheap",evaluationPassed:false,inputPerMillionMinor:0,outputPerMillionMinor:0},
];
const request={tariffs:rates,currency:"GBP",risk:"regulated",region:"GB",requiredModelCapabilities:["text"],
 runBudgetMinor:100,now,workload:{inputTokens:10000,cachedInputTokens:4000,outputTokens:3000,expectedToolCostMinor:3}};

test("cost router chooses evaluated verified cheapest model, not stale or unapproved offers",()=>{
 const choice=planner.routeByVerifiedCost(request);
 assert.equal(choice.providerKey,"provider-b");
 assert.equal(choice.estimatedCostMinor,11);
 assert.equal(planner.routeByVerifiedCost({...request,runBudgetMinor:10}),null);
 assert.equal(planner.routeByVerifiedCost({...request,region:"DE"}),null);
 assert.equal(planner.routeByVerifiedCost({...request,requiredModelCapabilities:["video"]}),null);
 assert.equal(planner.routeByVerifiedCost({...request,currency:"USD"}),null);
 assert.equal(planner.routeByVerifiedCost({...request,workload:{...request.workload,cachedInputTokens:11000}}),null);
});

test("agent registration is explicitly an assessed use case, not implicit live execution",async()=>{
 const ui=await readFile(new URL("../../src/modules/agent-factory/AgentFactoryPanel.tsx",import.meta.url),"utf8");
 const route=await readFile(new URL("../../src/routes/_authenticated/app.intelligence.tsx",import.meta.url),"utf8");
 assert.match(ui,/upsertAiUseCase/);
 assert.match(ui,/execution:"not_enabled"/);
 assert.match(ui,/Register for independent review/);
 assert.doesNotMatch(ui,/startAgentRun|createActionProposal|fetch\(/);
 assert.match(route,/AgentFactoryPanel/);
 const doc=await readFile(new URL("../../docs/ai-factory/UNIVERSAL-AGENT-FACTORY.md",import.meta.url),"utf8");
 assert.match(doc,/budget reservations/i);
 assert.match(doc,/made-up percentage savings/i);
});
