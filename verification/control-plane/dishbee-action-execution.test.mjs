import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE PUBLICATION supabase_realtime;`);
const migrations=new URL('../../supabase/migrations/',import.meta.url);
for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,migrations),'utf8'));
const t='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002';
await db.exec(`INSERT INTO public.organisations(id,name,slug) VALUES('${t}','Action test A','action-a'),('${foreign}','Action test B','action-b');
 INSERT INTO public.tenants(id,name,slug,organisation_id) VALUES('${t}','A','action-a','${t}'),('${foreign}','B','action-b','${foreign}');
 INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES('${t}','dishbee','active'),('${foreign}','dishbee','active');
 INSERT INTO public.tenant_services(tenant_id,service_key,status) VALUES('${t}','omniqora.intelligence-runtime','active'),('${foreign}','omniqora.intelligence-runtime','active');`);
async function service(fn){await db.exec("BEGIN;SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',true)");try{let result=await fn();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
const run=(sql,args=[])=>service(()=>db.query(sql,args));
let assertions=0;
const check=(value,label)=>{assert(value,label);assertions++;};
const reject=async(sql,args,label)=>{await assert.rejects(()=>run(sql,args),undefined,label);assertions++;};
const proposal=async(tenant=t)=> (await db.query("INSERT INTO public.ai_action_proposals(tenant_id,product_key,action_key,target_type,target_id,payload,rationale) VALUES($1,'dishbee','dishbee.menu.availability','menu_item','item','{}','test proposal') RETURNING id",[tenant])).rows[0].id;
const id=await proposal();
const review="SELECT public.review_product_action_proposal($1,'dishbee',$2,$3,'dishbee-user:reviewer') AS r";
await reject(review,[t,id,'approved'],'execution defaults off');
await db.query("UPDATE public.tenant_products SET config='{\"actionExecutionEnabled\":true}' WHERE product_key='dishbee'");
const unsupported=(await run(review,[t,id,'approved'])).rows[0].r;
check(unsupported.execution.queued===false,'approval cannot create an execution binding');
for(const tenant of [t,foreign])await db.query("INSERT INTO public.ai_tool_bindings(tenant_id,product_key,tool_key,name,action_kind,destination_ref,approval_mode,active) VALUES($1,'dishbee','dishbee.menu.availability','Test','provider_action','dishbee.runtime','always',true)",[tenant]);
const queued=(await run(review,[t,id,'approved'])).rows[0].r.execution;
check(queued.queued,'explicit binding permits queue');
check((await run(review,[t,id,'approved'])).rows[0].r.execution.actionRequestId===queued.actionRequestId,'repeated review is idempotent');
check((await db.query('SELECT count(*)::int AS n FROM public.ai_action_requests WHERE source_proposal_id=$1',[id])).rows[0].n===1,'one request per proposal');
await reject(review,[foreign,id,'approved'],'foreign proposal review denied');
const claim="SELECT * FROM public.claim_product_action_requests($1,'dishbee','dishbee.runtime',$2,20)";
const worker='connector:verified-id:worker-a';
const action=(await run(claim,[t,worker])).rows[0];
check(action?.claim_token,'claim returns unpredictable lease token');
check((await run(claim,[t,'worker-b'])).rows.length===0,'live claim cannot be stolen');
const finish="SELECT public.finish_product_action_request($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) AS ok";
const args=[t,'dishbee','dishbee.runtime',worker,action.claim_token,action.id,true,'external-id','{"ok":true}',null];
for(const [index,value] of [[0,foreign],[1,'haccora'],[2,'foreign.runtime'],[3,'worker-b'],[4,'20000000-0000-4000-8000-000000000001']]){
 const bad=[...args];bad[index]=value;await reject(finish,bad,'scope/claim mismatch denied');
}
check((await db.query('SELECT status FROM public.ai_action_requests WHERE id=$1',[action.id])).rows[0].status==='executing','denied completions do not mutate target');
for(const [field,value,original] of [['target_id','other-target','item'],['target_type','other-type','menu_item'],['status','rejected','approved']]) {
 await db.query(`UPDATE public.ai_action_proposals SET ${field}=$2 WHERE id=$1`,[id,value]);
 await reject(finish,args,'changed target or revoked approval refused');
 await db.query(`UPDATE public.ai_action_proposals SET ${field}=$2 WHERE id=$1`,[id,original]);
}
for(const value of ["now()+interval '1 day'", "now()-interval '1 day'"]) {
 const field=value.includes('+')?'valid_from':'valid_until';
 await db.query(`UPDATE public.tenant_services SET ${field}=${value} WHERE tenant_id=$1 AND service_key='omniqora.intelligence-runtime'`,[t]);
 await reject(finish,args,'future or expired runtime entitlement refused');
 await db.query("UPDATE public.tenant_services SET valid_from=now()-interval '1 day',valid_until=NULL WHERE tenant_id=$1 AND service_key='omniqora.intelligence-runtime'",[t]);
}

check((await run(finish,args)).rows[0].ok,'matching worker completes');
check((await run(finish,args)).rows[0].ok,'exact repeated acknowledgement succeeds without another write');
await reject(finish,[...args.slice(0,8),'{"different":true}',null],'conflicting replay refused');
check((await db.query('SELECT status FROM public.ai_action_proposals WHERE id=$1',[id])).rows[0].status==='executed','proposal and completion update atomically');
check((await db.query("SELECT to_regprocedure('public.finish_product_action_request(uuid,boolean,text,jsonb,text)') IS NULL AS gone")).rows[0].gone,'unscoped RPC signature removed');
check((await db.query("SELECT NOT has_function_privilege('authenticated','public.finish_product_action_request(uuid,text,text,text,uuid,uuid,boolean,text,jsonb,text)','EXECUTE') AS denied")).rows[0].denied,'browser cannot call completion RPC');
// Recover an expired lease, not a second delivery under the original attempt.
const retryId=await proposal();await run(review,[t,retryId,'approved']);
const first=(await run(claim,[t,worker])).rows[0];
await db.query("UPDATE public.ai_action_requests SET locked_at=now()-interval '11 minutes' WHERE id=$1",[first.id]);
await reject(finish,[t,'dishbee','dishbee.runtime',worker,first.claim_token,first.id,true,'ref','{}',null],'expired completion refused');
const second=(await run(claim,[t,'worker-b'])).rows[0];
check(second.id===first.id&&second.claim_token!==first.claim_token&&second.attempts===2,'expired executing action is reclaimed with new fencing token');
await reject(finish,[t,'dishbee','dishbee.runtime',worker,first.claim_token,first.id,true,'ref','{}',null],'stale worker refused after reclaim');
const failed=[t,'dishbee','dishbee.runtime','worker-b',second.claim_token,second.id,false,null,'{}','provider unavailable'];
check((await run(finish,failed)).rows[0].ok,'failure records integer retry backoff');
check((await run(claim,[t,worker])).rows.length===0,'failure backoff is enforced');
check((await run(finish,failed)).rows[0].ok,'exact failure replay accepted');
await db.query("UPDATE public.ai_action_requests SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[second.id]);
const third=(await run(claim,[t,worker])).rows[0];
check(third.attempts===3,'retry count increases');
await db.query("UPDATE public.ai_action_requests SET attempts=8,locked_at=now()-interval '11 minutes' WHERE id=$1",[third.id]);
check((await run(claim,[t,worker])).rows.length===0,'exhausted uncertain execution is not retried');
const exhausted=(await db.query('SELECT status,error_message FROM public.ai_action_requests WHERE id=$1',[third.id])).rows[0];
check(exhausted.status==='failed'&&exhausted.error_message.includes('manual_reconciliation'),'unknown outcome explicitly requires manual reconciliation');
await db.query("UPDATE public.tenant_products SET config='{}' WHERE tenant_id=$1 AND product_key='dishbee'",[t]);
await reject(claim,[t,worker],'removing explicit enablement immediately stops claims');
const initial=await readFile(new URL('20261005080500_dishbee_buzz_action_runtime.sql',migrations),'utf8');
check(!/UPDATE public\.product_connections/.test(initial),'migration does not grant execution scopes');
await db.close();
console.log(`Dishbee action execution: ${assertions} scope, approval, lease, retry and idempotency checks passed`);
