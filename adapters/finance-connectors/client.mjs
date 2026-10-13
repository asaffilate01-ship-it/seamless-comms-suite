/**
 * Node/server-only adapter for Dishbee, Merqano, TraveNexa and other Omniqora tenants.
 * Never use a platform service credential from browser code.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createFinanceCatalogueClient({host,credential,fetcher=globalThis.fetch}={}){
 if(typeof host!=="string"||!/^https:\/\/[^/]+$/i.test(host)||host.includes("@"))
  throw new Error("Exact HTTPS Omniqora host required");
 if(typeof credential!=="string"||!/^oqsvc_[A-Za-z0-9_-]+\.[a-f0-9]{64}$/i.test(credential))
  throw new Error("Server-only scoped Omniqora credential required");
 if(typeof fetcher!=="function")throw new Error("Server fetch required");
 return {
  async candidates({tenantId,productKey,brandId}={}){
   if(!uuid.test(tenantId)||!productKey||typeof productKey!=="string"||productKey.length>80)
    throw new Error("Valid tenant and landlord product scope required");
   if(brandId!==undefined&&!uuid.test(brandId))throw new Error("Invalid brand scope");
   const response=await fetcher(host+"/api/finance/catalogue",{
    method:"POST",signal:AbortSignal.timeout(10000),
    headers:{"Authorization":"Bearer "+credential,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({tenantId,productKey,...(brandId?{brandId}:{})})
   });
   if(!response.ok)throw new Error("Omniqora finance catalogue unavailable");
   const result=await response.json();
   if(result.tenantId!==tenantId||result.productKey!==productKey||result.liveFinance!==false||
    !Array.isArray(result.candidates)||result.enabledProviderKeys?.length!==0)
    throw new Error("Unexpected or unsafe finance connector response");
   return result;
  }
 };
}
