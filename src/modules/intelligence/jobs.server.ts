import { z } from "zod";
import {
  authoriseServiceScope,
  parseServiceAuthorization,
  verifyServiceSecret,
  type ServiceCredentialRecord,
} from "@/modules/platform/service-identity";

function reply(body:unknown,status=200){
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}

const base=z.object({
  tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),tenantProductId:z.string().uuid()
});

const schema=z.discriminatedUnion("operation",[
  base.extend({
    operation:z.literal("claim"),jobTypes:z.array(z.string().min(1).max(120)).max(20).optional(),
    limit:z.number().int().min(1).max(50).default(10)
  }),
  base.extend({
    operation:z.literal("complete"),jobId:z.string().uuid(),resultRef:z.string().min(1).max(500),
    providerKey:z.string().min(1).max(160),model:z.string().max(160).optional().nullable()
  }),
  base.extend({
    operation:z.literal("fail"),jobId:z.string().uuid(),error:z.string().min(1).max(2000)
  })
]);

async function auth(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),tenantProductId:z.string().uuid().optional().nullable(),
    locationIds:z.array(z.string().uuid()).optional(),capabilities:z.array(z.string().min(1))
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes
  };
  return{db,credential};
}

export async function serveIntelligenceJobs(request:Request){
  try{
    const raw=await request.text();if(raw.length>131072)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=schema.parse(json);
    const{db,credential}=await auth(request);
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,
      capability:"intelligence.jobs.work"
    });

    const{data:tp}=await db.from("tenant_products").select("id,status,product_key")
      .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!tp||tp.status!=="active"||tp.product_key!==input.productKey)return reply({error:"Active tenant product required"},403);

    if(input.operation==="claim"){
      const{data:jobs,error}=await db.rpc("claim_intelligence_jobs_for_scope",{
        _tenant:input.tenantId,_tenant_product:input.tenantProductId,_limit:input.limit,
        _job_types:input.jobTypes??null,_worker_key:credential.keyId
      });
      if(error)throw new Error(error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({jobs:jobs??[]});
    }

    const{data:job}=await db.from("intelligence_jobs").select("id,status,worker_key_id")
      .eq("id",input.jobId).eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).maybeSingle();
    if(!job||job.status!=="processing")return reply({error:"Processing intelligence job not found"},404);
    if(job.worker_key_id&&job.worker_key_id!==credential.keyId)return reply({error:"Intelligence job is claimed by another worker"},409);

    if(input.operation==="complete"){
      const{error}=await db.rpc("finish_intelligence_job",{
        _job:input.jobId,_success:true,_result_ref:input.resultRef,
        _provider_key:input.providerKey,_model:input.model??null,_error:null
      });
      if(error)throw new Error(error.message);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({ok:true,status:"completed"});
    }

    const{error}=await db.rpc("finish_intelligence_job",{
      _job:input.jobId,_success:false,_result_ref:null,_provider_key:null,_model:null,_error:input.error
    });
    if(error)throw new Error(error.message);
    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return reply({ok:true,status:"retry_or_failed"});
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid Intelligence job contract"},422);
    const message=error instanceof Error?error.message:"Intelligence service refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
