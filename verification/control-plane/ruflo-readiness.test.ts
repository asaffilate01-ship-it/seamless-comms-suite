import {describe,expect,test} from "bun:test";
import {evaluateRufloStagingReadiness} from "../../src/modules/agent-factory/ruflo-readiness";

const now=Date.parse("2026-10-21T07:30:00Z");
const valid={
 pilot:{status:"shortlisted",data_region:"GB"},
 binding:{
  status:"sandbox_verified",data_region:"GB",
  probe_manifest_sha256:"b".repeat(64),
  allowed_probe_tools:["swarm_health"],
  verified_at:new Date(now-3600000).toISOString(),
 },
 staging:{status:"staging_approved",expires_at:new Date(now+3600000).toISOString()},
};
describe("Ruflo operator readiness preview cannot unlock customer execution",()=>{
 test("fully checked pilot is eligible only for a read-only staged probe",()=>{
  const result=evaluateRufloStagingReadiness(valid,now);
  expect(result.stagingProbeEligibleForRequest).toBe(true);
  expect(result.customerAgentExecutionReady).toBe(false);
  expect(result.checks.every(c=>c.passed)).toBe(true);
 });
 test("missing, revoked, cross-region, stale and unpinned states all fail closed",()=>{
  const variants=[
   {...valid,pilot:{...valid.pilot,status:"requested"}},
   {...valid,binding:{...valid.binding,status:"suspended"}},
   {...valid,binding:{...valid.binding,data_region:"DE"}},
   {...valid,binding:{...valid.binding,verified_at:new Date(now-31*86400000).toISOString()}},
   {...valid,binding:{...valid.binding,probe_manifest_sha256:null}},
   {...valid,binding:{...valid.binding,allowed_probe_tools:[]}},
   {...valid,staging:{status:"suspended",expires_at:null}},
   {...valid,staging:{status:"staging_approved",expires_at:new Date(now-1).toISOString()}},
  ];
  for(const variant of variants){
   const report=evaluateRufloStagingReadiness(variant,now);
   expect(report.stagingProbeEligibleForRequest).toBe(false);
   expect(report.customerAgentExecutionReady).toBe(false);
  }
 });
});
