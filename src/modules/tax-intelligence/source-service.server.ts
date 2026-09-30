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

const source=z.object({
  jurisdiction:z.string().min(2).max(80),
  authority:z.string().min(2).max(200),
  sourceType:z.string().min(1).max(120),
  authorityLevel:z.enum([
    "legislation","regulation","binding_case_law","persuasive_case_law",
    "official_ruling","official_guidance","administrative_manual","secondary"
  ]),
  title:z.string().min(2).max(1000),
  citation:z.string().max(500).optional().nullable(),
  sourceUrl:z.string().url().refine((value)=>value.startsWith("https://"),"Tax source URL must use HTTPS"),
  effectiveFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  effectiveUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  publishedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  checkedAt:z.string().datetime(),
  contentHash:z.string().regex(/^[0-9a-f]{64}$/).optional().nullable(),
  supersedesSourceId:z.string().uuid().optional().nullable(),
  metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({})
});

const schema=z.discriminatedUnion("operation",[
  z.object({
    operation:z.literal("source.upsert"),tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),
    tenantProductId:z.string().uuid(),providerKey:z.string().min(1).max(160),source
  }),
  z.object({
    operation:z.literal("source.retire"),tenantId:z.string().uuid(),productKey:z.string().min(1).max(80),
    tenantProductId:z.string().uuid(),sourceId:z.string().uuid(),
    effectiveUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
]);

async function authenticate(request:Request){
  const{keyId,secret}=parseServiceAuthorization(request.headers.get("authorization"));
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const{data:row,error}=await db.from("platform_service_credentials")
    .select("id,key_id,secret_hash,status,expires_at,scopes").eq("key_id",keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(secret,row.secret_hash))throw new Error("Service credential refused");
  const scopes=z.array(z.object({
    tenantId:z.string().uuid(),productKey:z.string().min(1),
    tenantProductId:z.string().uuid().optional().nullable(),locationIds:z.array(z.string().uuid()).optional(),
    capabilities:z.array(z.string().min(1))
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,status:row.status,expiresAt:row.expires_at,scopes
  };
  return{db,credential};
}

export async function serveTaxSourceService(request:Request){
  try{
    const raw=await request.text();if(raw.length>262144)return reply({error:"Payload too large"},413);
    let json:unknown;try{json=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
    const input=schema.parse(json);
    const{db,credential}=await authenticate(request);
    authoriseServiceScope(credential,{
      tenantId:input.tenantId,productKey:input.productKey,tenantProductId:input.tenantProductId,
      capability:"tax_intelligence.sources.write"
    });

    const{data:tp}=await db.from("tenant_products").select("id,status,product_key")
      .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle();
    if(!tp||tp.status!=="active"||tp.product_key!==input.productKey)return reply({error:"Active tenant product required"},403);

    if(input.operation==="source.retire"){
      const{data:row,error}=await db.from("tax_knowledge_sources").update({
        effective_until:input.effectiveUntil,metadata:{retiredByProvider:true,workerKeyId:credential.keyId}
      }).eq("id",input.sourceId).select("id,effective_until").single();
      if(error||!row)return reply({error:"Tax source not found or could not be retired"},404);
      await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
      return reply({source:row});
    }

    const s=input.source;
    if(s.effectiveFrom&&s.effectiveUntil&&s.effectiveUntil<s.effectiveFrom){
      return reply({error:"Source effective-until date precedes effective-from date"},422);
    }
    if(Date.parse(s.checkedAt)>Date.now()+5*60*1000)return reply({error:"Source checkedAt is in the future"},422);

    if(s.supersedesSourceId){
      const{data:prior}=await db.from("tax_knowledge_sources").select("id,jurisdiction")
        .eq("id",s.supersedesSourceId).maybeSingle();
      if(!prior||String(prior.jurisdiction).toUpperCase()!==s.jurisdiction.toUpperCase()){
        return reply({error:"Superseded source must exist in the same jurisdiction"},422);
      }
    }

    const metadata={...s.metadata,providerKey:input.providerKey,workerKeyId:credential.keyId};
    let existingQuery=db.from("tax_knowledge_sources").select("id")
      .eq("jurisdiction",s.jurisdiction).eq("source_url",s.sourceUrl);
    existingQuery=s.contentHash?existingQuery.eq("content_hash",s.contentHash):existingQuery.is("content_hash",null);
    const{data:existing}=await existingQuery.maybeSingle();
    const values={
      jurisdiction:s.jurisdiction,authority:s.authority,source_type:s.sourceType,
      authority_level:s.authorityLevel,title:s.title,citation:s.citation??null,source_url:s.sourceUrl,
      effective_from:s.effectiveFrom??null,effective_until:s.effectiveUntil??null,
      published_at:s.publishedAt??null,checked_at:s.checkedAt,content_hash:s.contentHash??null,
      supersedes_source_id:s.supersedesSourceId??null,metadata
    };
    const result=existing?.id
      ?await db.from("tax_knowledge_sources").update(values).eq("id",existing.id).select("*").single()
      :await db.from("tax_knowledge_sources").insert(values).select("*").single();
    if(result.error||!result.data)throw new Error(result.error?.message??"Tax source could not be stored");

    if(s.supersedesSourceId&&s.effectiveFrom){
      const priorEnd=new Date(Date.parse(s.effectiveFrom)-86400000).toISOString().slice(0,10);
      await db.from("tax_knowledge_sources").update({effective_until:priorEnd})
        .eq("id",s.supersedesSourceId).is("effective_until",null);
    }
    await db.from("platform_service_credentials").update({last_used_at:new Date().toISOString()}).eq("id",credential.id);
    return reply({source:result.data},201);
  }catch(error){
    if(error instanceof z.ZodError)return reply({error:"Invalid tax-source contract"},422);
    const message=error instanceof Error?error.message:"Tax-source service refused";
    if(/credential|scope|authorization|expired/i.test(message))return reply({error:message},403);
    return reply({error:message},503);
  }
}
