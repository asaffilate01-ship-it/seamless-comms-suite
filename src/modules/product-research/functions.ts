import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {parseDraft} from '../../../tools/product-research/editor-model.mjs';

const scope=z.object({tenantId:z.string().uuid()});
// Actual membership is required, including for platform operators. No cross-tenant admin bypass.
async function membership(context:any,tenantId:string,write=false){
 const r=await context.supabase.from('tenant_members').select('role').eq('tenant_id',tenantId).eq('user_id',context.userId).maybeSingle();
 if(r.error||!r.data||(write&&!['owner','admin','agent'].includes(r.data.role)))throw new Error('Research access required');
 return r.data.role as string;
}
export interface ResearchProject {id:string;name:string;revision:number;updated_at:string;updated_by:string}
export const listResearchProjects=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({offset:z.number().int().min(0).max(100000).default(0)}).parse(input))
 .handler(async({context,data})=>{
  const role=await membership(context,data.tenantId);
  const r=await(context.supabase as any).from('product_research_projects').select('id,name,revision,updated_at,updated_by')
   .eq('tenant_id',data.tenantId).order('updated_at',{ascending:false}).order('id').range(data.offset,data.offset+24);
  if(r.error)throw new Error('Research projects unavailable. Check the research migration.');
  return {projects:(r.data??[]) as ResearchProject[],canWrite:['owner','admin','agent'].includes(role)};
 });
export const readResearchProject=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({projectId:z.string().uuid()}).parse(input))
 .handler(async({context,data})=>{
  await membership(context,data.tenantId);
  const r=await(context.supabase as any).from('product_research_projects').select('id,name,revision,dossier').eq('tenant_id',data.tenantId).eq('id',data.projectId).single();
  if(r.error||!r.data)throw new Error('Research project unavailable');
  return {id:r.data.id as string,name:r.data.name as string,revision:r.data.revision as number,dossierJson:JSON.stringify(r.data.dossier)};
 });
export const saveResearchProject=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({projectId:z.string().uuid(),requestId:z.string().uuid(),expectedRevision:z.number().int().min(0),name:z.string().trim().min(1).max(120),dossierJson:z.string().max(1000000)}).parse(input))
 .handler(async({context,data})=>{
  await membership(context,data.tenantId,true);
  let dossier:Record<string,unknown>;
  try{dossier=parseDraft(JSON.parse(data.dossierJson));}catch{throw new Error('Invalid research dossier');}
  if(new TextEncoder().encode(JSON.stringify(dossier)).length>1000000)throw new Error('Research dossier exceeds 1 MB');
  const r=await(context.supabase as any).rpc('save_product_research_project',{_tenant:data.tenantId,_project:data.projectId,_request:data.requestId,_expected:data.expectedRevision,_name:data.name,_dossier:dossier});
  if(r.error){if(r.error.code==='40001')throw new Error('A newer revision exists. Download your draft, then reopen the saved project before applying changes.');throw new Error('Research save failed. Retry the same save or reopen the project.');}
  return r.data as {id:string;revision:number;replayed:boolean};
 });
