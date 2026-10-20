/**
 * Phase 9: deterministic synthetic mission rehearsals for the eventual Ruflo
 * multi-agent coordinator. Does NOT call Ruflo, any model, any API or customer
 * data. Does NOT add capabilities or bypass Omniqora action approvals.
 */
import {createHash} from "node:crypto";

const scenarios=Object.freeze({
 "dishbee.synthetic-menu":Object.freeze({
  productKey:"dishbee",title:"Synthetic menu performance brief",
  evidence:Object.freeze({orders:120,lateOrders:8,menuItems:15}),
  metric:"lateOrders",denominator:"orders",
  proposedFinding:"Synthetic late-order share",
 }),
 "finvessa.synthetic-control":Object.freeze({
  productKey:"finvessa",title:"Synthetic finance control variance",
  evidence:Object.freeze({transactions:40,exceptions:2,accounts:6}),
  metric:"exceptions",denominator:"transactions",
  proposedFinding:"Synthetic exception share",
 }),
 "omniqora.synthetic-support":Object.freeze({
  productKey:"omniqora",title:"Synthetic support exception investigation",
  evidence:Object.freeze({tickets:20,overdue:3,channels:4}),
  metric:"overdue",denominator:"tickets",
  proposedFinding:"Synthetic overdue-ticket share",
 }),
});
const roles=Object.freeze(["coordinator","analyst","independent_verifier"]);
const allowed=/^[a-z0-9][a-z0-9.-]{1,80}$/;

export function listSyntheticRufloScenarios(){
 return Object.entries(scenarios).map(([key,s])=>({
  key,productKey:s.productKey,title:s.title,mode:"synthetic_only",
  customerData:false,externalToolCalls:0,modelCalls:0,
 }));
}
export function createSyntheticRufloMission({scenarioKey,productKey}={}){
 if(typeof scenarioKey!=="string"||!Object.hasOwn(scenarios,scenarioKey))
  throw new Error("Unapproved synthetic Ruflo scenario");
 const scenario=scenarios[scenarioKey];
 if(!allowed.test(productKey??"")||scenario.productKey!==productKey)
  throw new Error("Synthetic mission product mismatch");
 const mission={
  scenarioKey,productKey,mode:"synthetic_only",
  source:"embedded_noncustomer_fixture",allowedActions:[],
  allowedTools:[],modelCalls:0,externalToolCalls:0,tokenBudget:0,
  steps:[
   {id:"plan",role:roles[0],dependsOn:[],effect:"read_only"},
   {id:"analyse",role:roles[1],dependsOn:["plan"],effect:"read_only"},
   {id:"verify",role:roles[2],dependsOn:["analyse"],effect:"read_only"},
  ],
  expectedEvidenceKeys:Object.keys(scenario.evidence).sort(),
 };
 return Object.freeze(mission);
}
/** Simulation only: deterministic process with independent evidence check. */
export function rehearseSyntheticRufloMission(mission,{injectFault=null}={}){
 if(mission?.mode!=="synthetic_only"||mission.externalToolCalls!==0||
    mission.modelCalls!==0||mission.tokenBudget!==0||mission.allowedActions?.length!==0||
    mission.allowedTools?.length!==0)
  throw new Error("Ruflo shadow run may not execute tools, models or actions");
 const baseline=createSyntheticRufloMission(mission);
 if(JSON.stringify(mission)!==JSON.stringify(baseline))
  throw new Error("Ruflo shadow run contract was modified");
 if(injectFault!==null&&!["alter_metric","skip_evidence","skip_verifier"].includes(injectFault))
  throw new Error("Unsupported synthetic fault");
 const scenario=scenarios[mission.scenarioKey];
 const input=structuredClone(scenario.evidence);
 const total=input[scenario.denominator],n=input[scenario.metric];
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(n)||total<=0||n<0||n>total)
  throw new Error("Invalid synthetic evidence");
 const numerator=injectFault==="alter_metric"?n+1:n;
 const expectedEvidence=Object.keys(input).sort();
 const providedEvidence=injectFault==="skip_evidence"?[]:expectedEvidence;
 const verified=injectFault!=="skip_verifier"&&
  numerator===n&&JSON.stringify(providedEvidence)===JSON.stringify(expectedEvidence);
 const share=Number((numerator/total*100).toFixed(2));
 const record={
  scenarioKey:mission.scenarioKey,mode:"synthetic_only",
  statuses:verified?["planned","analysed","verified"]:["planned","analysed","blocked"],
  verified,
  summary:verified?scenario.proposedFinding+": "+share+"%":"Synthetic verification withheld",
  evidenceKeys:providedEvidence,
  agentRoles:roles,
  approvedToExecute:false,
  modelCalls:0,externalToolCalls:0,customerData:false,financialActions:0,
 };
 const fingerprint=createHash("sha256").update(JSON.stringify(record)).digest("hex");
 return Object.freeze({...record,evidenceDigest:fingerprint});
}
