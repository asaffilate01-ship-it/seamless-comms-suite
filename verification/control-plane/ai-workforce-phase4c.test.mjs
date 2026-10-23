import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  buildSyntheticModelPrompt,validateReadOnlyProbePolicy,
  buildReadOnlyResponsesPayload,runSyntheticReadOnlyModelProbe
} from "../../services/ai-workforce-readonly/model-probe.mjs";
import {main} from "../../services/ai-workforce-readonly/operator-probe.mjs";

const policy=()=>({
 operatorApproved:true,syntheticOnly:true,
 allowExternalWrites:false,allowTools:false,
 modelId:"gpt-4.1-mini",currency:"GBP",
 evidenceRef:"https://platform.openai.com/docs/pricing",
 operatorReference:"Staging reviewer approved bounded synthetic test",
 rateVerifiedAt:new Date().toISOString(),
 inputMinorPerMillion:200,outputMinorPerMillion:800,
 maxCostMinor:10,maxOutputTokens:128,
});
const token="secret_"+ "a".repeat(36);
function stubResponse(data){
 return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data)};
}
const fakeData=(opts={})=>({
 id:"resp_test",
 status:"completed",
 output:[{type:"message",content:[{type:"output_text",text:"Synthetic test report: review CRM conversion rates."}]}],
 usage:{input_tokens:90,output_tokens:25},
 ...opts,
});
test("model policy fails closed on missing approval, stale rate and insufficient budget",()=>{
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),operatorApproved:false}),/approved/);
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),allowTools:true}),/approved/);
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),allowExternalWrites:true}),/approved/);
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),rateVerifiedAt:"2020-01-01T00:00:00Z"}),/stale/);
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),maxCostMinor:1}),/upper bound/);
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),modelId:"../../../secrets"}),/approved/);
 assert.throws(()=>validateReadOnlyProbePolicy({...policy(),evidenceRef:"http://example.com"}),/approved/);
});
test("synthetic model input never includes customer data or access tokens",()=>{
 const prompt=buildSyntheticModelPrompt("fixture.crm.pipeline");
 assert.match(prompt,/synthetic_fixture/);
 assert.match(prompt,/qualified/i);
 assert.throws(()=>buildSyntheticModelPrompt("http://evil.example/private"),/synthetic/);
 const payload=buildReadOnlyResponsesPayload({fixtureKey:"fixture.dishbee.orders",policy:policy()});
 assert.equal(payload.store,false);
 assert.equal(payload.background,false);
 assert.equal(payload.tool_choice,"none");
 assert.deepEqual(payload.tools,[]);
 assert.equal(payload.max_output_tokens,128);
 assert.equal(payload.stream,false);
 assert.ok(payload.input[0].content.length<1800);
 assert.ok(!JSON.stringify(payload).includes("SUPABASE_SERVICE_ROLE_KEY"));
});
test("model probe performs exactly one fixed-origin, no-tools, non-stored API request",async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return stubResponse(fakeData());
 };
 const result=await runSyntheticReadOnlyModelProbe({
  policy:policy(),fixtureKey:"fixture.crm.pipeline",providerToken:token,fetcher,
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"https://api.openai.com/v1/responses");
 assert.equal(calls[0].options.method,"POST");
 assert.equal(calls[0].options.redirect,"error");
 const request=JSON.parse(calls[0].options.body);
 assert.equal(request.store,false);
 assert.equal(request.tool_choice,"none");
 assert.deepEqual(request.tools,[]);
 assert.equal(result.customerDataRead,false);
 assert.equal(result.customerActions,0);
 assert.equal(result.modelCalls,1);
 assert.equal(result.toolCalls,0);
 assert.equal(result.reviewRequired,true);
 assert.equal(result.costEstimateOnly,true);
 assert.equal(result.dataOrigin,"synthetic_fixture");
 assert.equal(result.inputTokens,90);
 assert.equal(result.outputTokens,25);
 assert.ok(result.estimatedCostMinor<=10);
});
test("malicious tool output, missing usage and overlong response are rejected",async()=>{
 const input={policy:policy(),fixtureKey:"fixture.crm.pipeline",providerToken:token};
 await assert.rejects(runSyntheticReadOnlyModelProbe({
  ...input,fetcher:async()=>stubResponse(fakeData({output:[{type:"function_call",name:"delete_users"}]}))
 }),/tool output/);
 await assert.rejects(runSyntheticReadOnlyModelProbe({
  ...input,fetcher:async()=>stubResponse(fakeData({usage:null}))
 }),/usage/);
 await assert.rejects(runSyntheticReadOnlyModelProbe({
  ...input,fetcher:async()=>stubResponse(fakeData({status:"incomplete"}))
 }),/Incomplete/);
 await assert.rejects(runSyntheticReadOnlyModelProbe({
  ...input,fetcher:async()=>stubResponse(fakeData({output:[{
   type:"message",content:[{type:"output_text",text:"x".repeat(3501)}],
  }]}))
 }),/Unbounded/);
 await assert.rejects(runSyntheticReadOnlyModelProbe({
  ...input,fetcher:async()=>({
    ok:true,headers:{get:()=>String(100000)},
    text:async()=>"{}"
  })
 }),/byte cap|Invalid model/);
});
test("operator CLI refuses production and defaults without touching network",async()=>{
 await assert.rejects(main({}),/disabled/);
 await assert.rejects(main({
   AI_WORKFORCE_MODEL_PILOT_ENABLED:"true",AI_WORKFORCE_MODEL_PILOT_CONFIRM:"SYNTHETIC_ONLY_APPROVED",
   NODE_ENV:"production",
 }),/disabled/);
 await assert.rejects(main({
   AI_WORKFORCE_MODEL_PILOT_ENABLED:"true",AI_WORKFORCE_MODEL_PILOT_CONFIRM:"SYNTHETIC_ONLY_APPROVED",
 }),/Missing verified/);
});
test("no model connector wired into customer runtime without separate budget admission",async()=>{
 const adapter=await readFile(new URL("../../services/ai-workforce-readonly/model-probe.mjs",import.meta.url),"utf8");
 const cli=await readFile(new URL("../../services/ai-workforce-readonly/operator-probe.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(adapter,/queue_budgeted_ai_agent|startAgentRun|\.rpc\(/);
 assert.doesNotMatch(cli,/queue_budgeted_ai_agent|\.rpc\(/);
 assert.match(cli,/SYNTHETIC_ONLY_APPROVED/);
 assert.match(cli,/env\.NODE_ENV==="production"/);
 assert.match(adapter,/https:\/\/api\.openai\.com\/v1\/responses/);
 assert.doesNotMatch(cli,/process\.stdout\.write\(result\.summary/);
});
