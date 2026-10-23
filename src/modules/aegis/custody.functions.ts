import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership,requireAdminRole} from '@/modules/platform/access';
const scope=z.object({tenantId:z.string().uuid()}).strict();
export const getAegisCustody=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const [resources,events]=await Promise.all([db.from('aegis_resources').select('*').eq('tenant_id',data.tenantId).order('updated_at',{ascending:false}).limit(200),db.from('aegis_resource_events').select('*').eq('tenant_id',data.tenantId).order('recorded_at',{ascending:false}).limit(200)]);for(const r of [resources,events])if(r.error)throw new Error(r.error.message);return {resources:resources.data??[],events:events.data??[]};
});
const create=scope.extend({siteId:z.string().uuid(),kind:z.enum(['visitor','key','equipment']),label:z.string().trim().min(1).max(160),hostRef:z.string().trim().max(200).default(''),requestId:z.string().uuid()});
export const createAegisResource=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof create>)=>create.parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);const db=context.supabase as any;
 const old=await db.from('aegis_resources').select('*').eq('tenant_id',data.tenantId).eq('created_by',context.userId).eq('request_id',data.requestId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data){if(old.data.site_id!==data.siteId||old.data.kind!==data.kind||old.data.label!==data.label||old.data.host_ref!==data.hostRef)throw new Error('Request ID reused with different resource');return old.data}
 const {data:row,error}=await db.from('aegis_resources').insert({tenant_id:data.tenantId,site_id:data.siteId,kind:data.kind,label:data.label,host_ref:data.hostRef,stage:data.kind==='visitor'?'expected':'available',request_id:data.requestId,created_by:context.userId}).select('*').single();if(error)throw new Error(error.message);return row;
});
const transition=scope.extend({resourceId:z.string().uuid(),revision:z.number().int().positive(),stage:z.enum(['approved','onsite','departed','cancelled','issued','returned','maintenance','available','lost']),custodianId:z.string().uuid().nullable(),note:z.string().trim().min(1).max(2000)});
export const transitionAegisResource=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof transition>)=>transition.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const {data:row,error}=await(context.supabase as any).from('aegis_resources').update({stage:data.stage,custodian_id:data.custodianId,note:data.note,revision:data.revision+1}).eq('tenant_id',data.tenantId).eq('id',data.resourceId).eq('revision',data.revision).select('*').maybeSingle();if(error)throw new Error(error.message);if(!row)throw new Error('Resource changed or access denied; refresh before retrying');return row;
});
