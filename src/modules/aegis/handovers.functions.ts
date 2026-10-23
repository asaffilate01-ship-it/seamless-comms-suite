import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
const scope=z.object({tenantId:z.string().uuid()}).strict();
const evidence={summary:z.string().trim().min(1).max(5000),outstanding:z.string().trim().max(5000)};
export const getAegisHandovers=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const [rows,events]=await Promise.all([db.from('aegis_handovers').select('*').eq('tenant_id',data.tenantId).order('updated_at',{ascending:false}).limit(200),db.from('aegis_handover_events').select('*').eq('tenant_id',data.tenantId).order('recorded_at',{ascending:false}).limit(200)]);for(const r of [rows,events])if(r.error)throw new Error(r.error.message);return {rows:rows.data??[],events:events.data??[],userId:context.userId};
});
const create=scope.extend({siteId:z.string().uuid(),incomingId:z.string().uuid(),requestId:z.string().uuid(),...evidence});
export const createAegisHandover=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof create>)=>create.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const old=await db.from('aegis_handovers').select('*').eq('tenant_id',data.tenantId).eq('created_by',context.userId).eq('request_id',data.requestId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data){const r=old.data;if(r.site_id!==data.siteId||r.incoming_id!==data.incomingId||r.summary!==data.summary||r.outstanding!==data.outstanding)throw new Error('Request ID reused with different handover');return r;}
 const {data:row,error}=await db.from('aegis_handovers').insert({tenant_id:data.tenantId,site_id:data.siteId,incoming_id:data.incomingId,summary:data.summary,outstanding:data.outstanding,request_id:data.requestId,created_by:context.userId}).select('*').single();if(error)throw new Error(error.message);return row;
});
const change=scope.extend({handoverId:z.string().uuid(),revision:z.number().int().positive(),stage:z.enum(['draft','offered','returned','acknowledged']),response:z.string().trim().max(2000),...evidence});
export const changeAegisHandover=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof change>)=>change.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const {data:row,error}=await(context.supabase as any).from('aegis_handovers').update({summary:data.summary,outstanding:data.outstanding,stage:data.stage,response:data.response,revision:data.revision+1}).eq('tenant_id',data.tenantId).eq('id',data.handoverId).eq('revision',data.revision).select('*').maybeSingle();if(error)throw new Error(error.message);if(!row)throw new Error('Handover changed or access denied; refresh before retrying');return row;
});
