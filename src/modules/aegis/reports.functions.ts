import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership} from '@/modules/platform/access';
const scope=z.object({tenantId:z.string().uuid()}).strict();
const evidence={body:z.string().trim().max(10000),checks:z.array(z.object({label:z.string().trim().min(1).max(160),result:z.enum(['pass','fail','not_applicable']),finding:z.string().trim().max(2000)}).strict()).max(30)};
export const getAegisReports=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const [rows,events]=await Promise.all([db.from('aegis_reports').select('*').eq('tenant_id',data.tenantId).order('updated_at',{ascending:false}).limit(200),db.from('aegis_report_events').select('*').eq('tenant_id',data.tenantId).order('recorded_at',{ascending:false}).limit(200)]);for(const r of [rows,events])if(r.error)throw new Error(r.error.message);return {rows:rows.data??[],events:events.data??[],userId:context.userId};
});
const create=scope.extend({siteId:z.string().uuid(),kind:z.enum(['inspection','service_report']),title:z.string().trim().min(1).max(200),requestId:z.string().uuid(),...evidence});
export const createAegisReport=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof create>)=>create.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;const old=await db.from('aegis_reports').select('*').eq('tenant_id',data.tenantId).eq('created_by',context.userId).eq('request_id',data.requestId).maybeSingle();if(old.error)throw new Error(old.error.message);if(old.data){if(old.data.site_id!==data.siteId||old.data.kind!==data.kind||old.data.title!==data.title||old.data.body!==data.body||JSON.stringify(old.data.checks.map((c:any)=>[c.label,c.result,c.finding]))!==JSON.stringify(data.checks.map(c=>[c.label,c.result,c.finding])))throw new Error('Request ID reused; refresh before creating a new draft');return old.data;}
 const {data:row,error}=await db.from('aegis_reports').insert({tenant_id:data.tenantId,site_id:data.siteId,kind:data.kind,title:data.title,body:data.body,checks:data.checks,request_id:data.requestId,created_by:context.userId}).select('*').single();if(error)throw new Error(error.message);return row;
});
const change=scope.extend({reportId:z.string().uuid(),revision:z.number().int().positive(),stage:z.enum(['draft','submitted','approved','changes_requested']),reviewNote:z.string().trim().max(2000),...evidence});
export const changeAegisReport=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof change>)=>change.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const {data:row,error}=await(context.supabase as any).from('aegis_reports').update({body:data.body,checks:data.checks,stage:data.stage,review_note:data.reviewNote,revision:data.revision+1}).eq('tenant_id',data.tenantId).eq('id',data.reportId).eq('revision',data.revision).select('*').maybeSingle();if(error)throw new Error(error.message);if(!row)throw new Error('Report changed or access denied; refresh before retrying');return row;
});
