import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership,requireAdminRole} from '@/modules/platform/access';
import {buildSupervisorBrief,type FieldEvent} from './brief';
const scope=z.object({tenantId:z.string().uuid()}).strict();
export const getAegisFieldWorkspace=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const [checkpoints,events]=await Promise.all([db.from('aegis_checkpoints').select('id,site_id,label,status').eq('tenant_id',data.tenantId).limit(300),db.from('aegis_field_events').select('id,operation_id,checkpoint_id,actor,kind,note,recorded_at,evidence_class').eq('tenant_id',data.tenantId).order('recorded_at',{ascending:false}).limit(300)]);for(const r of [checkpoints,events])if(r.error)throw new Error(r.error.message);return {checkpoints:checkpoints.data??[],events:events.data??[],brief:buildSupervisorBrief((events.data??[]) as FieldEvent[])};
});
const checkpoint=scope.extend({siteId:z.string().uuid(),label:z.string().trim().min(1).max(160)});
export const createAegisCheckpoint=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof checkpoint>)=>checkpoint.parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);const {data:row,error}=await(context.supabase as any).from('aegis_checkpoints').insert({tenant_id:data.tenantId,site_id:data.siteId,label:data.label,created_by:context.userId}).select('id,label').single();if(error)throw new Error(error.message);return row;
});
const event=scope.extend({operationId:z.string().uuid(),kind:z.enum(['attendance_in','attendance_out','checkpoint_observation','welfare_check']),checkpointId:z.string().uuid().nullable(),note:z.string().max(2000).default(''),requestId:z.string().uuid()});
export const recordAegisFieldEvent=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof event>)=>event.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const old=await db.from('aegis_field_events').select('*').eq('tenant_id',data.tenantId).eq('actor',context.userId).eq('request_id',data.requestId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data){if(old.data.operation_id!==data.operationId||old.data.kind!==data.kind||old.data.checkpoint_id!==data.checkpointId||old.data.note!==data.note)throw new Error('Request ID reused with different evidence');return old.data}
 const {data:row,error}=await db.from('aegis_field_events').insert({tenant_id:data.tenantId,operation_id:data.operationId,kind:data.kind,checkpoint_id:data.checkpointId,note:data.note,request_id:data.requestId,actor:context.userId}).select('*').single();if(error)throw new Error(error.message);return row;
});
