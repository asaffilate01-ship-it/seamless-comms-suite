import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRun,
  selectRecentActionRun,
  diagnoseRepo,
  renderMarkdown
} from "../../scripts/factory-ci-diagnose.mjs";

const run=(conclusion,seconds=4)=>({
 id:123,name:"Verify private SaaS",html_url:"https://github.com/example/repo/actions/runs/123",
 status:"completed",conclusion,
 created_at:"2026-10-15T06:00:00.000Z",
 updated_at:new Date(Date.parse("2026-10-15T06:00:00.000Z")+seconds*1000).toISOString()
});

test("instant failure with no steps is labelled possible, never proven billing",()=>{
 const result=classifyRun(run("failure"),[{conclusion:"failure",steps:null}]);
 assert.equal(result.classification,"possible_pre_runner_failure");
 assert.equal(result.durationSeconds,4);
 assert.match(result.note,/Inspect run annotations/);
 assert.doesNotMatch(result.note,/(billing issue confirmed|billing failure proven)/i);
});

test("real execution failures are distinguished from runner-start failures",()=>{
 const result=classifyRun(run("failure",300),[{conclusion:"failure",steps:[{name:"checkout"},{name:"npm test",conclusion:"failure"}]}]);
 assert.equal(result.classification,"executed_steps_failed");
 assert.equal(result.observedStepCount,2);
});

test("successful and skipped checks cannot certify live product readiness",()=>{
 const pass=classifyRun(run("success",60),[{conclusion:"success",steps:[{name:"build"}]}]);
 assert.equal(pass.classification,"workflow_passed");
 assert.match(pass.note,/independently unverified/);
 const skipped=classifyRun(run("skipped",0),[]);
 assert.equal(skipped.classification,"workflow_skipped");
 assert.match(skipped.note,/No execution evidence/);
});

test("recent-run selection ignores scheduled skips when a meaningful result exists",()=>{
 assert.equal(selectRecentActionRun([{id:1,conclusion:"skipped"}, {id:2,conclusion:"failure"}]).id,2);
 assert.equal(selectRecentActionRun([]),null);
});

test("explicit repository lookup uses read-only GitHub actions URLs and does not expose token",async()=>{
 const calls=[];
 const fetchImpl=async (url,init)=>{
  calls.push({url,method:init.method,token:init.headers.Authorization});
  if(url.includes("/jobs?"))return{ok:true,json:async()=>({jobs:[{conclusion:"failure",steps:null}]})};
  return{ok:true,json:async()=>({workflow_runs:[run("failure")]})};
 };
 const output=await diagnoseRepo("example/private","fake-test-only",fetchImpl);
 assert.equal(output.classification,"possible_pre_runner_failure");
 assert.equal(output.repository,"example/private");
 assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.url.startsWith("https://api.github.com/repos/example/private/actions/")));
 assert.ok(calls.every(c=>c.method==="GET"));
 assert.doesNotMatch(JSON.stringify(output),/fake-test-only/);
 await assert.rejects(()=>diagnoseRepo("../private","fake-test-only",fetchImpl),/invalid_repository_name/);
});

test("human-readable triage is labelled as non-authoritative",()=>{
 const content=renderMarkdown([{repository:"owner/repo",workflow:"CI",classification:"possible_pre_runner_failure",durationSeconds:4}]);
 assert.match(content,/not.*confirmed root causes/i);
 assert.match(content,/account Actions budget/);
});
