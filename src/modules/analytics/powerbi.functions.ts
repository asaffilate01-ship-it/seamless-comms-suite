import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireService} from '@/modules/platform/access';
import type {BiPublicModel} from './powerbi.types';

const scope = z.object({tenantId: z.string().uuid()}).strict();
const request = scope.extend({modelKey: z.string().min(1).max(64), metricKey: z.string().min(1).max(64), dimensionKey: z.string().max(64).nullish(),
  currentStart: z.string().length(10), currentEnd: z.string().length(10), previousStart: z.string().length(10), previousEnd: z.string().length(10),
  maxSegments: z.number().int().min(1).max(200).default(100)}).strict();
const callback = z.object({state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().min(1).max(8192)}).strict();
const safeError = (error: unknown) => error instanceof Error && /^BI_[A-Z_]+$/.test(error.message) ? error.message : 'BI_OPERATION_FAILED';

async function serverDb() {
  const {createClient} = await import('@supabase/supabase-js');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('BI_SERVER_STORAGE_NOT_CONFIGURED');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
}
async function reserve(db: any, tenantId: string, userId: string, action: string, model: string | null = null, hash: string | null = null) {
  const result = await db.rpc('bi_powerbi_reserve_run', {_tenant: tenantId, _user: userId, _action: action, _model: model, _request_hash: hash});
  if (result.error) throw new Error(result.error.message?.includes('BI_RATE_LIMITED') ? 'BI_RATE_LIMITED' : 'BI_AUDIT_UNAVAILABLE');
  return result.data as string;
}
async function finishRun(db: any, tenantId: string, userId: string, runId: string, fields: Record<string, unknown>) {
  const result = await db.from('bi_powerbi_runs').update({...fields, completed_at: new Date().toISOString()})
    .eq('tenant_id', tenantId).eq('user_id', userId).eq('id', runId).select('id').maybeSingle();
  if (result.error || !result.data) throw new Error('BI_AUDIT_UNAVAILABLE');
}
async function connection(db: any, tenantId: string, userId: string, revision: string) {
  const result = await db.from('bi_powerbi_connections').select('generation,token_encrypted,expires_at').eq('tenant_id', tenantId).eq('user_id', userId)
    .eq('config_revision', revision).gt('expires_at', new Date(Date.now() + 30000).toISOString()).maybeSingle();
  if (result.error) throw new Error('BI_STORAGE_UNAVAILABLE');
  if (!result.data?.token_encrypted) throw new Error('BI_RECONNECT_REQUIRED');
  return result.data;
}

export const getPowerBiWorkspace = createServerFn({method: 'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof scope>) => scope.parse(input)).handler(async ({context, data}) => {
    await requireService(context, data.tenantId, 'omniqora.bi');
    const runtime = await import('./powerbi.server.mjs');
    let models: BiPublicModel[] = [];
    try {
      const config = runtime.getConfig(process.env, data.tenantId); models = runtime.publicModels(config);
      const db = await serverDb();
      try {
        const row = await connection(db, data.tenantId, context.userId, config.revision);
        return {ready: true, connected: true, expiresAt: row.expires_at as string | null, problem: null as string | null, models, principal: context.userId};
      } catch (error) {
        if (safeError(error) !== 'BI_RECONNECT_REQUIRED') throw error;
        return {ready: true, connected: false, expiresAt: null, problem: null as string | null, models, principal: context.userId};
      }
    } catch (error) {
      return {ready: false, connected: false, expiresAt: null, problem: safeError(error), models, principal: context.userId};
    }
  });

export const beginPowerBiConnection = createServerFn({method: 'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof scope>) => scope.parse(input)).handler(async ({context, data}) => {
    await requireService(context, data.tenantId, 'omniqora.bi');
    const runtime = await import('./powerbi.server.mjs'), config = runtime.getConfig(process.env, data.tenantId), db = await serverDb();
    const runId = await reserve(db, data.tenantId, context.userId, 'connect');
    try {
      const oauth = runtime.startOAuth(config), generation = crypto.randomUUID();
      const binding = runtime.secretBinding(data.tenantId, context.userId, oauth.stateHash);
      const old = await db.from('bi_powerbi_oauth_states').delete().eq('tenant_id', data.tenantId).eq('user_id', context.userId);
      if (old.error) throw new Error('BI_STORAGE_UNAVAILABLE');
      const pending = await db.from('bi_powerbi_connections').upsert({tenant_id: data.tenantId, user_id: context.userId, generation,
        config_revision: config.revision, token_encrypted: null, expires_at: null, updated_at: new Date().toISOString()}, {onConflict: 'tenant_id,user_id'});
      if (pending.error) throw new Error('BI_STORAGE_UNAVAILABLE');
      const state = await db.from('bi_powerbi_oauth_states').insert({state_hash: oauth.stateHash, tenant_id: data.tenantId, user_id: context.userId,
        generation, run_id: runId, config_revision: config.revision, verifier_encrypted: runtime.seal(oauth.verifier, runtime.encryptionKey(process.env), binding),
        expires_at: new Date(Date.now() + 5 * 60000).toISOString()});
      if (state.error) throw new Error('BI_STORAGE_UNAVAILABLE');
      // The run remains pending until a successful, authenticated callback.
      return {authorizationUrl: oauth.url};
    } catch (error) {
      await finishRun(db, data.tenantId, context.userId, runId, {status: 'failed', error_code: safeError(error)});
      throw new Error(safeError(error));
    }
  });

export const completePowerBiConnection = createServerFn({method: 'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof callback>) => callback.parse(input)).handler(async ({context, data}) => {
    const runtime = await import('./powerbi.server.mjs'), db = await serverDb(), stateHash = runtime.digest(data.state);
    // DELETE ... RETURNING atomically consumes the state; another user cannot consume it.
    const state = await db.from('bi_powerbi_oauth_states').delete().eq('state_hash', stateHash).eq('user_id', context.userId)
      .gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
    if (state.error || !state.data) throw new Error('BI_OAUTH_STATE_INVALID');
    const tenantId = state.data.tenant_id as string;
    try {
    await requireService(context, tenantId, 'omniqora.bi');
    const config = runtime.getConfig(process.env, tenantId);
    if (state.data.config_revision !== config.revision) throw new Error('BI_CONFIGURATION_CHANGED');
    const verifier = runtime.unseal(state.data.verifier_encrypted, runtime.encryptionKey(process.env), runtime.secretBinding(tenantId, context.userId, stateHash));
    const token = await runtime.exchangeCode(config, process.env, data.code, verifier);
    await requireService(context, tenantId, 'omniqora.bi');
    // Generation fence prevents late OAuth callbacks resurrecting a disconnected account.
    const saved = await db.from('bi_powerbi_connections').update({token_encrypted: runtime.seal(token.accessToken, runtime.encryptionKey(process.env),
      runtime.secretBinding(tenantId, context.userId, `${config.revision}:${state.data.generation}`)), expires_at: token.expiresAt, updated_at: new Date().toISOString()})
      .eq('tenant_id', tenantId).eq('user_id', context.userId).eq('generation', state.data.generation).eq('config_revision', config.revision).select('generation').maybeSingle();
    if (saved.error || !saved.data) throw new Error('BI_CONNECTION_CHANGED');
    await finishRun(db, tenantId, context.userId, state.data.run_id, {status: 'completed'});
    return {tenantId, connected: true, expiresAt: token.expiresAt};
    } catch (error) {
      await finishRun(db, tenantId, context.userId, state.data.run_id, {status: 'failed', error_code: safeError(error)});
      throw new Error(safeError(error));
    }
  });

export const disconnectPowerBi = createServerFn({method: 'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof scope>) => scope.parse(input)).handler(async ({context, data}) => {
    // Membership is still required. Removing a connection never calls a provider write API.
    const {requireTenantMembership} = await import('@/modules/platform/access');
    await requireTenantMembership(context, data.tenantId);
    const db = await serverDb();
    const deleted = await db.from('bi_powerbi_connections').delete().eq('tenant_id', data.tenantId).eq('user_id', context.userId);
    const states = await db.from('bi_powerbi_oauth_states').delete().eq('tenant_id', data.tenantId).eq('user_id', context.userId);
    if (deleted.error || states.error) throw new Error('BI_STORAGE_UNAVAILABLE');
    return {disconnected: true};
  });

async function runRead(context: any, data: z.infer<typeof scope> & {modelKey?: string}, action: 'discover' | 'investigate') {
  await requireService(context, data.tenantId, 'omniqora.bi');
  const runtime = await import('./powerbi.server.mjs'), config = runtime.getConfig(process.env, data.tenantId), db = await serverDb();
  const row = await connection(db, data.tenantId, context.userId, config.revision);
  const token = runtime.unseal(row.token_encrypted, runtime.encryptionKey(process.env), runtime.secretBinding(data.tenantId, context.userId, `${config.revision}:${row.generation}`));
  const runId = await reserve(db, data.tenantId, context.userId, action, data.modelKey ?? null, runtime.digest(JSON.stringify(data)));
  try {
    const result = action === 'discover' ? await runtime.discoverModels(config, token) : await runtime.executeInvestigation(config, token, request.parse(data));
    await requireService(context, data.tenantId, 'omniqora.bi');
    const current = await connection(db, data.tenantId, context.userId, config.revision);
    if (current.generation !== row.generation) throw new Error('BI_CONNECTION_CHANGED');
    if (runtime.getConfig(process.env, data.tenantId).revision !== config.revision) throw new Error('BI_CONFIGURATION_CHANGED');
    const evidence = Array.isArray(result) ? null : result.evidence;
    await finishRun(db, data.tenantId, context.userId, runId, {status: 'completed', query_hash: evidence?.queryHash ?? null, provider_request_id: evidence?.providerRequestId ?? null});
    return {result, runId};
  } catch (error) {
    await finishRun(db, data.tenantId, context.userId, runId, {status: 'failed', error_code: safeError(error)});
    throw new Error(safeError(error));
  }
}
export const discoverPowerBi = createServerFn({method: 'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof scope>) => scope.parse(input)).handler(async ({context, data}) => {
    const value = await runRead(context, data, 'discover');
    if (!Array.isArray(value.result)) throw new Error('BI_INVALID_RESULT_SHAPE');
    return {models: value.result, runId: value.runId};
  });
export const investigatePowerBi = createServerFn({method: 'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof request>) => request.parse(input)).handler(async ({context, data}) => {
    const value = await runRead(context, data, 'investigate');
    if (Array.isArray(value.result)) throw new Error('BI_INVALID_RESULT_SHAPE');
    return {...value.result, runId: value.runId};
  });
