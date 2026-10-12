import {agentsForProduct,type AgentBlueprint,type AgentRisk} from "./catalogue";

/**
 * Cost-aware planning, not a payment reservation or live model router.
 * Rates are operator-verified inputs with a specific version and currency.
 * Unknown/stale prices are excluded, never guessed.
 */
export interface ModelTariff {
  providerKey: string;
  modelKey: string;
  currency: "GBP" | "USD" | "EUR";
  priceVersion: string;
  verifiedAt: string; // ISO timestamp of independent rate review
  inputPerMillionMinor: number;
  cachedInputPerMillionMinor?: number;
  outputPerMillionMinor: number;
  minimumRiskGrade: AgentRisk;
  approved: boolean;
  evaluationPassed: boolean;
  supportedRegions: readonly string[]; // empty means no asserted region restrictions
  supportedCapabilities: readonly string[];
}
export interface EstimatedWorkload {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  expectedToolCostMinor: number;
}
export interface ModelChoice {
  providerKey: string;
  modelKey: string;
  estimatedCostMinor: number;
  currency: string;
  priceVersion: string;
  verifiedAt: string;
}
export interface RouteRequest {
  tariffs: readonly ModelTariff[];
  currency: "GBP" | "USD" | "EUR";
  risk: AgentRisk;
  region: string;
  requiredModelCapabilities?: readonly string[];
  maxAgeDays?: number;
  runBudgetMinor: number;
  workload: EstimatedWorkload;
  now?: Date;
}
const severity: Record<AgentRisk,number>={standard:1,sensitive:2,regulated:3};
const validNonNegativeInteger=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const ceilMillion=(tokens:number,price:number)=>Math.ceil((tokens*price)/1_000_000);

/** Return nothing rather than silently estimating with imaginary or unverified rates. */
export function routeByVerifiedCost(input:RouteRequest):ModelChoice|null{
 const w=input.workload,now=input.now??new Date();
 if(!validNonNegativeInteger(input.runBudgetMinor)||!validNonNegativeInteger(w.inputTokens)||
    !validNonNegativeInteger(w.cachedInputTokens)||w.cachedInputTokens>w.inputTokens||
    !validNonNegativeInteger(w.outputTokens)||!validNonNegativeInteger(w.expectedToolCostMinor))return null;
 const rates=input.tariffs.filter(t=>{
  const age=now.getTime()-Date.parse(t.verifiedAt);
  return t.approved&&t.evaluationPassed&&t.currency===input.currency&&
   !!t.priceVersion&&Number.isFinite(age)&&age>=0&&age<=(input.maxAgeDays??30)*86400000&&
   severity[t.minimumRiskGrade]>=severity[input.risk]&&
   (t.supportedRegions.length===0||t.supportedRegions.includes(input.region))&&
   (input.requiredModelCapabilities??[]).every(k=>t.supportedCapabilities.includes(k))&&
   validNonNegativeInteger(t.inputPerMillionMinor)&&
   validNonNegativeInteger(t.outputPerMillionMinor)&&
   (t.cachedInputPerMillionMinor===undefined||validNonNegativeInteger(t.cachedInputPerMillionMinor));
 });
 return rates.map(t=>{
  const cachedRate=t.cachedInputPerMillionMinor??t.inputPerMillionMinor;
  const cost=ceilMillion(w.inputTokens-w.cachedInputTokens,t.inputPerMillionMinor)+
    ceilMillion(w.cachedInputTokens,cachedRate)+
    ceilMillion(w.outputTokens,t.outputPerMillionMinor)+w.expectedToolCostMinor;
  return{providerKey:t.providerKey,modelKey:t.modelKey,estimatedCostMinor:cost,currency:t.currency,
   priceVersion:t.priceVersion,verifiedAt:t.verifiedAt};
 }).filter(v=>v.estimatedCostMinor<=input.runBudgetMinor)
  .sort((a,b)=>a.estimatedCostMinor-b.estimatedCostMinor||a.providerKey.localeCompare(b.providerKey))[0]??null;
}

export interface AgentActivationPlan {
  blueprintKey:string;
  productKey:string;
  capabilitySet:readonly string[];
  unavailableCapabilities:string[];
  unapprovedCapabilities:string[];
  requiresHumanReview:boolean;
  /** 'design_only' is never permission to invoke tools. */
  status:"design_only" | "configuration_ready";
  reason:string;
}
export function planAgentActivation(input:{
  productKey:string;
  blueprintKey:string;
  /** Capabilities independently attested by an authenticated connector probe. */
  verifiedCapabilities:readonly string[];
  /** Explicitly granted by the product tenant; not copied from a public MCP manifest. */
  approvedCapabilities:readonly string[];
}):AgentActivationPlan|null {
 const item=agentsForProduct(input.productKey).find(x=>x.key===input.blueprintKey);
 if(!item)return null;
 const unavailable=item.requiredCapabilities.filter(cap=>!input.verifiedCapabilities.includes(cap));
 const unapproved=item.requiredCapabilities.filter(cap=>!input.approvedCapabilities.includes(cap));
 const ready=unavailable.length===0&&unapproved.length===0;
 return{
  blueprintKey:item.key,productKey:input.productKey,capabilitySet:item.requiredCapabilities,
  unavailableCapabilities:unavailable,unapprovedCapabilities:unapproved,
  requiresHumanReview:item.mode!=="read_only"||item.risk!=="standard",
  status:ready?"configuration_ready":"design_only",
  reason:ready
   ?"Connector capability checks passed; independent use-case approval, budget reservation, secret checks and per-action runtime authorisation still required."
   :"Connector verification and/or explicit tenant capability grants are missing. Do not execute.",
 };
}

export interface BlueprintSummary {
  key:string;name:string;department:string;mode:string;risk:string;capabilities:readonly string[];
}
export function listBlueprints(productKey:string):BlueprintSummary[]{
 return agentsForProduct(productKey).map((item:AgentBlueprint)=>({
  key:item.key,name:item.name,department:item.department,mode:item.mode,risk:item.risk,capabilities:item.requiredCapabilities,
 }));
}
