/**
 * Finvessa TreasuryOS Phase 5 — trusted read-only source admission.
 *
 * This module is an independent, pure policy and test harness. It never
 * connects to a bank/ERP, fetches URLs, handles credentials, stores customer
 * records, pays suppliers or authorises a daily job. Actual vendor access
 * must be implemented by a separately approved, authenticated server worker.
 */
import {analyseTreasury, isoDate, type TreasuryInputs} from "./engine";
import {assessLiquidityRisk} from "./liquidity-risk";
import {makeTreasuryAnalystPack, type TreasuryPack} from "./analyst-pack";

export const REQUIRED_TREASURY_SOURCES = [
  "bank_opening", "bank_transactions", "cash_general_ledger",
  "cash_forecast", "liquidity_policy"
] as const;
export type TreasurySourceKind = typeof REQUIRED_TREASURY_SOURCES[number];
export type TreasuryConnectorFamily = "bank_api" | "erp_api" | "managed_sftp" | "managed_file";
export type TreasuryConnectionStatus =
  "unverified" | "sandbox_verified" | "production_verified" | "suspended";
export interface TreasurySourceBinding {
  tenantId: string;
  productKey: "finvessa";
  sourceKind: TreasurySourceKind;
  providerFamily: TreasuryConnectorFamily;
  providerKey: string;
  connectionStatus: TreasuryConnectionStatus;
  readOnly: boolean;
  scopes: readonly string[];
  proofReference: string | null;
  verifiedAt: string | null;
  validUntil: string | null;
  lastSuccessfulReadAt: string | null;
  /** Non-secret verification metadata only; never expose access tokens or vault paths. */
}
export interface TreasurySourceReadiness {
  status: "blocked" | "sandbox_shadow_only";
  tenantId: string;
  covered: TreasurySourceKind[];
  missing: TreasurySourceKind[];
  blockers: string[];
  /** Always false until a separately approved production runner is deployed. */
  productionExecutionAllowed: false;
}
export const REQUIRED_READ_SCOPES: Readonly<Record<TreasurySourceKind,string>> = Object.freeze({
  bank_opening:"treasury.bank.opening.read",
  bank_transactions:"treasury.bank.transactions.read",
  cash_general_ledger:"treasury.erp.cash-ledger.read",
  cash_forecast:"treasury.finance.forecast.read",
  liquidity_policy:"treasury.policy.liquidity.read"
});
const allowedKinds = new Set<string>(REQUIRED_TREASURY_SOURCES);
const digits64=/^[a-f0-9]{64}$/;
function parseInstant(value:string):number {
  const parsed=Date.parse(value);
  if(!value || !Number.isFinite(parsed) || !/Z$/.test(value))
    throw new Error("Source freshness requires an exact UTC timestamp.");
  return parsed;
}
function checkedProviderKey(key:string):boolean {
  return /^[a-z][a-z0-9.-]{1,79}$/.test(key);
}
export function evaluateTreasurySourceReadiness(input:{
  tenantId:string;bindings:readonly TreasurySourceBinding[];at:string;
}):TreasurySourceReadiness {
  const now=parseInstant(input.at);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.tenantId))
    throw new Error("A valid tenant identity is required.");
  const blockers:string[]=[];
  const covered:TreasurySourceKind[]=[];
  const seen=new Set<string>();
  for(const b of input.bindings){
    if(!b || b.tenantId!==input.tenantId || b.productKey!=="finvessa" || !allowedKinds.has(b.sourceKind)){
      blockers.push("Invalid, foreign-tenant or unsupported source binding.");
      continue;
    }
    if(seen.has(b.sourceKind)) {
      blockers.push("Duplicate source binding for "+b.sourceKind+".");
      continue;
    }
    seen.add(b.sourceKind);
    if(!checkedProviderKey(b.providerKey) ||
       !["bank_api","erp_api","managed_sftp","managed_file"].includes(b.providerFamily)) {
      blockers.push(b.sourceKind+": provider source is not a reviewed connector family.");continue;
    }
    if(!b.readOnly || b.scopes.some(s=>/\b(write|pay|transfer|trade|delete|submit|execute)\b/i.test(s)) ||
       !b.scopes.includes(REQUIRED_READ_SCOPES[b.sourceKind])) {
      blockers.push(b.sourceKind+": read-only scope and capability verification required.");continue;
    }
    if(!["sandbox_verified","production_verified"].includes(b.connectionStatus) ||
       !b.proofReference || !/^[a-z0-9._:/-]{8,180}$/i.test(b.proofReference)) {
      blockers.push(b.sourceKind+": verified connector proof is missing or connection suspended.");continue;
    }
    try{
      if(!b.verifiedAt || !b.validUntil || !b.lastSuccessfulReadAt){
        blockers.push(b.sourceKind+": incomplete verification timestamps.");continue;
      }
      const verified=parseInstant(b.verifiedAt),expires=parseInstant(b.validUntil),read=parseInstant(b.lastSuccessfulReadAt);
      if(verified>now || read>now || expires<=now ||
         now-verified>30*86400_000 || now-read>24*3600_000){
        blockers.push(b.sourceKind+": stale, expired or future-dated source verification.");continue;
      }
    }catch{
      blockers.push(b.sourceKind+": invalid verification timestamp.");continue;
    }
    covered.push(b.sourceKind);
  }
  const missing=REQUIRED_TREASURY_SOURCES.filter(kind=>!covered.includes(kind));
  for(const kind of missing) {
    if(!blockers.some(x=>x.startsWith(kind+":")||x.includes("for "+kind+".")))
      blockers.push(kind+": no independently verified read-only source.");
  }
  return {
    status:blockers.length?"blocked":"sandbox_shadow_only",
    tenantId:input.tenantId,covered,missing,blockers,
    productionExecutionAllowed:false
  };
}

/** In-memory input contract for a future separately authorised server worker. */
export interface TreasuryTrustedEnvelope {
  tenantId:string;
  sourceKind:TreasurySourceKind;
  providerKey:string;
  receivedAt:string;
  /** Verified by the future server worker, not asserted by a browser. */
  sourceDigest:string;
  canonicalCsv:string;
}
export interface TreasuryShadowResult {
  status:"shadow_only";
  productionExecutionAllowed:false;
  tenantId:string;
  reportDate:string;
  sourceDigests:Record<TreasurySourceKind,string>;
  report:TreasuryPack;
  sourceStatus:string;
  riskStatus:string;
}
/**
 * This is a pure deterministic computation and must NOT be exposed as a public
 * endpoint accepting user-supplied "verified" sources. The future connector
 * worker must independently validate signatures, proof receipts and hashes.
 */
export function runTreasuryShadowAnalysis(input:{
  tenantId:string;bindings:readonly TreasurySourceBinding[];
  envelopes:readonly TreasuryTrustedEnvelope[];
  reportDate:string;now:string;
}):TreasuryShadowResult {
  isoDate(input.reportDate,"Treasury shadow report date");
  if(Date.parse(input.reportDate+"T23:59:59Z")>parseInstant(input.now))
    throw new Error("Future report dates cannot be processed.");
  const admission=evaluateTreasurySourceReadiness({
    tenantId:input.tenantId,bindings:input.bindings,at:input.now
  });
  if(admission.status!=="sandbox_shadow_only" || admission.blockers.length)
    throw new Error("Treasury source verification is incomplete; shadow analysis refused.");
  const byKind=new Map<TreasurySourceKind,TreasuryTrustedEnvelope>();
  for(const item of input.envelopes){
    if(item.tenantId!==input.tenantId || !allowedKinds.has(item.sourceKind))
      throw new Error("Foreign tenant or unknown source evidence rejected.");
    if(byKind.has(item.sourceKind))
      throw new Error("Duplicate financial source snapshot rejected.");
    const binding=input.bindings.find(b=>b.sourceKind===item.sourceKind && b.tenantId===item.tenantId);
    if(!binding || item.providerKey!==binding.providerKey)
      throw new Error("Source provider does not match verified connector.");
    if(!digits64.test(item.sourceDigest))
      throw new Error("Trusted source must have a SHA-256 evidence digest.");
    const read=parseInstant(item.receivedAt);
    const now=parseInstant(input.now);
    if(read>now || now-read>24*3600_000)
      throw new Error("Source evidence is stale or future-dated.");
    if(!item.canonicalCsv || item.canonicalCsv.length>2_000_000)
      throw new Error("No validated or bounded financial source provided.");
    byKind.set(item.sourceKind,item);
  }
  if(byKind.size!==REQUIRED_TREASURY_SOURCES.length)
    throw new Error("All five treasury source kinds must be supplied.");
  const get=(kind:TreasurySourceKind)=>byKind.get(kind)!.canonicalCsv;
  const inputs:TreasuryInputs={
    accountsCSV:get("bank_opening"),transactionsCSV:get("bank_transactions"),
    ledgerCSV:get("cash_general_ledger"),forecastCSV:get("cash_forecast"),
    reportDate:input.reportDate,demo:false
  };
  const report=analyseTreasury(inputs);
  const risk=assessLiquidityRisk(report,get("liquidity_policy"));
  return {
    status:"shadow_only",tenantId:input.tenantId,reportDate:input.reportDate,
    productionExecutionAllowed:false,
    sourceDigests:Object.fromEntries(
      REQUIRED_TREASURY_SOURCES.map(x=>[x,byKind.get(x)!.sourceDigest])
    ) as Record<TreasurySourceKind,string>,
    report:makeTreasuryAnalystPack(report,risk),
    sourceStatus:report.status,riskStatus:risk.status
  };
}
