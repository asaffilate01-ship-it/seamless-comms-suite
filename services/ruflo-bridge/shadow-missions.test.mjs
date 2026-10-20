import assert from "node:assert/strict";
import test from "node:test";
import {
 createSyntheticRufloMission,listSyntheticRufloScenarios,rehearseSyntheticRufloMission,
} from "./shadow-missions.mjs";

test("synthetic missions cover Dishbee, Finvessa and Omniqora without model or customer data",()=>{
 const scenarios=listSyntheticRufloScenarios();
 assert.equal(scenarios.length,3);
 for(const s of scenarios){
  const p=createSyntheticRufloMission({scenarioKey:s.key,productKey:s.productKey});
  assert.equal(p.mode,"synthetic_only");
  assert.deepEqual(p.allowedActions,[]);assert.deepEqual(p.allowedTools,[]);
  assert.deepEqual(p.steps.map(x=>x.role),["coordinator","analyst","independent_verifier"]);
  const result=rehearseSyntheticRufloMission(p);
  assert.equal(result.verified,true);
  assert.equal(result.approvedToExecute,false);
  assert.equal(result.modelCalls,0);assert.equal(result.externalToolCalls,0);
  assert.equal(result.customerData,false);
  assert.equal(result.financialActions,0);
  assert.equal(result.evidenceDigest,rehearseSyntheticRufloMission(p).evidenceDigest);
 }
});
test("mismatched products, injected write capabilities and unfamiliar scenarios fail closed",()=>{
 assert.throws(()=>createSyntheticRufloMission({scenarioKey:"dishbee.synthetic-menu",productKey:"finvessa"}),/mismatch/);
 assert.throws(()=>createSyntheticRufloMission({scenarioKey:"unknown",productKey:"dishbee"}),/Unapproved/);
 const plan=createSyntheticRufloMission({scenarioKey:"dishbee.synthetic-menu",productKey:"dishbee"});
 for(const change of [{allowedTools:["filesystem.write"]},{modelCalls:1},{tokenBudget:1},{steps:[]}])
  assert.throws(()=>rehearseSyntheticRufloMission({...plan,...change}),/contract|may not execute/);
});
test("independent synthetic verifier refuses tampered analysis, missing evidence and no verifier",()=>{
 const plan=createSyntheticRufloMission({scenarioKey:"finvessa.synthetic-control",productKey:"finvessa"});
 for(const injectFault of ["alter_metric","skip_evidence","skip_verifier"]){
  const result=rehearseSyntheticRufloMission(plan,{injectFault});
  assert.equal(result.verified,false);
  assert.equal(result.statuses.at(-1),"blocked");
  assert.equal(result.approvedToExecute,false);
 }
});
