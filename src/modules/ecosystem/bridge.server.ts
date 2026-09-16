import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callTransformation, TransformationError } from '../transformation/transformation.server';
import { BridgeError, type Binding, type BridgeInput, available, bearerBinding, readBindings, readBody, gatewayInput, eventInput, haccoraInput, requestId, freshness, lawScope, checkScope } from './bridge-core';

type Receipt = {runId:string;status:string;reviewRequired:boolean;scope:Record<string,unknown>;result:Record<string,unknown>|null;error?:string};
async function access(b: Binding) {
  const current = readBindings().find(x=>x.id===b.id);
  if (!current || JSON.stringify(current)!==JSON.stringify(b) || !available(current)) throw new BridgeError(403,'Connection access changed');
  if (!(process.env.BUSINESS360_ENABLED_TENANTS ?? '').split(',').map(x=>x.trim()).includes(b.tenant)) throw new BridgeError(403,'Workspace entitlement is inactive');
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new BridgeError(503,'Bridge identity verification is not configured');
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.from('tenant_members').select('role').eq('tenant_id',b.tenant).eq('user_id',b.serviceUser).maybeSingle();
  if (error || !data || !['owner','admin','manager','member','agent'].includes(data.role)) throw new BridgeError(403,'Source principal is no longer an active workspace member');
  return {tenant:b.tenant,user:b.serviceUser,tenant_role:data.role};
}
async function command(b: Binding, name: string, data: Record<string,unknown>) {
  const credentialDigest = createHash('sha256').update(process.env[b.secretEnv] ?? '').digest('hex');
  const identity=await access(b);
  const result=await callTransformation(identity,{command:name,project_id:b.project,data:{...data,connection:b.id}}) as Receipt;
  const current=await access(b);
  if(createHash('sha256').update(process.env[b.secretEnv] ?? '').digest('hex')!==credentialDigest)throw new BridgeError(403,'Connection credential changed');
  if(current.tenant_role!==identity.tenant_role)throw new BridgeError(403,'Workspace access changed');
  return result;
}
async function submit(b:Binding,input:BridgeInput,id:string) {
  return command(b,'bridges.submit',{id,product:b.product,contract:input.contract,profile:b.profile,scope:input.scope,payload:input.payload,daily_limit:b.dailyLimit});
}
function response(body: unknown,status=200) {return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function serveBridge(request:Request, operation:'gateway'|'events'|'result'|'context'|'haccora', id?:string) {
  try {
    if (operation==='haccora') {
      const b=readBindings().find(x=>x.id===id); if(!b)throw new BridgeError(401,'Unknown webhook');
      const raw=await readBody(request); const input=haccoraInput(b,request,raw);
      const receipt=await submit(b,input,requestId(request,true)!);
      return response({runId:receipt.runId,status:receipt.status},202);
    }
    const b=bearerBinding(request);
    if(operation==='result') return response(await command(b,'bridges.get',{id:z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/).parse(id)}));
    const raw=await readBody(request); let body:unknown;
    try{body=JSON.parse(raw);}catch{throw new BridgeError(400,'Invalid JSON');}
    if(operation==='context') {
      if(b.product!=='lawquo'||!b.contracts.includes('lawquo_assessment'))throw new BridgeError(403,'Context delivery is not enabled');
      freshness(request);
      const payload=z.object({scope:lawScope,context:z.record(z.unknown()),sources:z.array(z.record(z.unknown())).max(100)}).strict().parse(body);
      checkScope(b,payload.scope.firm_id,payload.scope.case_id);
      const prior=await command(b,'bridges.get',{id});
      if(JSON.stringify(prior.scope)!==JSON.stringify(payload.scope)) {
        for(const key of Object.keys(payload.scope))if(prior.scope[key]!==payload.scope[key as keyof typeof payload.scope])throw new BridgeError(409,'Case scope or revision does not match');
      }
      return response(await command(b,'bridges.process',{id,context:payload}));
    }
    if(operation==='events')freshness(request);
    const input=operation==='events'?eventInput(b,body):gatewayInput(b,body);
    const key=requestId(request,operation==='events')??randomUUID();
    const receipt=await submit(b,input,key);
    if(operation==='events')return response({runId:receipt.runId,status:receipt.status},202);
    const draft=receipt.status==='draft'?receipt:await command(b,'bridges.process',{id:key});
    if(draft.status!=='draft'||!draft.result)throw new BridgeError(503,'No completed draft is available');
    return response({...draft.result,runId:draft.runId,reviewRequired:true});
  } catch(error) {
    if(error instanceof BridgeError)return response({error:error.message},error.status);
    if(error instanceof TransformationError)return response({error:'Request refused by the project access, evidence or AI policy',status:error.status},[403,404,409,413,422,429].includes(error.status)?error.status:503);
    if(error instanceof z.ZodError)return response({error:'Invalid source contract'},422);
    // Never expose provider responses, record content, key references or private scope values.
    return response({error:'Bridge service unavailable or request refused. Check connection configuration and project AI policy.'},503);
  }
}
