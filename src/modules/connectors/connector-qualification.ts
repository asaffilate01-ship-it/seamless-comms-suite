/**
 * Connector Intelligence Phase 2A — deterministic, non-executing MCP proposals.
 *
 * An import is UNTRUSTED discovery data; this file never authorises MCP tools,
 * supplier APIs, payments, reads, writes, or any credential. Output is metadata
 * for a separate human review and future server-side verification flow.
 */
import type {ConnectorDiscovery, ProposedOperation, ApiVerb} from "./connector-intelligence";

export type ProposedEffect = "read" | "sensitive_read" | "write" | "regulated_action";
export interface ProposedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {type: "object"; properties: Record<string, Record<string, never>>; additionalProperties: false}>;
    additionalProperties: false;
  };
  annotations: {readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: true};
  qualification: {
    effect: ProposedEffect;
    state: "proposal_only";
    requiresHumanApproval: boolean;
    independentlyVerified: false;
  };
}
export interface QuarantinedOperation {
  method: ApiVerb;
  path: string;
  reason: "non_read_method" | "sensitive_data_or_action" | "unsupported_path";
}
export interface ProposedMcpExport {
  schemaVersion: 1;
  proposalOnly: true;
  providerKey: string;
  sourceFormat: "openapi" | "har";
  runtimeTransport: "none";
  authentication: "not_configured";
  tenantGrant: "not_configured";
  vendorApproval: "not_verified";
  tools: ProposedTool[];
  quarantined: QuarantinedOperation[];
  requiredBeforeSandbox: readonly string[];
}

const SAFE_PROVIDER = /^[a-z][a-z0-9-]{1,47}$/;
const SAFE_NAME = /^call[A-Za-z0-9]{1,90}$/;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,48}$/;
const SAFE_PATH_SEGMENT = /^(?:[A-Za-z][A-Za-z0-9_.-]{0,48}|\{[A-Za-z][A-Za-z0-9_]{0,48}\})$/;
const METHODS = ["GET","HEAD","OPTIONS","POST","PUT","PATCH","DELETE"];
const PRIVATE_PATH = /(?:^|\/)(?:auth|oauth|token|session|me|users?|customers?|people|persons?|patients?|children|students?|staff|employees?|jurors?|identity|kyc|aml|password|secrets?|keys?|cards?|bank(?:ing)?|accounts?|transactions?|transfers?|payments?|payouts?|refunds?|settlements?|tax|payroll|invoices?|orders?|quotes?|deliveries|delivery|bookings?|reservations?|shipments?|drivers?|leads?|contacts?|tickets?|receipts?|legal|cases?|files?|documents?|messages?|conversations?|recipients?|profiles?)(?:\/|$)/i;
const HIGH_RISK_PATH = /(?:^|\/)(?:bank(?:ing)?|accounts?|transactions?|transfers?|payments?|payouts?|refunds?|settlements?|tax|payroll|kyc|aml|cards?|identity|legal|cases?)(?:\/|$)/i;
// Phase 1 may redact an unknown or sensitive resource name to "{id}".
// Never reclassify a root-level ambiguous placeholder as a harmless resource.
const AMBIGUOUS_ROOT = /^\/(?:v\d+\/)?\{[A-Za-z][A-Za-z0-9_]*\}(?:\/|$)/i;
const SAFE_READ = new Set(["GET","HEAD","OPTIONS"]);
const REQUIRED_GATES = Object.freeze([
  "Supplier contract and permitted API usage independently verified",
  "Approved vendor sandbox credentials kept in a server-only vault",
  "Tenant, product, location and provider binding authorised",
  "Endpoint scopes, classifications and redaction reviewed",
  "Origin allowlist, TLS and redirect/SSRF restrictions independently tested",
  "Rate limits, idempotency, webhook signatures and replay protection tested as applicable",
  "Signed sandbox capability and health receipts independently checked",
  "Separate security reviewer approved activation after negative tests",
  "Production activation and funding must be separately approved",
]);

function validPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300 || /[\\?#\u0000-\u001f\u007f]/.test(path)) return false;
  return path === "/" || (path.slice(1).split("/").every(part => SAFE_PATH_SEGMENT.test(part)));
}
function checkedOperation(op: ProposedOperation): boolean {
  return !!op && typeof op.id === "string" && SAFE_NAME.test(op.id) &&
    METHODS.includes(op.method) && validPath(op.path) &&
    [op.queryFields, op.requestFields, op.responseFields].every(fields =>
      Array.isArray(fields) && fields.length <= 24 &&
      fields.every(v=>typeof v==="string" && SAFE_FIELD.test(v)));
}
function classify(op: ProposedOperation): ProposedEffect {
  if (AMBIGUOUS_ROOT.test(op.path)) return "sensitive_read";
  if (HIGH_RISK_PATH.test(op.path)) return "regulated_action";
  if (!SAFE_READ.has(op.method)) return "write";
  if (PRIVATE_PATH.test(op.path)) return "sensitive_read";
  return "read";
}
function fields(names: string[]): {type:"object";properties:Record<string,Record<string,never>>;additionalProperties:false} {
  // {} is an intentionally unconstrained JSON Schema for the observed field.
  // Captured samples cannot prove the real type, format, optionality or limits.
  return {type:"object",properties:Object.fromEntries(names.map(k=>[k,{}])),additionalProperties:false};
}
function inputSchema(op: ProposedOperation): ProposedTool["inputSchema"] {
  const match = [...op.path.matchAll(/\{([A-Za-z][A-Za-z0-9_]{0,48})\}/g)].map(m=>m[1]);
  return {
    type:"object",properties:{
      ...(match.length?{pathParams:fields(match)}:{}),
      ...(op.queryFields.length?{query:fields(op.queryFields)}:{}),
    },
    additionalProperties:false
  };
}
export function proposeMcpManifest(discovery:ConnectorDiscovery, providerKey:string):ProposedMcpExport {
  if (!SAFE_PROVIDER.test(providerKey)) throw new Error("Provider key must use lowercase letters, digits and hyphens (2–48 characters).");
  if (!discovery || discovery.status!=="review_only" || !["har","openapi"].includes(discovery.kind) ||
      !Array.isArray(discovery.operations) || discovery.operations.length<1 || discovery.operations.length>80) {
    throw new Error("A valid review-only discovery is required.");
  }
  if (!discovery.operations.every(checkedOperation)) throw new Error("Discovery includes unsafe operation metadata.");
  const unique=new Set<string>();
  const tools:ProposedTool[]=[];
  const quarantined:QuarantinedOperation[]=[];
  for(const op of discovery.operations){
    const effect=classify(op);
    if(!SAFE_READ.has(op.method)||effect!=="read"){
      quarantined.push({method:op.method,path:op.path,reason:
        AMBIGUOUS_ROOT.test(op.path)?"unsupported_path":effect==="regulated_action"||effect==="sensitive_read"?"sensitive_data_or_action":"non_read_method"});
      continue;
    }
    const name=providerKey.replace(/-/g,"_")+"_"+op.id;
    if(unique.has(name)) throw new Error("Duplicate proposed operation name");
    unique.add(name);
    tools.push({
      name,title:op.method+" "+op.path,
      description:"UNVERIFIED PROPOSAL ONLY: review this read-only operation against the supplier's official API specification.",
      inputSchema:inputSchema(op),
      annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},
      qualification:{effect, state:"proposal_only",requiresHumanApproval:true,independentlyVerified:false},
    });
  }
  // Intentionally omit source host, captured bodies, all credentials and
  // sample values from this export. No execute URL or server transport exists.
  return {
    schemaVersion:1,proposalOnly:true,providerKey,sourceFormat:discovery.kind,
    runtimeTransport:"none",authentication:"not_configured",
    tenantGrant:"not_configured",vendorApproval:"not_verified",
    tools,quarantined,requiredBeforeSandbox:REQUIRED_GATES
  };
}

/**
 * Operator-supplied checklist answers are NOT authenticated provider evidence.
 * A completed checklist grants nothing; only a separately authenticated
 * verification worker plus independent reviewer can activate a binding.
 */
export type SandboxChecklistKey =
  | "supplierPermission" | "documentedScopes" | "sandboxEnvironment"
  | "tenantBoundary" | "vaultPlanned" | "signedProbePlanned" | "independentReview";
export const SANDBOX_CHECKLIST:readonly {key:SandboxChecklistKey;label:string}[]=[
  {key:"supplierPermission",label:"Documented supplier permission and licence"},
  {key:"documentedScopes",label:"Read/write scopes and risk classification reviewed"},
  {key:"sandboxEnvironment",label:"Supplier-approved test environment selected"},
  {key:"tenantBoundary",label:"Tenant/product/location boundary documented"},
  {key:"vaultPlanned",label:"Server-only secret vault and rotation plan"},
  {key:"signedProbePlanned",label:"Independent signed verification and health probes"},
  {key:"independentReview",label:"Separate security reviewer and approval workflow"},
];
export function assessSandboxPreparation(checks: Partial<Record<SandboxChecklistKey,boolean>>):{
  completed:number;
  total:number;
  missing:string[];
  status:"manual_review_required";
  executable:false;
  canActivateProvider:false;
}{
  const missing=SANDBOX_CHECKLIST.filter(item=>checks[item.key]!==true).map(item=>item.label);
  return {completed:SANDBOX_CHECKLIST.length-missing.length,total:SANDBOX_CHECKLIST.length,
    missing,status:"manual_review_required",executable:false,canActivateProvider:false};
}
