/**
 * Planning-only guard, NOT a credential, runtime permission or model executor.
 * The live worker must independently reload authoritative tenant, source,
 * approval, tool, budget and data-residency grants on every execution step.
 */
export const RUFLO_SAFE_TOOLS=Object.freeze(["swarm_health","swarm_status","agent_list"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const product=/^[a-z0-9][a-z0-9.-]{1,80}$/;
export function planRufloSandboxProbe(input={}){
 const reasons=[];
 if(!uuid.test(input.tenantId??"")||!uuid.test(input.runId??"")||
    !uuid.test(input.jobId??"")||!product.test(input.productKey??""))
  reasons.push("Invalid scoped tenant, product, run or job identity");
 if(input.pilotStatus!=="shortlisted")reasons.push("Independent pilot review missing");
 if(input.bindingStatus!=="sandbox_verified")reasons.push("Verified isolated sandbox binding missing");
 if(input.entitlementActive!==true)reasons.push("Omniqora intelligence entitlement missing");
 if(input.jobStatus!=="queued"||input.reservationStatus!=="reserved")
  reasons.push("Queued job and reserved model budget required");
 if(input.risk!=="standard")reasons.push("Sensitive and regulated inputs excluded from initial pilot");
 if(!RUFLO_SAFE_TOOLS.includes(input.toolName))reasons.push("Ruflo tool not on read-only allowlist");
 if(!Array.isArray(input.verifiedTools)||!input.verifiedTools.includes(input.toolName))
  reasons.push("Tool capability not independently verified");
 if(!Array.isArray(input.tenantGrantedTools)||!input.tenantGrantedTools.includes(input.toolName))
  reasons.push("Tenant has not granted this tool");
 if(typeof input.region!=="string"||!/^[A-Z]{2}$/.test(input.region)||
    input.approvedRegion!==input.region)reasons.push("Region boundary not verified");
 if(input.includesCustomerContent!==false)
  reasons.push("Sandbox probe cannot include customer prompts, files or records");
 const eligible=reasons.length===0;
 return{
  status:eligible?"sandbox_probe_eligible":"blocked",
  reasons,
  // Metadata only. This is never itself an executable authorisation.
  probe:eligible?{
   tenantId:input.tenantId,productKey:input.productKey,
   runId:input.runId,jobId:input.jobId,
   toolName:input.toolName,mode:"read_only_health_probe",
   namespace:("oq_"+input.tenantId+"_"+input.productKey).replace(/[^a-z0-9_-]/gi,"_"),
   customerContentIncluded:false,requiresFreshWorkerPreflight:true,
  }:null,
 };
}
