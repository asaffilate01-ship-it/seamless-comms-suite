import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import catalogue from './catalogue.json';

export class BridgeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const contract = z.enum(['sparesgrid_question','sparesgrid_enquiry','lawquo_assessment','taxnuvia_matching','epos_report','business360_brief','generic_draft','event']);
export const bindingSchema = z.object({
  id, product: id, tenant: z.string().uuid(), project: z.string().uuid(), serviceUser: z.string().uuid(),
  externalTenant: id, allowedScopes: z.array(id).min(1).max(500),
  secretEnv: z.string().regex(/^OQ_BRIDGE_[A-Z0-9_]+$/),
  protocol: z.enum(['bearer','haccora']), enabled: z.boolean(), expiresAt: z.string().datetime(),
  contracts: z.array(contract).min(1), profile: z.enum(['discovery','finance','technical','compliance','product','transaction']),
  dailyLimit: z.number().int().min(1).max(1000),
}).strict();
export type Binding = z.infer<typeof bindingSchema>;
export type BridgeInput = { contract: z.infer<typeof contract>; scope: Record<string, unknown>; payload: Record<string, unknown> };

export function readBindings(env: NodeJS.ProcessEnv = process.env): Binding[] {
  try {
    const values = z.array(bindingSchema).max(500).parse(JSON.parse(env.OMNIQORA_BRIDGES_JSON ?? '[]'));
    const ids = new Set(), secrets = new Set();
    for (const b of values) {
      const secret = env[b.secretEnv];
      if (ids.has(b.id) || (secret && secrets.has(secret))) throw new Error('Duplicate connection');
      if (!catalogue.some(p => p.product === b.product)) throw new Error('Unknown product');
      if (b.protocol === 'haccora' && b.product !== 'haccora') throw new Error('Invalid protocol');
      ids.add(b.id); if (secret) secrets.add(secret);
    }
    return values;
  } catch { throw new BridgeError(503, 'Bridge configuration is invalid; contact the operator'); }
}
export function available(b: Binding, env: NodeJS.ProcessEnv = process.env, clock = Date.now()) {
  const key = env[b.secretEnv];
  return b.enabled && Date.parse(b.expiresAt) > clock && !!key && key.length >= 32 && !/[\r\n]/.test(key);
}
const equalSecret = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export function bearerBinding(request: Request, env: NodeJS.ProcessEnv = process.env): Binding {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ') || header.length > 512) throw new BridgeError(401, 'Invalid bridge credential');
  const token = header.slice(7);
  const found = readBindings(env).find(b => b.protocol === 'bearer' && available(b, env) && equalSecret(token, env[b.secretEnv]!));
  if (!found) throw new BridgeError(401, 'Invalid or inactive bridge credential');
  return found;
}
export function checkScope(b: Binding, tenant: unknown, scope: unknown) {
  if (tenant !== b.externalTenant || typeof scope !== 'string' || !b.allowedScopes.includes(scope)) throw new BridgeError(403, 'Source tenant or collection is not authorised');
}
export function permit(b: Binding, name: BridgeInput['contract']) {
  if (!b.contracts.includes(name)) throw new BridgeError(403, 'Contract is not enabled for this connection');
  const product: Record<string,string> = {sparesgrid_question:'sparesgrid',sparesgrid_enquiry:'sparesgrid',lawquo_assessment:'lawquo',taxnuvia_matching:'taxnuvia',business360_brief:'business360'};
  if (product[name] && product[name] !== b.product) throw new BridgeError(403, 'Contract does not belong to this product');
  if (name === 'epos_report' && !['epos','dishbee','commerceops'].includes(b.product)) throw new BridgeError(403, 'EPOS contract not available for this product');
}
export const lawScope = z.object({schema_version:z.literal(1),operation:z.literal('prepare_assessment'),firm_id:id,case_id:id,request_id:id,context_revision:z.number().int().nonnegative(),kind:z.enum(['legal','correspondence'])}).strict();
export function gatewayInput(b: Binding, raw: unknown): BridgeInput {
  if (raw && typeof raw === 'object' && 'mode' in raw && raw.mode === 'part_photo') throw new BridgeError(503, 'Photo recognition requires a separately configured vision adapter; retain manual review');
  const body = z.object({tenantId:id,scopeId:id.optional(),contract:contract.optional(),question:z.string().min(1).max(2000).optional(),context:z.unknown(),policy:z.record(z.unknown()).optional(),mode:z.string().optional()}).strict().parse(raw);
  checkScope(b,body.tenantId,body.scopeId ?? body.tenantId);
  if (body.mode) throw new BridgeError(503, 'Image recognition is not enabled on this gateway; use the source manual review workflow');
  let name = body.contract;
  if (b.product === 'sparesgrid') {
    const context = body.context as Record<string,unknown>;
    name = Array.isArray(body.context) ? 'sparesgrid_question' : context && 'enquiry' in context ? 'sparesgrid_enquiry' : undefined;
  }
  if (!name || ['event','lawquo_assessment'].includes(name)) throw new BridgeError(422, 'Select a supported draft contract');
  permit(b,name);
  if (body.policy?.noExternalActions === false || body.policy?.readOnly === false) throw new BridgeError(422, 'Only read-only drafts are supported');
  const payload = name === 'taxnuvia_matching'
    ? z.object({brief:z.record(z.unknown()),candidates:z.array(z.record(z.unknown())).min(1).max(20)}).strict().parse(body.context)
    : { question: z.string().min(1).max(2000).parse(body.question), context: body.context };
  return {contract:name, scope:{tenantId:body.tenantId,scopeId:body.scopeId ?? body.tenantId},payload};
}
export function eventInput(b: Binding, raw: unknown): BridgeInput {
  const event = z.object({title:z.string().min(1).max(160),input:z.string().min(1).max(20000)}).strict().parse(raw);
  let metadata: unknown;
  try { metadata = JSON.parse(event.input); } catch { throw new BridgeError(422,'Event input must be structured metadata'); }
  if (b.product === 'lawquo') {
    const scope = lawScope.parse(metadata); checkScope(b,scope.firm_id,scope.case_id); permit(b,'lawquo_assessment');
    return {contract:'lawquo_assessment',scope,payload:{}};
  }
  const scope = z.object({tenantId:id,scopeId:id,eventType:id,recordId:id.optional(),revision:z.number().int().nonnegative().optional()}).strict().parse(metadata);
  checkScope(b,scope.tenantId,scope.scopeId); permit(b,'event');
  return {contract:'event',scope,payload:{title:event.title}};
}
export function haccoraInput(b: Binding, request: Request, raw: string, env: NodeJS.ProcessEnv = process.env): BridgeInput {
  if (b.protocol !== 'haccora' || !available(b,env)) throw new BridgeError(401,'Inactive webhook');
  const signature = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(request.headers.get('x-haccora-signature') ?? '');
  if (!signature || Math.abs(Date.now()/1000-Number(signature[1])) > 300) throw new BridgeError(401,'Invalid webhook signature');
  const expected = createHmac('sha256',env[b.secretEnv]!).update(`${signature[1]}.${raw}`).digest('hex');
  if (!equalSecret(expected,signature[2])) throw new BridgeError(401,'Invalid webhook signature');
  const body = z.object({id, type:z.string().min(1).max(100), occurred_at:z.string().datetime().optional(),organization_id:id.optional()}).passthrough().parse(JSON.parse(raw));
  if (body.id !== request.headers.get('idempotency-key') || body.type !== request.headers.get('x-haccora-event')) throw new BridgeError(422,'Webhook event headers do not match');
  if (body.organization_id && body.organization_id !== b.externalTenant) throw new BridgeError(403,'Wrong source organisation');
  permit(b,'event'); checkScope(b,b.externalTenant,b.externalTenant);
  // Store the notification envelope only. Domain records need a separate authorised context export.
  return {contract:'event',scope:{tenantId:b.externalTenant,scopeId:b.externalTenant,eventType:body.type,recordId:body.id},payload:{occurred_at:body.occurred_at ?? null}};
}
export async function readBody(request: Request, max=262144): Promise<string> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new BridgeError(415,'JSON content type required');
  const reader = request.body?.getReader(); if (!reader) throw new BridgeError(400,'Missing body');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const r=await reader.read(); if(r.done)break; size+=r.value.length; if(size>max)throw new BridgeError(413,'Source request exceeds 256 KiB'); chunks.push(r.value); } }
  finally { await reader.cancel(); reader.releaseLock(); }
  try { return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)); } catch { throw new BridgeError(400,'Invalid UTF-8'); }
}
export function requestId(request: Request, required: boolean) {
  const value = request.headers.get('idempotency-key');
  if (required && !value) throw new BridgeError(422,'Idempotency key required');
  return value ? id.parse(value) : undefined;
}
export function freshness(request: Request) {
  const stamp = request.headers.get('x-event-timestamp') ?? '';
  if (!/^\d{13}$/.test(stamp) || Math.abs(Date.now()-Number(stamp))>300000) throw new BridgeError(401,'Event timestamp is missing or expired');
}
