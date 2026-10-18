/**
 * TreasuryOS Phase 6 — cryptographically checked managed-source intake.
 *
 * This is a pure sandbox-compatible verification layer. It does NOT fetch
 * banking data, hold production credentials, run a scheduler or persist a CSV.
 * Signatures here authenticate a pre-agreed managed-file source only. Real
 * bank authenticity also needs contractual/provider-specific validation.
 */
import {
  evaluateTreasurySourceReadiness, runTreasuryShadowAnalysis,
  REQUIRED_TREASURY_SOURCES,
  type TreasurySourceKind, type TreasurySourceBinding,
  type TreasuryShadowResult, type TreasuryTrustedEnvelope
} from "./trusted-sources";

export type TreasurySnapshotVersion = 1;
export interface SignedTreasurySnapshot {
  version: TreasurySnapshotVersion;
  tenantId: string;
  sourceKind: TreasurySourceKind;
  providerKey: string;
  keyId: string;
  eventId: string;
  receivedAt: string;
  digestSha256: string;
  canonicalCsv: string;
  signatureHex: string;
}
export interface TreasuryPinnedKey {
  tenantId: string;
  sourceKind: TreasurySourceKind;
  providerKey: string;
  keyId: string;
  /** Resolved by an approved key manager, never sent to a browser or stored in the review DB. */
  cryptoKey: CryptoKey;
  status: "sandbox_verified" | "production_verified" | "revoked";
  validUntil: string;
}
export interface TreasuryVerifiedReceipt {
  sourceKind: TreasurySourceKind;
  providerKey: string;
  keyId: string;
  eventId: string;
  receivedAt: string;
  digestSha256: string;
  signatureValid: true;
  bytes: number;
}
export interface SignedTreasurySandboxResult {
  mode: "signed_synthetic_sandbox";
  executionEnabled: false;
  connectionsUsed: 0;
  run: TreasuryShadowResult;
  receipts: TreasuryVerifiedReceipt[];
}
const REQUIRED = new Set<string>(REQUIRED_TREASURY_SOURCES);
const hex64 = /^[a-f0-9]{64}$/;
const sourceKey = /^[a-z][a-z0-9.-]{1,79}$/;
const opaqueId = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,119}$/;
const MAX_CONTENT_BYTES = 2_000_000;
const MAX_BUNDLE_BYTES = 10_000_000;
const encoder = new TextEncoder();

function timestamp(iso: string): number {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(iso))
    throw new Error("Full UTC source timestamp is required.");
  const v = Date.parse(iso);
  if (!Number.isFinite(v)) throw new Error("Invalid source timestamp.");
  return v;
}
function toHex(bytes: Uint8Array): string {
  return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function fromHex(value: string): ArrayBuffer {
  if (!hex64.test(value)) throw new Error("Malformed 256-bit signature or digest.");
  const buffer = new ArrayBuffer(32);
  const bytes = new Uint8Array(buffer);
  for (let i=0;i<32;i++) bytes[i] = parseInt(value.slice(i*2,i*2+2),16);
  return buffer;
}
function subtleEngine(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("Secure WebCrypto engine required.");
  return globalThis.crypto.subtle;
}
export async function digestTreasuryPayload(csv: string): Promise<string> {
  if (typeof csv !== "string" || !csv.length) throw new Error("Empty financial source is not admissible.");
  const data=encoder.encode(csv);
  if (data.byteLength > MAX_CONTENT_BYTES) throw new Error("Financial source exceeds the approved 2 MB bound.");
  return toHex(new Uint8Array(await subtleEngine().digest("SHA-256",data)));
}
/** Domain-separated, versioned canonical source assertion, signed using HMAC-SHA256. */
export function snapshotSignatureMessage(s: Omit<SignedTreasurySnapshot,"canonicalCsv"|"signatureHex">): string {
  return [
    "finvessa-treasury-source-v1",String(s.version),s.tenantId,s.sourceKind,
    s.providerKey,s.keyId,s.eventId,s.receivedAt,s.digestSha256
  ].join("\n");
}
function assertSnapshotMetadata(s: SignedTreasurySnapshot,tenantId: string,now: number):void {
  if (!s || s.version !== 1 || s.tenantId!==tenantId || !REQUIRED.has(s.sourceKind))
    throw new Error("Foreign tenant, unknown source type or unsupported snapshot version.");
  if (!sourceKey.test(s.providerKey) || !opaqueId.test(s.keyId) || !opaqueId.test(s.eventId))
    throw new Error("Invalid source provider or opaque event/key reference.");
  if (!hex64.test(s.digestSha256) || !hex64.test(s.signatureHex))
    throw new Error("Source digest/signature is malformed.");
  const received=timestamp(s.receivedAt);
  if (received>now || now-received>24*3600_000)
    throw new Error("Financial source is stale or future-dated.");
}
/**
 * Signs a SYNTHETIC fixture with an ephemeral local sandbox key. It must not be
 * called by an API accepting live bank data; actual provider signing happens
 * under the provider's own identity and separate onboarding contract.
 */
export async function signSyntheticTreasurySnapshot(
  source: Omit<SignedTreasurySnapshot,"digestSha256"|"signatureHex">,
  key: CryptoKey
): Promise<SignedTreasurySnapshot> {
  const digestSha256=await digestTreasuryPayload(source.canonicalCsv);
  const message=snapshotSignatureMessage({...source,digestSha256});
  const signature=await subtleEngine().sign("HMAC",key,encoder.encode(message));
  return {...source,digestSha256,signatureHex:toHex(new Uint8Array(signature))};
}
/** Verify every provider hash and HMAC BEFORE passing bytes to financial maths. */
export async function verifyTreasurySignedBundle(input:{
  tenantId:string;
  now:string;
  envelopes:readonly SignedTreasurySnapshot[];
  keys:readonly TreasuryPinnedKey[];
}):Promise<{verified:TreasuryTrustedEnvelope[];receipts:TreasuryVerifiedReceipt[]}> {
  const now=timestamp(input.now);
  if (input.envelopes.length !== REQUIRED_TREASURY_SOURCES.length)
    throw new Error("All five treasury source snapshots are required.");
  const verified:TreasuryTrustedEnvelope[]=[];
  const receipts:TreasuryVerifiedReceipt[]=[];
  const kinds=new Set<string>(),events=new Set<string>(),keyRefs=new Set<string>();
  let total=0;
  for (const key of input.keys) {
    const identity=[key.tenantId,key.providerKey,key.sourceKind,key.keyId].join("|");
    if (keyRefs.has(identity)) throw new Error("Duplicate trusted signing key identity.");
    keyRefs.add(identity);
  }
  for (const s of input.envelopes) {
    assertSnapshotMetadata(s,input.tenantId,now);
    if (kinds.has(s.sourceKind)) throw new Error("Duplicate financial source kind.");
    kinds.add(s.sourceKind);
    const eventIdentity=s.providerKey+"|"+s.eventId;
    if (events.has(eventIdentity)) throw new Error("Duplicate provider source event. Reject replay.");
    events.add(eventIdentity);
    const bytes=encoder.encode(s.canonicalCsv).byteLength;
    total+=bytes;
    if (total>MAX_BUNDLE_BYTES) throw new Error("Financial source bundle exceeds verified size bound.");
    const computed=await digestTreasuryPayload(s.canonicalCsv);
    if (computed!==s.digestSha256) throw new Error("Financial source digest mismatch; processing refused.");
    const matching=input.keys.filter(k=>k.tenantId===input.tenantId &&
      k.providerKey===s.providerKey && k.sourceKind===s.sourceKind && k.keyId===s.keyId);
    if (matching.length!==1) throw new Error("No unique tenant-scoped signing key for this source.");
    const key=matching[0];
    if (key.status==="revoked" || timestamp(key.validUntil)<=now)
      throw new Error("Signing key has expired or been revoked.");
    if (key.cryptoKey.algorithm.name!=="HMAC" ||
        !key.cryptoKey.usages.includes("verify"))
      throw new Error("Expected an approved HMAC verification-only capability.");
    const message=snapshotSignatureMessage(s);
    const valid=await subtleEngine().verify(
      "HMAC",key.cryptoKey,fromHex(s.signatureHex),encoder.encode(message)
    );
    if (!valid) throw new Error("Financial source signature verification failed.");
    verified.push({
      tenantId:s.tenantId,sourceKind:s.sourceKind,providerKey:s.providerKey,
      receivedAt:s.receivedAt,sourceDigest:computed,canonicalCsv:s.canonicalCsv
    });
    receipts.push({
      sourceKind:s.sourceKind,providerKey:s.providerKey,keyId:s.keyId,
      eventId:s.eventId,receivedAt:s.receivedAt,
      digestSha256:computed,signatureValid:true,bytes
    });
  }
  return {verified,receipts};
}
/**
 * A protected SERVER-only future worker can call this with independently
 * verified binding records and vault-resolved pinned signing keys. This module
 * never treats a caller-supplied "verified" flag as sufficient production access.
 */
export async function runSignedTreasurySandbox(input:{
  tenantId:string;
  reportDate:string;
  now:string;
  bindings:readonly TreasurySourceBinding[];
  keys:readonly TreasuryPinnedKey[];
  envelopes:readonly SignedTreasurySnapshot[];
}):Promise<SignedTreasurySandboxResult> {
  const readiness=evaluateTreasurySourceReadiness({
    tenantId:input.tenantId,bindings:input.bindings,at:input.now
  });
  if (readiness.status!=="sandbox_shadow_only")
    throw new Error("Read-only connector capability admission failed.");
  const {verified,receipts}=await verifyTreasurySignedBundle({
    tenantId:input.tenantId,now:input.now,envelopes:input.envelopes,keys:input.keys
  });
  const run=runTreasuryShadowAnalysis({
    tenantId:input.tenantId,bindings:input.bindings,envelopes:verified,
    reportDate:input.reportDate,now:input.now
  });
  return {mode:"signed_synthetic_sandbox",executionEnabled:false,connectionsUsed:0,run,receipts};
}
