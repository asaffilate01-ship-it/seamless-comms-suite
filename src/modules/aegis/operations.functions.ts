import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requireTenantMembership,requireAdminRole} from '@/modules/platform/access';
import {AEGIS_PRODUCT_KEY,aegisReadiness} from './capabilities';

const operationInput=z.object({tenantId:z.string().uuid(),kind:z.enum(['site','engagement','incident']),area:z.string().min(2).max(80),title:z.string().trim().min(1).max(200),details:z.string().max(5000).default(''),parentId:z.string().uuid().nullable(),assignedUserId:z.string().uuid().nullable(),requestId:z.string().uuid()}).strict();
export const getAegisOperations=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:{tenantId:string})=>z.object({tenantId:z.string().uuid()}).strict().parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const product=await db.from('tenant_products').select('status').eq('tenant_id',data.tenantId).eq('product_key',AEGIS_PRODUCT_KEY).maybeSingle();if(product.error||product.data?.status!=='active')throw new Error('Active Aegis product required');
 const [records,events]=await Promise.all([db.from('aegis_operations').select('*').eq('tenant_id',data.tenantId).order('updated_at',{ascending:false}).limit(200),db.from('aegis_operation_events').select('*').eq('tenant_id',data.tenantId).order('created_at',{ascending:false}).limit(100)]);for(const r of [records,events])if(r.error)throw new Error(r.error.message);return {records:records.data??[],events:events.data??[]};
});
export const createAegisOperation=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:z.input<typeof operationInput>)=>operationInput.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const existing=await db.from('aegis_operations').select('*').eq('tenant_id',data.tenantId).eq('created_by',context.userId).eq('request_id',data.requestId).maybeSingle();if(existing.error)throw new Error(existing.error.message);if(existing.data){const r=existing.data;if(r.kind!==data.kind||r.area!==data.area||r.title!==data.title||r.details!==data.details||r.parent_id!==data.parentId||r.assigned_user_id!==data.assignedUserId)throw new Error('Request ID already used for a different record');return r;}
 const {data:row,error}=await db.from('aegis_operations').insert({tenant_id:data.tenantId,kind:data.kind,area:data.area,title:data.title,details:data.details,parent_id:data.parentId,assigned_user_id:data.assignedUserId,request_id:data.requestId,created_by:context.userId,status:data.kind==='incident'?'open':'draft'}).select('*').single();if(error)throw new Error(error.message);return row;
});
export const advanceAegisOperation=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:{tenantId:string;id:string;revision:number;status:string})=>z.object({tenantId:z.string().uuid(),id:z.string().uuid(),revision:z.number().int().positive(),status:z.enum(['draft','active','archived','scheduled','completed','cancelled','open','review','resolved','closed'])}).strict().parse(i)).handler(async({context,data})=>{
 const access=await requireTenantMembership(context,data.tenantId);requireAdminRole(access.role);const {data:row,error}=await (context.supabase as any).from('aegis_operations').update({status:data.status,revision:data.revision+1}).eq('tenant_id',data.tenantId).eq('id',data.id).eq('revision',data.revision).select('*').maybeSingle();if(error)throw new Error(error.message);if(!row)throw new Error('Record changed or access revoked; refresh before retrying');return row;
});
