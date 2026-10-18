/**
 * Finvessa TreasuryOS Phase 7 — contracted provider READ-ONLY pilot adapters.
 *
 * TrueLayer Data v3: GET /v3/connected-accounts, sandbox origin only.
 * Xero Accounting: GET /api.xro/2.0/BankTransactions, scope
 * accounting.transactions.read, approved test organisation only.
 *
 * NO OAuth setup or production reader endpoint is installed. This is a
 * server-worker building block requiring already independently attested
 * tenant consent, approved scopes and vault-resolved ephemeral credentials.
 * It cannot initiate payments, trades, writes or customer notifications.
 *
 * TrueLayer accounts only establish account metadata, NOT balances or
 * transactions. Xero BankTransactions are cash book activity, NOT a complete
 * general ledger or a bank-issued statement. Neither output can by itself
 * satisfy the Phase 5 five-source signed treasury admission contract.
 */
import {isoDate,parseMinor} from "./engine";

export type TreasuryPilotProvider = "truelayer_data_v3" | "xero_accounting";
export type TreasuryPilotKind = "bank_account_discovery" | "accounting_cash_activity";
export type TreasuryPilotFinding =
  "SOURCE_NOT_FULL_STATEMENT" | "SOURCE_NOT_FULL_CASH_LEDGER" |
  "ACCOUNT_NOT_AUTHORISED" | "UNSUPPORTED_ACCOUNT" |
  "UNSUPPORTED_TRANSACTION" | "NOT_AUTHORISED" | "UNRECONCILED" |
  "INCOMPLETE_PAGINATION" | "NO_ELIGIBLE_RECORDS";
export interface TreasuryApprovedReadPilot {
  tenantId:string;
  productKey:"finvessa";
  provider:TreasuryPilotProvider;
  environment:"sandbox_test_only";
  approvalState:"independently_verified";
  approvalReference:string;
  approvedReadScopes:readonly string[];
  consentValidUntil:string;
  connectorProofValidUntil:string;
  accountAllowlist:readonly string[];
  /** Provider tenant or connection ID from a protected, verified server record. */
  externalConnectionId:string;
}
export interface TreasurySecretReference {
  /** Sensitive bearer token is resolved only by an approved server-side vault. */
  bearerToken:string;
  /** Never return this object to a browser, an MCP model or a persisted log. */
}
export interface TreasuryPilotAccount {
  id:string;
  currency:string;
  accountType:"current"|"savings";
  businessAccount:true;
}
export interface TreasuryPilotCashRecord {
  recordId:string;
  accountId:string;
  date:string;
  currency:string;
  signedAmountMinor:number;
  reference:string;
  reconciled:true;
}
export interface TreasuryPilotReadResult {
  provider:TreasuryPilotProvider;
  kind:TreasuryPilotKind;
  tenantId:string;
  status:"sandbox_preview_only";
  certification:"none";
  canPostLedger:false;
  canUseAsBankStatement:false;
  canUseAsFullGeneralLedger:false;
  recordsObserved:number;
  recordsAccepted:number;
  complete:false;
  accounts:TreasuryPilotAccount[];
  cashCandidates:TreasuryPilotCashRecord[];
  findings:Array<{code:TreasuryPilotFinding;reference:string}>;
  /** Read-only vendor-response provenance: no token, name, IBAN, account no. */
  provenance:{providerVersion:string;endpoint:string;httpStatus:200;observedAt:string};
}
const TRUE_LAYER_URL="https://api.truelayer-sandbox.com/v3/connected-accounts";
const XERO_URL="https://api.xero.com/api.xro/2.0/BankTransactions?page=1&pageSize=100";
const MAX_JSON_BYTES=1_000_000;
const MAX_RECORDS=100;
const OPAQUE=/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const GUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u001f\u007f]/g;

function validDateTime(value:string):number{
  const n=Date.parse(value);
  if(typeof value!=="string" || !/Z$/.test(value) || !Number.isFinite(n))
    throw new Error("Read-only pilot requires verified UTC timestamps.");
  return n;
}
function checkedText(v:unknown,max=160):string{
  if(typeof v!=="string" || !v.trim() || v.length>max)
    throw new Error("Malformed or oversized provider response field.");
  return v.trim().replace(CONTROL," ");
}
function validatePilot(p:TreasuryApprovedReadPilot,now:string){
  const t=validDateTime(now);
  if(!p || !GUID.test(p.tenantId) || p.productKey!=="finvessa" ||
     p.environment!=="sandbox_test_only" || p.approvalState!=="independently_verified" ||
     !OPAQUE.test(p.approvalReference) || !GUID.test(p.externalConnectionId))
    throw new Error("Independently verified Finvessa sandbox pilot record required.");
  if(!Array.isArray(p.accountAllowlist) || !p.accountAllowlist.length ||
     p.accountAllowlist.length>100 || p.accountAllowlist.some(x=>!OPAQUE.test(x)) ||
     new Set(p.accountAllowlist).size!==p.accountAllowlist.length)
    throw new Error("A bounded explicit account permission list is required.");
  const permitted=p.provider==="truelayer_data_v3"?["accounts"]:
    p.provider==="xero_accounting"?["accounting.transactions.read"]:null;
  if(!permitted||p.approvedReadScopes.length!==permitted.length||
     !permitted.every(s=>p.approvedReadScopes.includes(s)))
    throw new Error("Only the exact provider's read-only scopes are permitted.");
  if(validDateTime(p.consentValidUntil)<=t || validDateTime(p.connectorProofValidUntil)<=t)
    throw new Error("Provider consent or connector proof has expired.");
  if(p.provider==="truelayer_data_v3" && p.approvedReadScopes.includes("payments"))
    throw new Error("Payment scope is prohibited.");
}
function validatedToken(secret:TreasurySecretReference):string{
  const token=secret?.bearerToken;
  if(typeof token!=="string" || !/^[A-Za-z0-9._~-]{16,8192}$/.test(token))
    throw new Error("Vault bearer token is absent or malformed.");
  return token;
}
type Fetcher = (input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
async function readBoundedJson(response:Response):Promise<unknown>{
  if(!response.ok){
    if(response.status===401||response.status===403)
      throw new Error("Provider refused the read-only pilot request; re-check consent and scopes.");
    if(response.status===429)throw new Error("Provider read rate limit reached.");
    throw new Error("Read-only provider request failed.");
  }
  if(response.status!==200)throw new Error("Unexpected provider read status.");
  if(!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
    throw new Error("Provider did not return the expected JSON content type.");
  const length=response.headers.get("content-length");
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_JSON_BYTES))
    throw new Error("Provider response exceeds pilot byte limit.");
  if(!response.body)throw new Error("Provider response body missing.");
  const reader=response.body.getReader();
  const blocks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_JSON_BYTES)throw new Error("Provider response exceeds pilot byte limit.");
      blocks.push(value);
    }
  }catch(e){
    await reader.cancel().catch(()=>{});
    throw e;
  }finally{reader.releaseLock();}
  const all=new Uint8Array(total);let offset=0;
  for(const b of blocks){all.set(b,offset);offset+=b.byteLength;}
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));}
  catch{throw new Error("Provider JSON response cannot be safely decoded.");}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
    throw new Error("Provider response structure is unsupported.");
  return parsed;
}
function baseResult(p:TreasuryApprovedReadPilot,now:string):TreasuryPilotReadResult {
  return{
    provider:p.provider,
    kind:p.provider==="truelayer_data_v3"?"bank_account_discovery":"accounting_cash_activity",
    tenantId:p.tenantId,status:"sandbox_preview_only",certification:"none",
    canPostLedger:false,canUseAsBankStatement:false,
    canUseAsFullGeneralLedger:false,
    recordsObserved:0,recordsAccepted:0,complete:false,
    accounts:[],cashCandidates:[],findings:[],
    provenance:{
      providerVersion:p.provider==="truelayer_data_v3"?"data-v3":"accounting-2.0",
      endpoint:p.provider==="truelayer_data_v3"?"/v3/connected-accounts":"/api.xro/2.0/BankTransactions",
      httpStatus:200,observedAt:now
    }
  };
}
function normalizeTrueLayer(body:unknown,p:TreasuryApprovedReadPilot,r:TreasuryPilotReadResult):void{
  const raw=body as {items?:unknown;pagination?:{next_cursor?:unknown}};
  if(!Array.isArray(raw.items)||raw.items.length>MAX_RECORDS)
    throw new Error("TrueLayer accounts page is absent or exceeds pilot row bound.");
  r.recordsObserved=raw.items.length;
  const seen=new Set<string>();
  for(const item of raw.items){
    const v=item as Record<string,unknown>;
    const id=checkedText(v?.id);
    if(seen.has(id))throw new Error("Duplicate provider account identity.");
    seen.add(id);
    if(!p.accountAllowlist.includes(id)){
      r.findings.push({code:"ACCOUNT_NOT_AUTHORISED",reference:"truelayer-account"});
      continue;
    }
    if(v.customer_segment!=="business" || !["current","savings"].includes(String(v.account_type))){
      r.findings.push({code:"UNSUPPORTED_ACCOUNT",reference:id});
      continue;
    }
    const currency=checkedText(v.currency,3).toUpperCase();
    parseMinor("0",currency,"TrueLayer supported currency"); // validates scale without guessing
    r.accounts.push({id,currency,accountType:v.account_type as "current"|"savings",businessAccount:true});
  }
  r.recordsAccepted=r.accounts.length;
  if(raw.pagination?.next_cursor)r.findings.push({code:"INCOMPLETE_PAGINATION",reference:"truelayer-accounts"});
  if(!r.accounts.length)r.findings.push({code:"NO_ELIGIBLE_RECORDS",reference:"truelayer-accounts"});
  r.findings.push({code:"SOURCE_NOT_FULL_STATEMENT",reference:"accounts-only"});
}
function xeroAmount(x:unknown,currency:string):number{
  // Xero serialises most totals as JSON numbers. Reject non-cent or unsafe
  // numeric amounts; remaining figures are only review candidates, not a
  // booked ledger entry or signed financial approval.
  if(typeof x!=="number" || !Number.isFinite(x) || !Number.isSafeInteger(Math.round(x*100)) ||
     x<=0 || x>1_000_000_000 || !/^\d+(?:\.\d{1,2})?$/.test(x.toString()))
    throw new Error("Provider amount is not a safe positive two-decimal cash candidate.");
  return parseMinor(x.toString(),currency,"Xero candidate amount");
}
function normalizeXero(body:unknown,p:TreasuryApprovedReadPilot,r:TreasuryPilotReadResult):void{
  const raw=body as {BankTransactions?:unknown;pagination?:{pageCount?:unknown}};
  if(!Array.isArray(raw.BankTransactions)||raw.BankTransactions.length>MAX_RECORDS)
    throw new Error("Xero bank transactions page is absent or exceeds pilot row bound.");
  if(!raw.pagination || !Number.isSafeInteger(raw.pagination.pageCount) || Number(raw.pagination.pageCount)<1 ||
     Number(raw.pagination.pageCount)>1){
    r.findings.push({code:"INCOMPLETE_PAGINATION",reference:"xero-page-1"});
    // A single page without attested pagination is not adequate for financial analysis.
    r.recordsObserved=raw.BankTransactions.length;
    r.findings.push({code:"SOURCE_NOT_FULL_CASH_LEDGER",reference:"bank-transactions-only"});
    return;
  }
  r.recordsObserved=raw.BankTransactions.length;
  const seen=new Set<string>();
  for(const rawRecord of raw.BankTransactions){
    const x=rawRecord as Record<string,unknown>;
    const id=checkedText(x?.BankTransactionID);
    if(seen.has(id))throw new Error("Duplicate Xero bank transaction ID.");
    seen.add(id);
    const account=(x?.BankAccount as Record<string,unknown>|null)?.AccountID;
    if(typeof account!=="string" || !p.accountAllowlist.includes(account)){
      r.findings.push({code:"ACCOUNT_NOT_AUTHORISED",reference:"xero-bank-account"});
      continue;
    }
    if(x.Status!=="AUTHORISED" || x.IsReconciled!==true){
      r.findings.push({code:x.Status!=="AUTHORISED"?"NOT_AUTHORISED":"UNRECONCILED",reference:id});
      continue;
    }
    if(x.Type!=="RECEIVE"&&x.Type!=="SPEND"){
      r.findings.push({code:"UNSUPPORTED_TRANSACTION",reference:id});
      continue;
    }
    const date=checkedText(x.DateString,50).slice(0,10);
    isoDate(date,"Xero posting date");
    const currency=checkedText(x.CurrencyCode,3).toUpperCase();
    const amount=xeroAmount(x.Total,currency)*(x.Type==="SPEND"?-1:1);
    const ref=checkedText(x.Reference??id,160);
    r.cashCandidates.push({
      recordId:id,accountId:account,date,currency,
      signedAmountMinor:amount,reference:ref,reconciled:true
    });
  }
  r.recordsAccepted=r.cashCandidates.length;
  if(!r.cashCandidates.length)
    r.findings.push({code:"NO_ELIGIBLE_RECORDS",reference:"xero-bank-transactions"});
  r.findings.push({code:"SOURCE_NOT_FULL_CASH_LEDGER",reference:"bank-transactions-only"});
}
/**
 * Only an approved server worker with a separately verified pilot record,
 * protected credential resolver and fixed egress can call this function.
 * The demo uses an injected fake transport — it performs no external call.
 *
 * IMPORTANT: Do not expose this as createServerFn with arbitrary credential,
 * tenant, connection, provider or URL parameters.
 */
export async function performTreasuryReadOnlyPilot(input:{
  pilot:TreasuryApprovedReadPilot;
  secret:TreasurySecretReference;
  now:string;
  transport:Fetcher;
}):Promise<TreasuryPilotReadResult> {
  validatePilot(input.pilot,input.now);
  const token=validatedToken(input.secret);
  const p=input.pilot;
  const url=p.provider==="truelayer_data_v3"?TRUE_LAYER_URL:XERO_URL;
  const headers:Record<string,string>={
    "accept":"application/json",
    "authorization":"Bearer "+token
  };
  if(p.provider==="truelayer_data_v3")headers["Connection-Id"]=p.externalConnectionId;
  else headers["xero-tenant-id"]=p.externalConnectionId;
  const result=await input.transport(url,{
    method:"GET",redirect:"error",credentials:"omit",cache:"no-store",
    signal:AbortSignal.timeout(8000),headers
  });
  if(result.redirected || (result.url && result.url!==url))
    throw new Error("Provider redirect or changed origin is prohibited.");
  const json=await readBoundedJson(result);
  const response=baseResult(p,input.now);
  if(p.provider==="truelayer_data_v3")normalizeTrueLayer(json,p,response);
  else normalizeXero(json,p,response);
  return response;
}
export const TREASURY_PILOT_PROVIDER_NOTES = Object.freeze([
  {key:"truelayer_data_v3",endpoint:"GET /v3/connected-accounts",scope:"accounts",
    status:"sandbox_candidate_only",fulfils:"bank account discovery only",
    requires:"TrueLayer Data V3 contracted access, bank end-user consent and a vault-held client credential"},
  {key:"xero_accounting",endpoint:"GET /api.xro/2.0/BankTransactions",scope:"accounting.transactions.read",
    status:"test_tenant_candidate_only",fulfils:"partial reconciled cash transaction candidates only",
    requires:"Xero developer app, authorised test organisation and vault-held OAuth access token"}
] as const);
