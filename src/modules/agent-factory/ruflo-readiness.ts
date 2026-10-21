/**
 * Read-only operator presentation of the Ruflo staging gates.
 * This NEVER confers executable permission; SQL and worker preflights remain
 * authoritative before each and every MCP tool operation.
 */
export type RufloReadinessSnapshot={
 pilot:{status:string;data_region:string}|null;
 binding:{status:string;data_region:string|null;
  executable_sha256?:string|null;probe_manifest_sha256:string|null;
  allowed_probe_tools:string[];verified_at:string|null}|null;
 staging:{status:string;expires_at:string|null}|null;
};
export type RufloReadinessCheck={key:string;label:string;passed:boolean;description:string};
const validSha=(v:string|null|undefined)=>!!v&&/^[a-f0-9]{64}$/.test(v);
const current=(timestamp:string|null|undefined,now:number,maxAgeMs:number)=>
 !!timestamp&&Number.isFinite(Date.parse(timestamp))&&
 Date.parse(timestamp)<=now&&now-Date.parse(timestamp)<=maxAgeMs;

export function evaluateRufloStagingReadiness(s:RufloReadinessSnapshot,now=Date.now()){
 const pilot=s.pilot,binding=s.binding,staging=s.staging;
 const checks:RufloReadinessCheck[]=[
  {key:"review",label:"Independent tenant pilot review",
   passed:pilot?.status==="shortlisted",
   description:"Tenant pilot is independently shortlisted; this does not connect Ruflo."},
  {key:"sandbox",label:"Reviewed sandbox binding",
   passed:binding?.status==="sandbox_verified"&&
    current(binding.verified_at,now,30*86400000),
   description:"Immutable upstream version and isolated worker must have recent verification."},
  {key:"schema",label:"Pinned MCP tool manifest",
   passed:validSha(binding?.probe_manifest_sha256)&&
     !!binding?.allowed_probe_tools?.length,
   description:"Only independently pinned, read-only MCP tool input schemas are admitted."},
  {key:"region",label:"Tenant data-region isolation",
   passed:!!pilot?.data_region&&pilot.data_region===binding?.data_region,
   description:"Tenant and sandbox must be bound to the same approved jurisdiction."},
  {key:"stage",label:"Unexpired staging release",
   passed:staging?.status==="staging_approved"&&
    !!staging.expires_at&&Number.isFinite(Date.parse(staging.expires_at))&&
    Date.parse(staging.expires_at)>now,
   description:"A separate, short-lived staging approval is required; absent means disabled."},
 ];
 return{
  checks,
  stagingProbeEligibleForRequest:checks.every(x=>x.passed),
  customerAgentExecutionReady:false as const,
  note:"Status preview only. Authoritative SQL admission, scoped credentials and worker rechecks remain mandatory.",
 };
}
