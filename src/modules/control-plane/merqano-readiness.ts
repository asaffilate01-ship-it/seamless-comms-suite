export type MerqanoFactoryReadinessInput={
 productStatus?:string|null;connectionStatus?:string|null;externalTenantId?:string|null;baseUrl?:string|null;lastVerifiedAt?:string|null;
 services:Record<string,{status:string;enabled:boolean}>;domain?:{verificationStatus:string;sslStatus:string}|null;
};
export type MerqanoFactoryReadiness={ready:boolean;score:number;checks:Array<{key:string;ok:boolean;required:boolean;detail:string}>};
export function evaluateMerqanoFactoryReadiness(x:MerqanoFactoryReadinessInput):MerqanoFactoryReadiness{
 const checks=[
 {key:"product",ok:x.productStatus==="active",required:true,detail:"Merqano tenant product must be active."},
 {key:"connection",ok:x.connectionStatus==="connected"&&Boolean(x.externalTenantId),required:true,detail:"Verified external Merqano workspace required."},
 {key:"endpoint",ok:Boolean(x.baseUrl?.startsWith("https://")),required:true,detail:"Deployment-approved HTTPS Merqano origin required."},
 {key:"freshness",ok:Boolean(x.lastVerifiedAt)&&Date.now()-Date.parse(x.lastVerifiedAt!)<24*60*60*1000,required:true,detail:"Control-plane handshake must have been verified within 24 hours."},
 {key:"ai",ok:x.services["merqano.omniqora-ai"]?.enabled===true,required:false,detail:"Omniqora AI is optional but recommended."},
 {key:"marktpass",ok:x.services["merqano.marktpass"]?.enabled===true,required:false,detail:"MarktPass entitlement required when compliance gating is enabled."},
 {key:"domain",ok:!x.domain||(x.domain.verificationStatus==="verified"&&x.domain.sslStatus==="active"),required:Boolean(x.domain),detail:"Configured primary domain must have verified DNS and active SSL."},
 ];
 const required=checks.filter(c=>c.required);const score=Math.round(100*required.filter(c=>c.ok).length/Math.max(required.length,1));
 return{ready:required.every(c=>c.ok),score,checks};
}
