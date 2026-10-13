/* eslint-disable @typescript-eslint/no-explicit-any -- service role client uses existing platform-kernel schema */
import {z} from "zod";
import {
 authoriseServiceScope,parseServiceAuthorization,verifyServiceSecret,
 type ServiceCredentialRecord
} from "@/modules/platform/service-identity";
import {recommendFinanceConnectors} from "./catalogue";
const schema=z.object({
 tenantId:z.string().uuid(),productKey:z.string().min(2).max(80),
 brandId:z.string().uuid().optional(),countryCode:z.literal("GB").default("GB")
}).strict();
function output(body:unknown,status:number){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
export async function serveFinanceConnectorCatalogue(request:Request):Promise<Response>{
 if(request.method!=="POST")return output({error:"POST only"},405);
 const raw=await request.text().catch(()=>"");
 if(raw.length>4096)return output({error:"Invalid request"},400);
 const parsed=schema.safeParse((()=>{try{return JSON.parse(raw);}catch{return null;}})());
 if(!parsed.success)return output({error:"Invalid catalogue request"},400);
 const input=parsed.data;
 let identity;
 try{identity=parseServiceAuthorization(request.headers.get("authorization"));}
 catch{return output({error:"Unauthorised"},401);}
 try{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const {data:row,error}=await db.from("platform_service_credentials")
   .select("id,key_id,secret_hash,status,expires_at,scopes")
   .eq("key_id",identity.keyId).maybeSingle();
  if(error||!row||!verifyServiceSecret(identity.secret,row.secret_hash))
   return output({error:"Unauthorised"},401);
  const scopes=z.array(z.object({
   tenantId:z.string().uuid(),productKey:z.string().min(2),
   brandIds:z.array(z.string().uuid()).optional(),
   locationIds:z.array(z.string().uuid()).optional(),
   capabilities:z.array(z.string())
  })).parse(row.scopes);
  const credential:ServiceCredentialRecord={
    id:row.id,keyId:row.key_id,secretHash:row.secret_hash,
    status:row.status,expiresAt:row.expires_at,scopes
  };
  authoriseServiceScope(credential,{
   tenantId:input.tenantId,productKey:input.productKey,
   brandId:input.brandId,capability:"finance.catalogue.read"
  });
  const {data:product,error:productError}=await db.from("tenant_products").select("status")
   .eq("tenant_id",input.tenantId).eq("product_key",input.productKey).maybeSingle();
  if(productError||!product||product.status!=="active")return output({error:"Active tenant product required"},403);
  let brandName:string|undefined;
  if(input.brandId){
    const {data:brand,error:brandError}=await db.from("tenant_brands").select("name").eq("id",input.brandId)
      .eq("tenant_id",input.tenantId).maybeSingle();
    if(brandError||!brand)return output({error:"Brand outside tenant scope"},403);
    brandName=brand.name;
  }
  const candidates=recommendFinanceConnectors(input.productKey,brandName,input.countryCode);
  return output({
    tenantId:input.tenantId,productKey:input.productKey,brandId:input.brandId??null,
    market:"GB",source:"omniqora.finance-catalogue",
    candidates:candidates.map(p=>({key:p.key,name:p.name,family:p.family,rail:p.rail,
       status:"candidate",usableAtCheckout:false,underwritingApproved:false})),
    enabledProviderKeys:[],confirmedCustomerOffers:[],liveFinance:false
  },200);
 }catch{return output({error:"Credential scope or finance registry unavailable"},403);}
}
