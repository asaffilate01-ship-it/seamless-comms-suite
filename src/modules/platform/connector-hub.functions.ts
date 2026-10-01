import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const getConnectorHubWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"connectors.core"});
  const db=context.supabase as any;
  const{data:tp,error:tpError}=await db.from("tenant_products")
    .select("id,tenant_id,product_key,region_key,status")
    .eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
  if(tpError||!tp||tp.status!=="active")throw new Error("Active tenant product required");

  const{data:product,error:productError}=await db.from("platform_products")
    .select("product_key,parent_product_key").eq("product_key",tp.product_key).maybeSingle();
  if(productError)throw new Error(productError.message);
  const productKeys=[product?.parent_product_key,tp.product_key].filter(Boolean);

  const[requirements,bindings,runs,syncState,webhooks,reconciliations]=await Promise.all([
    db.from("product_connector_requirements")
      .select("product_key,connector_key,required,purpose,config")
      .in("product_key",productKeys),
    db.from("tenant_integration_bindings")
      .select("id,location_id,module_key,provider,plugin_key,integration_kind,environment,external_account_ref,config,status,last_verified_at,secret_ref,secret_refs,created_at,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("module_key"),
    db.from("connector_runs")
      .select("id,binding_id,connector_key,operation_key,direction,status,idempotency_key,request_summary,response_summary,error,started_at,completed_at,created_at,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("created_at",{ascending:false}).limit(500),
    db.from("connector_sync_state")
      .select("connector_key,stream_key,cursor,watermark,last_success_at,last_error_at,last_error,revision,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("connector_key"),
    db.from("connector_webhook_inbox")
      .select("id,connector_key,external_event_id,event_type,signature_verified,status,error,received_at,processed_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("received_at",{ascending:false}).limit(500),
    db.from("connector_reconciliations")
      .select("id,connector_key,resource_type,local_ref,external_ref,status,differences,resolved_at,created_at,updated_at")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .order("created_at",{ascending:false}).limit(500)
  ]);
  for(const result of[requirements,bindings,runs,syncState,webhooks,reconciliations]){
    if(result.error)throw new Error(result.error.message);
  }

  const requirementRows=requirements.data??[];
  const connectorKeys=[...new Set([
    ...requirementRows.map((row:any)=>row.connector_key),
    ...(bindings.data??[]).map((row:any)=>row.plugin_key).filter(Boolean)
  ])];
  const catalogue=connectorKeys.length
    ?await db.from("platform_connector_catalogue")
      .select("connector_key,name,connector_kind,description,status,capabilities,supported_countries,metadata")
      .in("connector_key",connectorKeys).order("name")
    :{data:[],error:null};
  if(catalogue.error)throw new Error(catalogue.error.message);

  const safeBindings=(bindings.data??[]).map((row:any)=>({
    id:row.id,locationId:row.location_id,moduleKey:row.module_key,provider:row.provider,
    pluginKey:row.plugin_key,integrationKind:row.integration_kind,environment:row.environment,
    externalAccountRef:row.external_account_ref,config:row.config,status:row.status,lastVerifiedAt:row.last_verified_at,
    credentialNamesConfigured:[
      ...(row.secret_ref?["default"]:[]),...Object.keys(row.secret_refs??{})
    ],
    createdAt:row.created_at,updatedAt:row.updated_at
  }));

  const reqByKey=new Map<string,any>();
  for(const req of requirementRows){
    const existing=reqByKey.get(req.connector_key);
    reqByKey.set(req.connector_key,existing?{
      ...existing,...req,required:Boolean(existing.required||req.required),
      purpose:[existing.purpose,req.purpose].filter(Boolean).filter((v:string,i:number,a:string[])=>a.indexOf(v)===i).join(" / ")
    }:req);
  }

  return{
    tenantProduct:tp,
    requirements:[...reqByKey.values()],
    catalogue:catalogue.data??[],
    bindings:safeBindings,
    runs:runs.data??[],
    syncState:syncState.data??[],
    webhooks:webhooks.data??[],
    reconciliations:reconciliations.data??[]
  };
});
