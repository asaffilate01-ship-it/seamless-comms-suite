import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireService,requireWriteRole} from '@/modules/platform/access';
import {salesScope,salesWorkspaceInput,salesSequenceInput,salesSequenceStatusInput,salesEnrolInput,salesActionInput,salesCompleteInput,salesControlInput,salesOutcomeInput,salesProspectInput} from './contracts';
import type {SalesWorkspaceData,SalesList,SalesPerson,SalesSequence,SalesEnrolment,SalesAction,SalesMember} from './contracts';

// New migrations are not yet present in generated Supabase types. The boundary
// below remains authenticated and validates every public input with Zod; RPCs
// independently enforce tenant, entitlement, role and transition checks in SQL.
async function guard(context:any,tenantId:string,write=false){
 const access=await requireService(context,tenantId,'omniqora.sales-engagement');
 if(write)requireWriteRole(access.role);
 return access;
}
async function rpc(context:any,name:string,args:Record<string,unknown>){
 const result=await (context.supabase as any).rpc(name,args);
 if(result.error)throw new Error(result.error.message||'Sales operation failed');
 return result.data;
}
function checkedRows(result:any):any[]{if(result.error)throw new Error(result.error.message||'Sales workspace unavailable');return result.data??[];}

export const getSalesWorkspace=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesWorkspaceInput>)=>salesWorkspaceInput.parse(input))
 .handler(async({context,data}):Promise<SalesWorkspaceData>=>{
  const access=await guard(context,data.tenantId),db=context.supabase as any;
  const limits={lists:100,people:200,sequences:100,enrolments:200,actions:400,members:400};
  const scoped=(q:any)=>data.productKey?q.eq('product_key',data.productKey):q;
  let peopleQuery=db.from('crm_people').select('id,display_name,email,phone_e164').eq('tenant_id',data.tenantId).order('display_name').limit(limits.people);
  if(data.search)peopleQuery=peopleQuery.ilike('display_name','%'+data.search.replace(/[\\%_]/g,'\\$&')+'%');
  const initial=await Promise.all([
   scoped(db.from('sales_prospect_lists').select('id,name,product_key,status').eq('tenant_id',data.tenantId).order('updated_at',{ascending:false}).limit(limits.lists)),
   scoped(db.from('sales_sequences').select('id,name,product_key,status,steps').eq('tenant_id',data.tenantId).eq('runtime_version',1).order('updated_at',{ascending:false}).limit(limits.sequences)),
   peopleQuery,
   db.from('product_catalogue').select('product_key,name').eq('status','active').order('name').limit(200),
   db.from('sales_contact_suppressions').select('person_id').eq('tenant_id',data.tenantId).limit(1000),
  ]);
  const lists=checkedRows(initial[0]) as SalesList[],sequences=checkedRows(initial[1]) as SalesSequence[];
  const people=checkedRows(initial[2]) as SalesPerson[],products=checkedRows(initial[3]) as Array<{product_key:string;name:string}>;
  const suppressions=checkedRows(initial[4]);
  const [enrolmentResult,memberResult]=await Promise.all([
   sequences.length?db.from('sales_sequence_enrolments').select('id,sequence_id,person_id,status,current_step,next_action_at,stop_reason,person:crm_people!sales_sequence_enrolments_person_id_fkey(id,display_name)').eq('tenant_id',data.tenantId).eq('runtime_version',1).in('sequence_id',sequences.map(x=>x.id)).order('updated_at',{ascending:false}).limit(limits.enrolments):Promise.resolve({data:[]}),
   lists.length?db.from('sales_prospect_members').select('id,list_id,person_id,total_score,fit_score,intent_score,engagement_score,status,score_reasons,person:crm_people!sales_prospect_members_person_id_fkey(id,display_name)').eq('tenant_id',data.tenantId).in('list_id',lists.map(x=>x.id)).order('total_score',{ascending:false,nullsFirst:false}).limit(limits.members):Promise.resolve({data:[]}),
  ]);
  const enrolments=checkedRows(enrolmentResult) as SalesEnrolment[],members=checkedRows(memberResult) as SalesMember[];
  const actions=enrolments.length?checkedRows(await db.from('sales_sequence_actions').select('id,enrolment_id,step_index,kind,title,body,subject,status,task_id,completion_note,reviewed_at,created_at').eq('tenant_id',data.tenantId).in('enrolment_id',enrolments.map(x=>x.id)).order('created_at',{ascending:false}).limit(limits.actions)) as SalesAction[]:[];
  return {role:access.role,deliveryMode:'review_only',products,people,lists,members,sequences,enrolments,actions,suppressedPersonIds:suppressions.map(x=>x.person_id as string),limits};
 });

export const createSalesSequence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesSequenceInput>)=>salesSequenceInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);return await rpc(context,'sales_v1_create_sequence',{_tenant:data.tenantId,_name:data.name,_product:data.productKey,_steps:data.steps}) as string;});
export const setSalesSequenceStatus=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesSequenceStatusInput>)=>salesSequenceStatusInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);await rpc(context,'sales_v1_sequence_status',{_tenant:data.tenantId,_sequence:data.sequenceId,_status:data.status});return {ok:true};});
export const enrolSalesPerson=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesEnrolInput>)=>salesEnrolInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);return await rpc(context,'sales_v1_enrol',{_tenant:data.tenantId,_sequence:data.sequenceId,_person:data.personId,_lead:data.leadId}) as string;});
export const prepareSalesActions=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesScope>)=>salesScope.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);return await rpc(context,'sales_v1_prepare_due',{_tenant:data.tenantId,_limit:50}) as {prepared:number;reconciled:number;deliveryMode:'review_only'};});
export const completeSalesAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesCompleteInput>)=>salesCompleteInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);await rpc(context,'sales_v1_complete_action',{_tenant:data.tenantId,_action:data.actionId,_note:data.note});return {ok:true};});
export const approveSalesContent=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesActionInput>)=>salesActionInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);await rpc(context,'sales_v1_approve_content',{_tenant:data.tenantId,_action:data.actionId});return {ok:true};});
export const controlSalesEnrolment=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesControlInput>)=>salesControlInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);await rpc(context,'sales_v1_control_enrolment',{_tenant:data.tenantId,_enrolment:data.enrolmentId,_command:data.command});return {ok:true};});
export const recordSalesOutcome=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesOutcomeInput>)=>salesOutcomeInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);return await rpc(context,'sales_v1_record_outcome',{_tenant:data.tenantId,_person:data.personId,_outcome:data.outcome,_key:data.idempotencyKey,_note:data.note}) as {stopped:number;replayed:boolean};});
export const saveSalesProspect=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof salesProspectInput>)=>salesProspectInput.parse(input))
 .handler(async({context,data})=>{await guard(context,data.tenantId,true);return await rpc(context,'sales_v1_save_prospect',{_tenant:data.tenantId,_list:data.listId,_person:data.personId,_fit:data.fit,_intent:data.intent,_engagement:data.engagement,_reason:data.reason}) as string;});
