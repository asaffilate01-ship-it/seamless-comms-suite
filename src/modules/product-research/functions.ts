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

export const listResearchHistory=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({projectId:z.string().uuid(),offset:z.number().int().min(0).max(100000).default(0)}).parse(input))
 .handler(async({context,data})=>{
  const role=await membership(context,data.tenantId);
  const r=await(context.supabase as any).from('product_research_revisions').select('revision,name,saved_by,saved_at').eq('tenant_id',data.tenantId).eq('project_id',data.projectId).order('revision',{ascending:false}).range(data.offset,data.offset+24);
  if(r.error)throw new Error('Research history unavailable');
  const revisions=r.data as {revision:number;name:string;saved_by:string;saved_at:string}[];
  const reviews=await(context.supabase as any).from('product_research_reviews').select('revision,reviewer_id,decision,note,reviewed_at').eq('tenant_id',data.tenantId).eq('project_id',data.projectId).in('revision',revisions.map(r=>r.revision));
  if(reviews.error)throw new Error('Research reviews unavailable. Check the review migration.');
  return {revisions,reviews:reviews.data as {revision:number;reviewer_id:string;decision:string;note:string;reviewed_at:string}[],canReview:['owner','admin'].includes(role)};
 });
// Restore loads historical content as an unsaved draft. Saving creates a new revision
// through the existing optimistic/idempotent save path; it never rewrites history.
export const readResearchRevision=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({projectId:z.string().uuid(),revision:z.number().int().positive()}).parse(input))
 .handler(async({context,data})=>{
  await membership(context,data.tenantId);
  const r=await(context.supabase as any).from('product_research_revisions').select('name,dossier').eq('tenant_id',data.tenantId).eq('project_id',data.projectId).eq('revision',data.revision).single();
  if(r.error||!r.data)throw new Error('Research revision unavailable');
  const dossier=parseDraft(r.data.dossier);
  dossier.sources=dossier.sources.map(source=>({...source,review:'pending',reviewer:''}));
  return {name:r.data.name as string,dossierJson:JSON.stringify(dossier)};
 });
export const reviewResearchProject=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({projectId:z.string().uuid(),revision:z.number().int().positive(),decision:z.enum(['reviewed','changes_requested']),note:z.string().trim().min(1).max(2000)}).parse(input))
 .handler(async({context,data})=>{
  const role=await membership(context,data.tenantId);
  if(!['owner','admin'].includes(role))throw new Error('Research review access required');
  const r=await(context.supabase as any).rpc('review_product_research_project',{_tenant:data.tenantId,_project:data.projectId,_revision:data.revision,_decision:data.decision,_note:data.note});
  if(r.error){if(r.error.code==='40001')throw new Error('A newer revision exists. Reopen the project before reviewing.');throw new Error('Review could not be recorded. An existing review cannot be changed; save a new revision for another review.');}
  return r.data as {revision:number;replayed:boolean};
 });
