import { createHash, randomBytes } from "node:crypto";

export class MerqanoProvisioningBlock extends Error {}

function approvedHttps(value:string|undefined,name:string){
 if(!value) throw new MerqanoProvisioningBlock(name+" is not configured");
 const url=new URL(value); if(url.protocol!=="https:") throw new MerqanoProvisioningBlock(name+" must use HTTPS");
 return url.toString().replace(/\/$/,"");
}
export function merqanoEnvironment(){
 const appUrl=approvedHttps(process.env.MERQANO_APP_URL,"MERQANO_APP_URL");
 const secret=process.env.MERQANO_PROVISIONING_SECRET??"";
 if(secret.length<32) throw new MerqanoProvisioningBlock("MERQANO_PROVISIONING_SECRET is not configured");
 return{appUrl,secret};
}
async function request(config:ReturnType<typeof merqanoEnvironment>,body:Record<string,unknown>){
 const response=await fetch(config.appUrl+"/api/platform/provisioning",{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{"content-type":"application/json","x-omniqora-provisioning-secret":config.secret},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({error:"invalid_merqano_response"}));
 if(!response.ok){const reason=typeof data?.error==="string"?data.error:"merqano_http_"+response.status;if([400,404,409,422].includes(response.status))throw new MerqanoProvisioningBlock(reason);throw new Error(reason)}
 return data as any;
}
export async function provisionMerqanoFactory(db:any,job:any){
 const [tenantResult,stateResult,connectionResult]=await Promise.all([
  db.from("tenants").select("id,name,slug,country_code,currency,timezone,metadata").eq("id",job.tenant_id).maybeSingle(),
  db.from("tenant_products").select("status,external_tenant_id,config").eq("tenant_id",job.tenant_id).eq("product_key","merqano").maybeSingle(),
  db.from("product_connections").select("*").eq("tenant_id",job.tenant_id).eq("product_key","merqano").order("updated_at",{ascending:false}).limit(1).maybeSingle()
 ]);
 if(tenantResult.error||!tenantResult.data)throw new Error("Tenant is unavailable");
 if(stateResult.error||connectionResult.error)throw new Error("Merqano tenant state is unavailable");
 if(connectionResult.data?.status==="connected")return connectionResult.data;
 const config=merqanoEnvironment(); const tenant=tenantResult.data;
 let externalTenantId=connectionResult.data?.external_tenant_id??stateResult.data?.external_tenant_id??null;
 if(!externalTenantId){
  const provisioned=await request(config,{action:"provision_tenant",omniqoraTenantId:tenant.id,tenantKey:tenant.slug,displayName:tenant.name,country:tenant.country_code,currency:tenant.currency,timezone:tenant.timezone,aiProfile:stateResult.data?.config?.aiProfile??"premium-retail"});
  externalTenantId=String(provisioned.tenantId??"");
 }
 if(!externalTenantId)throw new Error("Merqano did not return a tenant id");
 const connectorKey="oqcp_"+randomBytes(32).toString("hex");const credentialHash=createHash("sha256").update(connectorKey).digest("hex");
 const values={tenant_id:job.tenant_id,product_key:"merqano",external_tenant_id:externalTenantId,base_url:config.appUrl,status:"configured",capabilities:["tenant.snapshot","merqano.tenant.read","merqano.entitlements.read"],credential_hash:credentialHash,credential_suffix:connectorKey.slice(-8),credential_expires_at:new Date(Date.now()+365*86400000).toISOString(),metadata:{provisionedBy:"omniqora-saas-factory"},updated_at:new Date().toISOString()};
 let connection=connectionResult.data;
 if(connection){const r=await db.from("product_connections").update(values).eq("id",connection.id).select("*").single();if(r.error)throw new Error(r.error.message);connection=r.data}else{const r=await db.from("product_connections").insert(values).select("*").single();if(r.error)throw new Error(r.error.message);connection=r.data}
 const origin=approvedHttps(process.env.OMNIQORA_PUBLIC_URL,"OMNIQORA_PUBLIC_URL");
 const bind=await request(config,{action:"bind_control_plane",tenantId:externalTenantId,omniqoraTenantId:tenant.id,controlPlaneUrl:origin+"/api/control-plane/tenant-snapshot",controlPlaneKey:connectorKey});
 if(bind.status!=="connected")throw new Error("Merqano control-plane bind was not confirmed");
 const verified=await db.from("product_connections").update({status:"connected",last_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",connection.id).select("*").single();
 if(verified.error)throw new Error(verified.error.message);
 await db.from("tenant_products").update({external_tenant_id:externalTenantId,base_url:config.appUrl,updated_at:new Date().toISOString()}).eq("tenant_id",job.tenant_id).eq("product_key","merqano");
 return verified.data;
}
