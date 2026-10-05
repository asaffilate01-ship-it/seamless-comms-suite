import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// Isolated PostgreSQL-compatible database only. No network, real contacts,
// credentials, production migrations, provider delivery, or calendar calls.
const db=new PGlite();
let passed=0;
async function check(name,fn){await fn();passed++;console.log(`PASS ${passed}: ${name}`);}
async function asUser(user,fn){
 await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const result=await fn();await db.exec('COMMIT');return result;}
 catch(error){await db.exec('ROLLBACK');throw error;}
}
const admin='55555555-aaaa-4aaa-8aaa-555555555555';
const writer='11111111-aaaa-4aaa-8aaa-111111111111';
const viewer='22222222-aaaa-4aaa-8aaa-222222222222';
const stranger='33333333-aaaa-4aaa-8aaa-333333333333';
const manual=[{kind:'call',title:'Discovery call task',body:'Record a manual outcome; this does not dial.',delayMinutes:0},{kind:'task',title:'Prepare a proposal',body:'Review the discovery notes.',delayMinutes:0}];
const rows=async(sql,args=[])=> (await db.query(sql,args)).rows;
try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE PUBLICATION supabase_realtime;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
 for(const file of files){
  if(file.startsWith('20260816120554'))for(const id of ['18bafcd5-3e4c-4044-bb63-10325a0b7209','e66c0525-1787-4250-be26-79f849624521','890c71b1-cf6e-4b68-a56e-dd6050372481','97319fe5-82fd-44cd-b27d-6ae314ee368b'])await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,'fixture@example.invalid']);
  try{await db.exec(await readFile(new URL(file,dir),'utf8'));}catch(error){throw new Error(`Migration failed: ${file}: ${error.message}`,{cause:error});}
 }
 console.log(`Applied ${files.length} repository migrations in the isolated database.`);
 for(const id of [admin,writer,viewer,stranger])await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,id+'@example.invalid']);
 await db.query('INSERT INTO public.platform_admins(user_id) VALUES($1)',[admin]);
 const pilot=await asUser(admin,async()=> (await rows('SELECT public.platform_bootstrap_dishbee_pilot() AS result'))[0].result);
 const tenant=pilot.tenants.find(t=>t.tenantSlug==='mealdeck').tenantId;
 const other=pilot.tenants.find(t=>t.tenantId!==tenant).tenantId;
 await db.query("INSERT INTO public.tenant_services(tenant_id,service_key,status,valid_from) VALUES($1,'omniqora.sales-engagement','active',now()-interval '1 hour') ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active',valid_from=EXCLUDED.valid_from,valid_until=NULL",[tenant]);
 for(const [user,role] of [[writer,'agent'],[viewer,'viewer']])await db.query('INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES($1,$2,$3)',[tenant,user,role]);
 const person=async(t=tenant)=> (await rows('INSERT INTO public.crm_people(tenant_id,display_name,email) VALUES($1,$2,$3) RETURNING id',[t,'Controlled sales fixture',randomUUID()+'@example.invalid']))[0].id;
 const p=await person(),foreign=await person(other);
 const call=(name,params,user=admin)=>asUser(user,async()=> (await rows(`SELECT public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,params))[0].result);
 const sequence=async(steps=manual)=>{
  const id=await call('sales_v1_create_sequence',[tenant,'Controlled pilot','haccora',JSON.stringify(steps)]);
  await call('sales_v1_sequence_status',[tenant,id,'active']);return id;
 };
 const enrol=(s,who=p,user=admin)=>call('sales_v1_enrol',[tenant,s,who,null],user);
 const prepare=()=>call('sales_v1_prepare_due',[tenant,50]);
 const state=async(e)=>(await rows('SELECT * FROM public.sales_sequence_enrolments WHERE id=$1',[e]))[0];
 const actions=async(e)=>rows('SELECT * FROM public.sales_sequence_actions WHERE enrolment_id=$1 ORDER BY step_index',[e]);
 const outcome=(who,type,key=randomUUID(),note='Manually recorded controlled test evidence')=>call('sales_v1_record_outcome',[tenant,who,type,key,note]);

 await check('invalid sequence definitions fail closed',async()=>{
  for(const steps of [[],null,[{kind:'voice_bot',title:'x',delayMinutes:0}],[{kind:'task',title:'x',delayMinutes:-1}],[{kind:'task',title:'x',delayMinutes:0.5}],[{kind:'email',title:'x',delayMinutes:0,body:''}],[{kind:'task',title:'x',delayMinutes:null}]])
   await assert.rejects(call('sales_v1_create_sequence',[tenant,'Invalid',null,JSON.stringify(steps)]));
 });
 await check('viewer and outsider cannot mutate',async()=>{
  for(const user of [viewer,stranger])await assert.rejects(call('sales_v1_create_sequence',[tenant,'Denied',null,JSON.stringify(manual)],user),/access|entitlement/i);
 });
 await check('activation requires a tenant administrator',async()=>{
  const s=await call('sales_v1_create_sequence',[tenant,'Agent draft',null,JSON.stringify(manual)],writer);
  assert.equal((await rows('SELECT status FROM public.sales_sequences WHERE id=$1',[s]))[0].status,'draft');
  await assert.rejects(call('sales_v1_sequence_status',[tenant,s,'active'],writer),/administrator/i);
  await assert.rejects(enrol(s),/active managed/i);
 });
 const s=await sequence();let e;
 await check('canonical contacts, cross-tenant references and repeat-safe enrollment',async()=>{
  await assert.rejects(enrol(s,foreign),/tenant/i);
  const foreignLead=(await rows("INSERT INTO public.crm_leads(tenant_id,person_id,title) VALUES($1,$2,'Foreign lead') RETURNING id",[other,foreign]))[0].id;
  await assert.rejects(call('sales_v1_enrol',[tenant,s,p,foreignLead]),/tenant|person/i);
  e=await enrol(s,p,writer);assert.equal(await enrol(s,p,writer),e);
  assert.equal((await rows('SELECT id FROM public.sales_sequence_enrolments WHERE sequence_id=$1 AND person_id=$2',[s,p])).length,1);
 });
 await check('managed REST writes and helper execution cannot bypass the RPCs',async()=>{
  const result=await asUser(writer,()=>rows("UPDATE public.sales_sequence_enrolments SET runtime_version=0,status='completed' WHERE id=$1 RETURNING id",[e]));
  assert.equal(result.length,0);assert.equal((await state(e)).runtime_version,1);
  const seqUpdate=await asUser(writer,()=>rows("UPDATE public.sales_sequences SET runtime_version=0 WHERE id=$1 RETURNING id",[s]));assert.equal(seqUpdate.length,0);
  await assert.rejects(asUser(writer,()=>rows("SELECT public.sales_v1_stop_person($1,$2,'opt_out','forged','forged')",[tenant,p])),/permission/i);
 });
 await check('preparing a step creates exactly one CRM task and one action',async()=>{
  assert.equal((await prepare()).prepared,1);assert.equal((await prepare()).prepared,0);
  const a=await actions(e);assert.equal(a.length,1);assert.equal(a[0].status,'manual_open');assert.ok(a[0].task_id);
  assert.equal((await rows('SELECT * FROM public.crm_tasks WHERE id=$1',[a[0].task_id]))[0].related_id,p);
 });
 await check('paused enrollment and paused sequence do not prepare new work',async()=>{
  await call('sales_v1_control_enrolment',[tenant,e,'pause']);assert.equal((await prepare()).prepared,0);
  await call('sales_v1_sequence_status',[tenant,s,'paused']);
  await assert.rejects(call('sales_v1_control_enrolment',[tenant,e,'resume']),/inactive/i);
  await call('sales_v1_sequence_status',[tenant,s,'active']);await call('sales_v1_control_enrolment',[tenant,e,'resume']);
 });
 await check('task completion updates CRM, advances once and completes the cadence',async()=>{
  const a=(await actions(e))[0];
  await call('sales_v1_complete_action',[tenant,a.id,'Discovery task completed']);
  await call('sales_v1_complete_action',[tenant,a.id,'Idempotent retry']);
  assert.equal((await state(e)).current_step,1);
  assert.equal((await rows('SELECT status FROM public.crm_tasks WHERE id=$1',[a.task_id]))[0].status,'completed');
  await prepare();assert.equal((await actions(e)).length,2);
  await call('sales_v1_complete_action',[tenant,(await actions(e))[1].id,'Proposal preparation task completed']);
  assert.equal((await state(e)).status,'completed');assert.equal(await enrol(s),e);
  await assert.rejects(call('sales_v1_control_enrolment',[tenant,e,'resume']),/Terminal/i);
 });
 await check('CRM-side completion reconciles without creating duplicate actions',async()=>{
  const e2=await enrol(s,await person());await prepare();const a=(await actions(e2))[0];
  await db.query("UPDATE public.crm_tasks SET status='completed' WHERE id=$1",[a.task_id]);
  assert.equal((await prepare()).reconciled,1);assert.equal((await state(e2)).current_step,1);
  await prepare();assert.equal((await actions(e2)).length,2);await call('sales_v1_control_enrolment',[tenant,e2,'cancel']);
 });
 await check('enrollment snapshots survive subsequent sequence edits',async()=>{
  const who=await person(),sq=await sequence(),en=await enrol(sq,who);
  await db.query('UPDATE public.sales_sequences SET steps=$1 WHERE id=$2',[JSON.stringify([{kind:'task',title:'New version',delayMinutes:0}]),sq]);
  assert.equal((await state(en)).steps_snapshot[0].title,manual[0].title);
  await call('sales_v1_control_enrolment',[tenant,en,'cancel']);
 });
 for(const kind of ['email','whatsapp','sms'])await check(`${kind}: approval remains blocked, never sent or advanced`,async()=>{
  const who=await person();const sq=await sequence([{kind,title:'Reviewed introduction',delayMinutes:0,body:'Controlled draft only.'},manual[1]]);const en=await enrol(sq,who);
  await prepare();const a=(await actions(en))[0];assert.equal(a.status,'pending_review');assert.equal(a.task_id,null);
  await assert.rejects(call('sales_v1_approve_content',[tenant,a.id],writer),/administrator/i);
  await call('sales_v1_approve_content',[tenant,a.id]);await call('sales_v1_approve_content',[tenant,a.id]);
  assert.equal((await actions(en))[0].status,'approved_blocked');assert.equal((await state(en)).current_step,0);
  await assert.rejects(call('sales_v1_complete_action',[tenant,a.id,'Pretend sent']),/manual/i);
  await assert.rejects(asUser(writer,()=>rows("UPDATE public.sales_sequence_actions SET status='completed' WHERE id=$1",[a.id])),/permission/i);
  assert.equal((await prepare()).prepared,0);
  await outcome(who,'replied');assert.equal((await actions(en))[0].status,'cancelled');assert.equal((await state(en)).status,'replied');
  await assert.rejects(call('sales_v1_approve_content',[tenant,a.id]),/draft/i);
 });
 await check('delays are honoured until due, rather than pre-creating all steps',async()=>{
  const who=await person(),sq=await sequence([{kind:'task',title:'Tomorrow',delayMinutes:1440}]),en=await enrol(sq,who);
  await prepare();assert.equal((await actions(en)).length,0);
  await db.query("UPDATE public.sales_sequence_enrolments SET next_action_at=now()-interval '1 second' WHERE id=$1",[en]);
  await prepare();assert.equal((await actions(en)).length,1);await call('sales_v1_control_enrolment',[tenant,en,'cancel']);
 });
 await check('opt-out stops active and paused enrollments and blocks future enrollment',async()=>{
  const who=await person(),s1=await sequence(),s2=await sequence(),e1=await enrol(s1,who),e2=await enrol(s2,who);
  await prepare();await call('sales_v1_control_enrolment',[tenant,e2,'pause']);
  const key=randomUUID();assert.equal((await outcome(who,'opt_out',key)).stopped,2);assert.equal((await outcome(who,'opt_out',key)).replayed,true);
  await assert.rejects(outcome(who,'replied',key),/Idempotency/i);
  for(const en of [e1,e2]){assert.equal((await state(en)).stop_reason,'opt_out');const a=(await actions(en))[0];assert.equal(a.status,'cancelled');assert.equal((await rows('SELECT status FROM public.crm_tasks WHERE id=$1',[a.task_id]))[0].status,'cancelled');}
  await assert.rejects(enrol(await sequence(),who),/suppressed/i);
  await assert.rejects(asUser(writer,()=>rows('DELETE FROM public.sales_contact_suppressions WHERE tenant_id=$1',[tenant])),/permission/i);
 });
 await check('scheduled meeting records automatically stop managed follow-up',async()=>{
  const who=await person(),sq=await sequence(),en=await enrol(sq,who);await prepare();
  await asUser(admin,()=>db.query("INSERT INTO public.sales_meetings(tenant_id,person_id,title,starts_at,ends_at) VALUES($1,$2,'Controlled demo',now()+interval '1 day',now()+interval '1 day 30 minutes')",[tenant,who]));
  assert.equal((await state(en)).stop_reason,'meeting_booked');assert.equal((await actions(en))[0].status,'cancelled');
  await assert.rejects(asUser(admin,()=>db.query("INSERT INTO public.sales_meetings(tenant_id,person_id,title,starts_at,ends_at) VALUES($1,$2,'Invalid foreign demo',now(),now()+interval '30 minutes')",[tenant,foreign])),/tenant/i);
 });
 await check('archiving a sequence cancels its open tasks and cannot restart it',async()=>{
  const sq=await sequence(),en=await enrol(sq,await person());await prepare();await call('sales_v1_sequence_status',[tenant,sq,'archived']);
  assert.equal((await state(en)).stop_reason,'sequence_archived');assert.equal((await actions(en))[0].status,'cancelled');
  await assert.rejects(call('sales_v1_sequence_status',[tenant,sq,'active']),/Archived/i);
 });
 await check('prospect scoring updates one existing membership and requires evidence',async()=>{
  const list=(await rows("INSERT INTO public.sales_prospect_lists(tenant_id,name) VALUES($1,'Test list') RETURNING id",[tenant]))[0].id;
  const id=await call('sales_v1_save_prospect',[tenant,list,p,60,30,90,'Verified discovery notes']);
  assert.equal(await call('sales_v1_save_prospect',[tenant,list,p,90,60,60,'Reviewed new evidence']),id);
  assert.equal((await rows('SELECT total_score FROM public.sales_prospect_members WHERE id=$1',[id]))[0].total_score,'70.00');
  await assert.rejects(call('sales_v1_save_prospect',[tenant,list,foreign,50,50,50,'Invalid cross-tenant person']),/tenant/i);
  await assert.rejects(call('sales_v1_save_prospect',[tenant,list,p,50,50,50,'']),/evidence/i);
 });
 await check('outsiders cannot read managed actions or outcomes; viewers can read but not write',async()=>{
  for(const table of ['sales_sequences','sales_sequence_enrolments','sales_sequence_actions','sales_runtime_events','sales_contact_suppressions']){
   assert.equal((await asUser(stranger,()=>rows(`SELECT * FROM public.${table} WHERE tenant_id=$1`,[tenant]))).length,0);
  }
  assert.ok((await asUser(viewer,()=>rows('SELECT * FROM public.sales_sequence_actions WHERE tenant_id=$1',[tenant]))).length>0);
 });
 await check('revoked sales entitlement blocks reads and queue mutations',async()=>{
  await db.query("UPDATE public.tenant_services SET status='suspended' WHERE tenant_id=$1 AND service_key='omniqora.sales-engagement'",[tenant]);
  assert.equal((await asUser(writer,()=>rows('SELECT * FROM public.sales_sequence_actions WHERE tenant_id=$1',[tenant]))).length,0);
  await assert.rejects(call('sales_v1_prepare_due',[tenant,50],writer),/access|entitlement/i);
 });
 console.log(`Sales runtime: ${passed} regression groups passed. Provider delivery remains disabled; no production deployment tested.`);
}finally{await db.close();}
