import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KNOWN_FAMILY_REPO_AUDITS, portfolioIntakeRows } from "./portfolio-intake";

async function requirePlatformAdmin(context:any,write=false){
  const db=context.supabase as any;
  const{data:operator,error}=await db.from("platform_operators").select("role,status")
    .eq("user_id",context.userId).maybeSingle();
  if(error)throw new Error(error.message);
  if(!operator||operator.status!=="active")throw new Error("Platform operator access required");
  const allowed=write?["platform_owner","platform_admin"]:["platform_owner","platform_admin","platform_support","platform_billing","platform_auditor"];
  if(!allowed.includes(operator.role))throw new Error(write?"Platform owner/admin access required":"Platform operator access required");
  return operator.role as string;
}

function repoFullName(url:string|null){
  if(!url)return null;
  const match=url.match(/github\.com\/([^/]+\/[^/#]+?)(?:\.git)?(?:$|[?#])/i);
  return match?.[1]?.replace(/\.git$/,"")??null;
}

export const syncPortfolioIntake=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
  await requirePlatformAdmin(context,true);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const rows=portfolioIntakeRows();
  let synced=0;
  for(const row of rows){
    const values={
      source_row_number:row.row,intake_key:row.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")+"-"+String(row.row).padStart(3,"0"),
      intake_name:row.name,source_repo_url:row.repo,source_site_url:row.site,source_hint:row.hint,
      source_kind:row.sourceKind,proposed_role:row.targetRole,proposed_parent:row.targetParentKey,
      proposed_structure:row.migrationAction,audit_status:"repo_audit_pending",
      target_family_key:row.familyKey,target_role:row.targetRole,target_product_key:row.targetProductKey,
      target_parent_key:row.targetParentKey,migration_action:row.migrationAction,migration_wave:row.migrationWave,
      needs_repo:row.needsRepo,build_in_omniqora:row.buildInOmniqora,confidence:row.confidence
    };
    const{data:existing,error:readError}=await admin.from("portfolio_migration_assets").select("id")
      .eq("source_row_number",row.row).maybeSingle();
    if(readError)throw new Error(readError.message);
    const result=existing?.id
      ?await admin.from("portfolio_migration_assets").update(values).eq("id",existing.id).select("id").single()
      :await admin.from("portfolio_migration_assets").insert(values).select("id").single();
    if(result.error||!result.data)throw new Error(result.error?.message??"Portfolio intake row could not be synchronized");
    const assetId=result.data.id;
    const familyName=row.familyKey.split("-").map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ");
    const{data:family}=await admin.from("portfolio_product_families").select("family_key")
      .eq("family_key",row.familyKey).maybeSingle();
    const familyValues={
      family_key:row.familyKey,name:familyName,
      target_kind:row.targetRole==="platform"?"platform":row.targetRole==="shared_engine"||row.targetRole==="shared_addon"?"shared_engine":row.targetRole==="landlord"||row.targetRole==="product_variant"||row.targetRole==="tenant"||row.targetRole==="brand_tenant"?"multi_product_family":"review"
    };
    const familyResult=family
      ?await admin.from("portfolio_product_families").update(familyValues).eq("family_key",row.familyKey)
      :await admin.from("portfolio_product_families").insert(familyValues);
    if(familyResult.error)throw new Error(familyResult.error.message);
    const repository=repoFullName(row.repo);
    if(repository){
      const{data:candidate}=await admin.from("portfolio_repo_candidates").select("id")
        .eq("asset_id",assetId).eq("repository_full_name",repository).maybeSingle();
      const repoValues={
        asset_id:assetId,repository_full_name:repository,
        repo_url:row.repo?.replace(/\.git$/,"")??("https://github.com/"+repository),candidate_kind:"source"
      };
      const repoResult=candidate?.id
        ?await admin.from("portfolio_repo_candidates").update(repoValues).eq("id",candidate.id)
        :await admin.from("portfolio_repo_candidates").insert(repoValues);
      if(repoResult.error)throw new Error(repoResult.error.message);
    }
    synced++;
  }
  for(const[familyKey,decision]of Object.entries(KNOWN_FAMILY_REPO_AUDITS)){
    const{data:familyAssets,error:familyAssetError}=await admin.from("portfolio_migration_assets")
      .select("id,intake_name,source_repo_url").eq("target_family_key",familyKey);
    if(familyAssetError)throw new Error(familyAssetError.message);
    const canonicalCandidate=decision.candidates.find((candidate)=>candidate.repositoryFullName===decision.canonical);
    const canonicalAsset=(familyAssets??[]).find((asset:any)=>
      canonicalCandidate&&String(asset.source_repo_url??"").includes(canonicalCandidate.repositoryFullName)
    )??(familyAssets??[])[0]??null;
    const{error:familyError}=await admin.from("portfolio_product_families").update({
      canonical_asset_id:canonicalAsset?.id??null,
      canonical_repo_url:canonicalCandidate?.repoUrl??null,
      decision_status:"decided",rationale:decision.rationale,
      metadata:{repoAudit:"initial GitHub family audit"}
    }).eq("family_key",familyKey);
    if(familyError)throw new Error(familyError.message);

    for(const asset of familyAssets??[]){
      for(const candidate of decision.candidates){
        const{data:existing}=await admin.from("portfolio_repo_candidates").select("id")
          .eq("asset_id",asset.id).eq("repository_full_name",candidate.repositoryFullName).maybeSingle();
        const values={
          asset_id:asset.id,repository_full_name:candidate.repositoryFullName,repo_url:candidate.repoUrl,
          candidate_kind:candidate.repositoryFullName===decision.canonical?"canonical":"merge_source",
          accessible:true,archived:false,default_branch:"main",
          latest_commit_sha:candidate.latestCommitSha,latest_commit_at:candidate.latestCommitAt,
          file_count:candidate.fileCount,src_file_count:candidate.srcFileCount,route_count:candidate.routeCount,
          supabase_file_count:candidate.supabaseFileCount,migration_count:candidate.migrationCount,
          function_count:candidate.functionCount,test_count:candidate.testCount,
          completeness_score:candidate.completenessScore,audit_notes:candidate.auditNotes,
          is_canonical:candidate.repositoryFullName===decision.canonical,
          audited_at:new Date().toISOString(),metadata:{familyKey}
        };
        const repoResult=existing?.id
          ?await admin.from("portfolio_repo_candidates").update(values).eq("id",existing.id)
          :await admin.from("portfolio_repo_candidates").insert(values);
        if(repoResult.error)throw new Error(repoResult.error.message);
      }
    }
  }
  await admin.from("audit_log").insert({
    actor:context.userId,action:"platform.portfolio.intake_synced",entity:"portfolio_migration_assets",
    entity_id:"saas-intake",payload:{rows:synced,familyAudits:Object.keys(KNOWN_FAMILY_REPO_AUDITS)}
  });
  return{synced,familyAudits:Object.keys(KNOWN_FAMILY_REPO_AUDITS)};
});

const listSchema=z.object({
  family:z.string().max(100).optional().nullable(),
  role:z.string().max(80).optional().nullable(),
  wave:z.number().int().min(0).max(20).optional().nullable(),
  status:z.string().max(80).optional().nullable(),
  q:z.string().max(200).optional().nullable()
});
export const listPortfolioMigrationAssets=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof listSchema>)=>listSchema.parse(input))
.handler(async({context,data})=>{
  await requirePlatformAdmin(context,false);
  const db=context.supabase as any;
  let query=db.from("portfolio_migration_assets").select("*").order("migration_wave").order("source_row_number");
  if(data.family)query=query.eq("target_family_key",data.family);
  if(data.role)query=query.eq("target_role",data.role);
  if(data.wave!==null&&data.wave!==undefined)query=query.eq("migration_wave",data.wave);
  if(data.status)query=query.eq("migration_status",data.status);
  if(data.q)query=query.or("intake_name.ilike.%"+data.q+"%,target_product_key.ilike.%"+data.q+"%,source_repo_url.ilike.%"+data.q+"%,source_site_url.ilike.%"+data.q+"%");
  const{data:assets,error}=await query.limit(500);
  if(error)throw new Error(error.message);
  const ids=(assets??[]).map((row:any)=>row.id);
  const[candidates,relationships,checks]=ids.length?await Promise.all([
    db.from("portfolio_repo_candidates").select("*").in("asset_id",ids).order("is_canonical",{ascending:false}).order("latest_commit_at",{ascending:false}),
    db.from("portfolio_relationships").select("*").in("source_asset_id",ids).order("created_at"),
    db.from("portfolio_migration_checks").select("*").in("asset_id",ids).order("check_key")
  ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}];
  for(const result of[candidates,relationships,checks])if(result.error)throw new Error(result.error.message);
  return(assets??[]).map((asset:any)=>({
    ...asset,
    repoCandidates:(candidates.data??[]).filter((row:any)=>row.asset_id===asset.id),
    relationships:(relationships.data??[]).filter((row:any)=>row.source_asset_id===asset.id),
    checks:(checks.data??[]).filter((row:any)=>row.asset_id===asset.id)
  }));
});

const updateSchema=z.object({
  assetId:z.string().uuid(),
  targetFamilyKey:z.string().max(100).optional().nullable(),
  targetRole:z.enum(["platform","shared_engine","shared_addon","landlord","product_variant","tenant","brand_tenant","marketplace_tenant","tenant_review","merge_source","external_connector","review"]).optional(),
  targetProductKey:z.string().max(100).optional().nullable(),
  targetParentKey:z.string().max(100).optional().nullable(),
  migrationAction:z.string().max(160).optional(),
  migrationWave:z.number().int().min(0).max(20).optional(),
  migrationStatus:z.enum(["intake","repo_audit","classified","ready","in_progress","shadow_sync","parity","cutover","complete","retired","blocked"]).optional(),
  needsRepo:z.boolean().optional(),
  buildInOmniqora:z.boolean().optional(),
  confidence:z.enum(["provisional","medium","high","verified"]).optional(),
  canonicalRepoUrl:z.string().url().optional().nullable(),
  canonicalRepoReason:z.string().max(4000).optional().nullable(),
  notes:z.string().max(10000).optional().nullable()
});
export const updatePortfolioMigrationAsset=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof updateSchema>)=>updateSchema.parse(input))
.handler(async({context,data})=>{
  await requirePlatformAdmin(context,true);
  const db=context.supabase as any;
  const patch:any={};
  const pairs:Record<string,unknown>={
    target_family_key:data.targetFamilyKey,target_role:data.targetRole,target_product_key:data.targetProductKey,
    target_parent_key:data.targetParentKey,migration_action:data.migrationAction,migration_wave:data.migrationWave,
    migration_status:data.migrationStatus,needs_repo:data.needsRepo,build_in_omniqora:data.buildInOmniqora,
    confidence:data.confidence,canonical_repo_url:data.canonicalRepoUrl,
    canonical_repo_reason:data.canonicalRepoReason,notes:data.notes
  };
  for(const[key,value]of Object.entries(pairs))if(value!==undefined)patch[key]=value;
  const{data:row,error}=await db.from("portfolio_migration_assets").update(patch).eq("id",data.assetId).select("*").single();
  if(error||!row)throw new Error(error?.message??"Portfolio asset could not be updated");
  return row;
});

const repoAuditSchema=z.object({
  assetId:z.string().uuid(),repositoryFullName:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  repoUrl:z.string().url(),candidateKind:z.enum(["source","alternate","merge_source","canonical","archive_after_merge"]).default("alternate"),
  accessible:z.boolean().optional().nullable(),archived:z.boolean().optional().nullable(),visibility:z.string().max(40).optional().nullable(),
  defaultBranch:z.string().max(120).optional().nullable(),latestCommitSha:z.string().max(64).optional().nullable(),
  latestCommitAt:z.string().datetime().optional().nullable(),fileCount:z.number().int().nonnegative().optional().nullable(),
  srcFileCount:z.number().int().nonnegative().optional().nullable(),routeCount:z.number().int().nonnegative().optional().nullable(),
  supabaseFileCount:z.number().int().nonnegative().optional().nullable(),migrationCount:z.number().int().nonnegative().optional().nullable(),
  functionCount:z.number().int().nonnegative().optional().nullable(),testCount:z.number().int().nonnegative().optional().nullable(),
  completenessScore:z.number().min(0).max(100).optional().nullable(),auditNotes:z.string().max(5000).optional().nullable(),
  isCanonical:z.boolean().default(false),metadata:z.record(z.string(),z.unknown()).default({})
});
export const upsertPortfolioRepoAudit=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof repoAuditSchema>)=>repoAuditSchema.parse(input))
.handler(async({context,data})=>{
  await requirePlatformAdmin(context,true);
  const db=context.supabase as any;
  if(data.isCanonical){
    const{error:clearError}=await db.from("portfolio_repo_candidates").update({is_canonical:false,candidate_kind:"alternate"}).eq("asset_id",data.assetId);
    if(clearError)throw new Error(clearError.message);
  }
  const{data:existing}=await db.from("portfolio_repo_candidates").select("id")
    .eq("asset_id",data.assetId).eq("repository_full_name",data.repositoryFullName).maybeSingle();
  const values={
    asset_id:data.assetId,repository_full_name:data.repositoryFullName,repo_url:data.repoUrl,
    candidate_kind:data.isCanonical?"canonical":data.candidateKind,accessible:data.accessible??null,
    archived:data.archived??null,visibility:data.visibility??null,default_branch:data.defaultBranch??null,
    latest_commit_sha:data.latestCommitSha??null,latest_commit_at:data.latestCommitAt??null,
    file_count:data.fileCount??null,src_file_count:data.srcFileCount??null,route_count:data.routeCount??null,
    supabase_file_count:data.supabaseFileCount??null,migration_count:data.migrationCount??null,
    function_count:data.functionCount??null,test_count:data.testCount??null,
    completeness_score:data.completenessScore??null,audit_notes:data.auditNotes??null,
    is_canonical:data.isCanonical,audited_at:new Date().toISOString(),metadata:data.metadata
  };
  const result=existing?.id
    ?await db.from("portfolio_repo_candidates").update(values).eq("id",existing.id).select("*").single()
    :await db.from("portfolio_repo_candidates").insert(values).select("*").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Repository audit could not be saved");
  if(data.isCanonical){
    await db.from("portfolio_migration_assets").update({
      canonical_repo_url:data.repoUrl,
      canonical_repo_reason:data.auditNotes??"Selected from repository audit",
      audit_status:"canonical_repo_selected"
    }).eq("id",data.assetId);
  }
  return result.data;
});

const checkSchema=z.object({
  assetId:z.string().uuid(),checkKey:z.string().min(1).max(160),
  status:z.enum(["pending","pass","warning","fail","not_applicable"]),
  detail:z.string().max(5000).optional().nullable(),evidence:z.record(z.string(),z.unknown()).default({})
});
export const savePortfolioMigrationCheck=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof checkSchema>)=>checkSchema.parse(input))
.handler(async({context,data})=>{
  await requirePlatformAdmin(context,true);
  const db=context.supabase as any;
  const{data:existing}=await db.from("portfolio_migration_checks").select("id")
    .eq("asset_id",data.assetId).eq("check_key",data.checkKey).maybeSingle();
  const values={
    asset_id:data.assetId,check_key:data.checkKey,status:data.status,detail:data.detail??null,
    evidence:data.evidence,checked_at:new Date().toISOString(),checked_by:context.userId
  };
  const result=existing?.id
    ?await db.from("portfolio_migration_checks").update(values).eq("id",existing.id).select("*").single()
    :await db.from("portfolio_migration_checks").insert(values).select("*").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Migration check could not be saved");
  return result.data;
});

export const getPortfolioMigrationSummary=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
  await requirePlatformAdmin(context,false);
  const db=context.supabase as any;
  const{data:rows,error}=await db.from("portfolio_migration_assets")
    .select("source_kind,target_family_key,target_role,migration_wave,migration_status,canonical_repo_url,needs_repo,build_in_omniqora");
  if(error)throw new Error(error.message);
  const assets=rows??[];
  const countBy=(key:string)=>Object.fromEntries([...new Set(assets.map((row:any)=>String(row[key]??"unassigned")))].map(value=>[value,assets.filter((row:any)=>String(row[key]??"unassigned")===value).length]));
  return{
    total:assets.length,
    siteOnly:assets.filter((row:any)=>row.source_kind==="site_only").length,
    withCanonicalRepo:assets.filter((row:any)=>!!row.canonical_repo_url).length,
    needsRepo:assets.filter((row:any)=>row.needs_repo).length,
    buildInOmniqora:assets.filter((row:any)=>row.build_in_omniqora).length,
    byRole:countBy("target_role"),byWave:countBy("migration_wave"),byStatus:countBy("migration_status"),byFamily:countBy("target_family_key")
  };
});


export const listPortfolioProductFamilies=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
  await requirePlatformAdmin(context,false);
  const db=context.supabase as any;
  const{data:families,error}=await db.from("portfolio_product_families").select("*")
    .order("decision_status").order("name");
  if(error)throw new Error(error.message);
  const{data:assets,error:assetError}=await db.from("portfolio_migration_assets")
    .select("id,intake_name,target_family_key,target_role,target_product_key,migration_status,canonical_repo_url,source_kind");
  if(assetError)throw new Error(assetError.message);
  return(families??[]).map((family:any)=>({
    ...family,
    assets:(assets??[]).filter((asset:any)=>asset.target_family_key===family.family_key)
  }));
});

const familyDecisionSchema=z.object({
  familyKey:z.string().min(1).max(100),
  name:z.string().min(1).max(200).optional(),
  targetKind:z.enum(["platform","shared_engine","landlord","multi_product_family","review"]).optional(),
  canonicalAssetId:z.string().uuid().optional().nullable(),
  canonicalRepoUrl:z.string().url().optional().nullable(),
  decisionStatus:z.enum(["provisional","auditing","decided","migration_ready","migrating","complete"]).optional(),
  rationale:z.string().max(10000).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).optional()
});
export const savePortfolioFamilyDecision=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof familyDecisionSchema>)=>familyDecisionSchema.parse(input))
.handler(async({context,data})=>{
  await requirePlatformAdmin(context,true);
  const db=context.supabase as any;
  const{data:existing}=await db.from("portfolio_product_families").select("*")
    .eq("family_key",data.familyKey).maybeSingle();
  const values:any={
    family_key:data.familyKey,
    name:data.name??existing?.name??data.familyKey,
    target_kind:data.targetKind??existing?.target_kind??"review",
    canonical_asset_id:data.canonicalAssetId===undefined?existing?.canonical_asset_id??null:data.canonicalAssetId,
    canonical_repo_url:data.canonicalRepoUrl===undefined?existing?.canonical_repo_url??null:data.canonicalRepoUrl,
    decision_status:data.decisionStatus??existing?.decision_status??"provisional",
    rationale:data.rationale===undefined?existing?.rationale??null:data.rationale,
    metadata:data.metadata??existing?.metadata??{}
  };
  const result=existing
    ?await db.from("portfolio_product_families").update(values).eq("family_key",data.familyKey).select("*").single()
    :await db.from("portfolio_product_families").insert(values).select("*").single();
  if(result.error||!result.data)throw new Error(result.error?.message??"Portfolio family decision could not be saved");
  return result.data;
});
