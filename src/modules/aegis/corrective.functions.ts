import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership,requireAdminRole} from '@/modules/platform/access';
const scope=z.object({tenantId:z.string().uuid()}).strict();
export const getAegisCorrective=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const [rows,events]=await Promise.all([db.from('aegis_corrective_actions').select('*').eq('tenant_id',data.tenantId).order('due_on').limit(200),db.from('aegis_corrective_events').select('*').eq('tenant_id',data.tenantId).order('recorded_at',{ascending:false}).limit(200)]);for(const r of [rows,events])if(r.error)throw new Error(r.error.message);return {rows:rows.data??[],events:events.data??[],userId:context.userId};
});
const create=scope.extend({reportId:z.string().uuid(),checkIndex:z.number().int().min(0).max(29),assigneeId:z.string().uuid(),dueOn:z.string().date(),priority:z.enum(['normal','high','critical']),requestId:z.string().uuid()});
export const createAegisCorrective=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof create>)=>create.parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);const db=context.supabase as any;const old=await db.from('aegis_corrective_actions').select('*').eq('tenant_id',data.tenantId).eq('created_by',context.userId).eq('request_id',data.requestId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data){const r=old.data;if(r.report_id!==data.reportId||r.check_index!==data.checkIndex||r.assignee_id!==data.assigneeId||r.due_on!==data.dueOn||r.priority!==data.priority)throw new Error('Request ID reused for a different action');return r;}
 const {data:row,error}=await db.from('aegis_corrective_actions').insert({tenant_id:data.tenantId,report_id:data.reportId,check_index:data.checkIndex,assignee_id:data.assigneeId,due_on:data.dueOn,priority:data.priority,request_id:data.requestId,created_by:context.userId}).select('*').single();if(error)throw new Error(error.message);return row;
});
const change=scope.extend({actionId:z.string().uuid(),revision:z.number().int().positive(),stage:z.enum(['in_progress','submitted','closed']),evidence:z.string().trim().max(5000),reviewNote:z.string().trim().max(2000)});
export const changeAegisCorrective=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof change>)=>change.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const {data:row,error}=await(context.supabase as any).from('aegis_corrective_actions').update({stage:data.stage,evidence:data.evidence,review_note:data.reviewNote,revision:data.revision+1}).eq('tenant_id',data.tenantId).eq('id',data.actionId).eq('revision',data.revision).select('*').maybeSingle();if(error)throw new Error(error.message);if(!row)throw new Error('Action changed or access denied; refresh before retrying');return row;
});
