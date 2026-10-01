// @ts-nocheck -- assurance tables are ahead of generated Supabase types.
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

async function membership(context:any,tenantId:string){
  const{data,error}=await context.supabase.from("tenant_members").select("role")
    .eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
  if(error||!data)throw new Error("Tenant access denied");
  return data.role as string;
}

export const listAssuranceWorkspaces=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({tenantId:z.string().uuid()}))
  .handler(async({context,data})=>{
    await membership(context,data.tenantId);
    const{data:rows,error}=await context.supabase.from("omniqora_workspaces")
      .select("id,service_key,workspace_type,template_key,name,status,jurisdiction,period_start,period_end,created_at,updated_at")
      .eq("tenant_id",data.tenantId).order("updated_at",{ascending:false});
    if(error)throw new Error(error.message);
    return rows??[];
  });

const createSchema=z.object({
  tenantId:z.string().uuid(),
  templateKey:z.enum(["full-audit","compliance-as-a-service","ma-carveout","accounting-tax"]),
  name:z.string().trim().min(1).max(160),
  jurisdiction:z.string().max(40).optional().nullable(),
  periodStart:z.string().optional().nullable(),
  periodEnd:z.string().optional().nullable(),
});
const templateMap={
  "full-audit":{service:"omniqora.full-audit-suite",type:"audit"},
  "compliance-as-a-service":{service:"omniqora.compliance-as-a-service",type:"compliance"},
  "ma-carveout":{service:"omniqora.ma-carveout-suite",type:"transaction"},
  "accounting-tax":{service:"omniqora.accounting-tax-suite",type:"accounting"},
} as const;

export const createAssuranceWorkspace=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(createSchema)
  .handler(async({context,data})=>{
    const role=await membership(context,data.tenantId);
    if(!["owner","admin","agent"].includes(role))throw new Error("Workspace write access required");
    const template=templateMap[data.templateKey];
    const{data:id,error}=await context.supabase.rpc("omniqora_create_workspace",{
      p_tenant:data.tenantId,p_service_key:template.service,p_workspace_type:template.type,
      p_template_key:data.templateKey,p_name:data.name,p_jurisdiction:data.jurisdiction??null,
      p_period_start:data.periodStart??null,p_period_end:data.periodEnd??null,
    });
    if(error)throw new Error(error.message);
    return{workspaceId:String(id)};
  });

export const getAssuranceWorkspace=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({workspaceId:z.string().uuid()}))
  .handler(async({context,data})=>{
    const{data:summary,error}=await context.supabase.rpc("omniqora_workspace_summary",{p_workspace:data.workspaceId});
    if(error)throw new Error(error.message);
    return summary as any;
  });

export const updateWorkstream=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    workspaceId:z.string().uuid(),workstreamId:z.string().uuid(),
    status:z.enum(["todo","in_progress","blocked","review","complete"]),progress:z.number().int().min(0).max(100),
  }))
  .handler(async({context,data})=>{
    const{data:ws,error:wsError}=await context.supabase.from("omniqora_workspaces").select("tenant_id").eq("id",data.workspaceId).single();
    if(wsError||!ws)throw new Error("Workspace not found");
    const role=await membership(context,ws.tenant_id);
    if(!["owner","admin","agent"].includes(role))throw new Error("Workspace write access required");
    const{error}=await context.supabase.from("omniqora_workstreams").update({
      status:data.status,progress:data.progress,updated_at:new Date().toISOString(),
    }).eq("id",data.workstreamId).eq("workspace_id",data.workspaceId);
    if(error)throw new Error(error.message);
    return{ok:true};
  });

export const addAssuranceFinding=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    workspaceId:z.string().uuid(),title:z.string().trim().min(1).max(300),
    severity:z.enum(["info","low","medium","high","critical"]).default("medium"),
    impact:z.string().max(4000).optional(),recommendation:z.string().max(4000).optional(),
  }))
  .handler(async({context,data})=>{
    const{data:ws,error:wsError}=await context.supabase.from("omniqora_workspaces").select("tenant_id").eq("id",data.workspaceId).single();
    if(wsError||!ws)throw new Error("Workspace not found");
    await membership(context,ws.tenant_id);
    const{data:row,error}=await context.supabase.from("omniqora_findings").insert({
      workspace_id:data.workspaceId,title:data.title,severity:data.severity,status:"open",
      impact:data.impact??null,recommendation:data.recommendation??null,created_by:context.userId,
    }).select("id").single();
    if(error)throw new Error(error.message);
    return{id:row.id};
  });

export const addAssuranceEvidence=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    workspaceId:z.string().uuid(),title:z.string().trim().min(1).max(300),
    evidenceType:z.string().min(1).max(80).default("document"),
    sourceType:z.string().max(80).optional().nullable(),sourceRef:z.string().max(1000).optional().nullable(),
    documentUrl:z.string().url().optional().nullable(),provenance:z.record(z.unknown()).default({}),
  }))
  .handler(async({context,data})=>{
    const{data:ws,error:wsError}=await context.supabase.from("omniqora_workspaces").select("tenant_id").eq("id",data.workspaceId).single();
    if(wsError||!ws)throw new Error("Workspace not found");
    await membership(context,ws.tenant_id);
    const{data:row,error}=await context.supabase.from("omniqora_evidence").insert({
      workspace_id:data.workspaceId,title:data.title,evidence_type:data.evidenceType,
      source_type:data.sourceType??null,source_ref:data.sourceRef??null,document_url:data.documentUrl??null,
      provenance:data.provenance,created_by:context.userId,
    }).select("id").single();
    if(error)throw new Error(error.message);
    return{id:row.id};
  });

export const addTransactionItem=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    workspaceId:z.string().uuid(),itemType:z.string().min(1).max(80),name:z.string().min(1).max(300),
    disposition:z.enum(["retained","separated","shared","newco","buyer","seller","target","unknown"]).default("unknown"),
    criticality:z.string().max(80).optional().nullable(),owner:z.string().max(200).optional().nullable(),
    day1Required:z.boolean().default(false),tsaRequired:z.boolean().default(false),data:z.record(z.unknown()).default({}),
  }))
  .handler(async({context,data})=>{
    const{data:ws,error:wsError}=await context.supabase.from("omniqora_workspaces").select("tenant_id").eq("id",data.workspaceId).single();
    if(wsError||!ws)throw new Error("Workspace not found");
    await membership(context,ws.tenant_id);
    const{data:row,error}=await context.supabase.from("omniqora_transaction_items").insert({
      workspace_id:data.workspaceId,item_type:data.itemType,name:data.name,disposition:data.disposition,
      criticality:data.criticality??null,owner:data.owner??null,day1_required:data.day1Required,
      tsa_required:data.tsaRequired,data:data.data,
    }).select("id").single();
    if(error)throw new Error(error.message);
    return{id:row.id};
  });
