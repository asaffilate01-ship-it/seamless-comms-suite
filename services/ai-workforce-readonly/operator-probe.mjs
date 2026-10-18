#!/usr/bin/env node
/**
 * Operator-only SINGLE synthetic model request. No tenant data, DB, MCP, tools,
 * scheduler or customer actions. Disabled by default and refused in production.
 */
import {pathToFileURL} from "node:url";
import {runSyntheticReadOnlyModelProbe} from "./model-probe.mjs";

export async function main(env=process.env){
 if(env.AI_WORKFORCE_MODEL_PILOT_ENABLED!=="true"||
    env.AI_WORKFORCE_MODEL_PILOT_CONFIRM!=="SYNTHETIC_ONLY_APPROVED"||
    env.NODE_ENV==="production"){
  throw new Error("Model probe disabled. Staging operator approval required.");
 }
 const required=["AI_WORKFORCE_MODEL_ID","AI_WORKFORCE_TARIFF_VERIFIED_AT",
  "AI_WORKFORCE_TARIFF_EVIDENCE_URL","AI_WORKFORCE_OPERATOR_REFERENCE",
  "AI_WORKFORCE_INPUT_RATE_MINOR","AI_WORKFORCE_OUTPUT_RATE_MINOR",
  "AI_WORKFORCE_MAX_PROBE_COST_MINOR","AI_WORKFORCE_PROVIDER_TOKEN"];
 if(required.some(k=>!env[k]))throw new Error("Missing verified model pilot configuration");
 const numeric=k=>Number(env[k]);
 const policy={
  operatorApproved:true,syntheticOnly:true,allowExternalWrites:false,allowTools:false,
  modelId:env.AI_WORKFORCE_MODEL_ID,
  currency:env.AI_WORKFORCE_CURRENCY||"GBP",
  evidenceRef:env.AI_WORKFORCE_TARIFF_EVIDENCE_URL,
  operatorReference:env.AI_WORKFORCE_OPERATOR_REFERENCE,
  rateVerifiedAt:env.AI_WORKFORCE_TARIFF_VERIFIED_AT,
  inputMinorPerMillion:numeric("AI_WORKFORCE_INPUT_RATE_MINOR"),
  outputMinorPerMillion:numeric("AI_WORKFORCE_OUTPUT_RATE_MINOR"),
  maxCostMinor:numeric("AI_WORKFORCE_MAX_PROBE_COST_MINOR"),
  maxOutputTokens:128,
 };
 const result=await runSyntheticReadOnlyModelProbe({
  fixtureKey:"fixture.crm.pipeline",policy,providerToken:env.AI_WORKFORCE_PROVIDER_TOKEN,
 });
 // Never log the token, raw request or response text to unattended CI output.
 process.stdout.write(JSON.stringify({
   syntheticOnly:true,modelCalls:result.modelCalls,toolCalls:result.toolCalls,
   customerDataRead:result.customerDataRead,manualReviewRequired:true,
   estimatedCostMinor:result.estimatedCostMinor,currency:result.currency,
   costEstimateOnly:true,
 })+"\n");
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{
  process.stderr.write("Read-only synthetic model pilot refused: "+
    (e instanceof Error?e.message:"unknown").slice(0,180)+"\n");
  process.exitCode=1;
 });
}
