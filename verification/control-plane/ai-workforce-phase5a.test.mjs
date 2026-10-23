import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const read=path=>readFile(new URL("../../"+path,import.meta.url),"utf8");
const migration=await read("supabase/migrations/20261021083000_ai_workforce_shadow_teams_v5a.sql");
const api=await read("src/modules/ai-workforce/teams.functions.ts");
const ui=await read("src/modules/ai-workforce/AIWorkforceTeamsPanel.tsx");
const parent=await read("src/modules/ai-workforce/AIWorkforcePanel.tsx");
const sql=await read("verification/staging/ai-workforce-phase5a-teams.sql");
const staging=await read("verification/staging/ai-workforce-phase4a-access.sql");

test("shadow team records are tenant/product isolated without browser writes",()=>{
 for(const table of ["ai_workforce_shadow_teams","ai_workforce_shadow_steps","ai_workforce_shadow_events"]){
  assert.match(migration,new RegExp("CREATE TABLE public\\."+table));
 }
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/m\.tenant_id=%I\.tenant_id/);
 assert.match(migration,/m\.role IN\('owner','admin'\)/);
 assert.match(migration,/FOREIGN KEY\(team_id,tenant_id,product_key\)/);
 assert.match(migration,/FOREIGN KEY\(employee_id,tenant_id,product_key\)/);
 assert.match(migration,/public\.ai_workforce_require_admin\(_tenant,_product\)/);
 assert.doesNotMatch(migration,/GRANT (INSERT|UPDATE|DELETE) ON .* TO authenticated/);
});
test("team shadow plans require distinct approved members and bounded manual handoffs",()=>{
 assert.match(migration,/jsonb_array_length\(_steps\) NOT BETWEEN 2 AND 8/);
 assert.match(migration,/length\(_steps::text\)>20000/);
 assert.match(migration,/x\.k NOT IN\('employeeId','role','instructions','expectedOutput'\)/);
 assert.match(migration,/Shadow team requires distinct AI employees/);
 assert.match(migration,/approved_configuration/);
 assert.match(migration,/position_no=1 AND r<>'lead'/);
 assert.match(migration,/execution_mode text NOT NULL DEFAULT 'shadow_only'/);
 assert.match(migration,/step_count NOT BETWEEN 2 AND 8/);
 assert.match(api,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(api,/First employee must lead the shadow plan/);
});
test("independent approval and edits never grant executable AI permissions",()=>{
 assert.match(migration,/auth\.uid\(\) IN\(t\.created_by,t\.last_edited_by\)/);
 assert.match(migration,/Independent reviewer and current employee approvals required/);
 assert.match(migration,/status='draft'/);
 assert.match(migration,/reviewed_by=NULL,reviewed_at=NULL,review_note=NULL/);
 assert.match(migration,/cannot resume team with unapproved members/i);
 assert.match(migration,/mode','sequential_shadow_only'/);
 assert.match(migration,/canExecute',false,'modelCalls',0/);
 assert.match(migration,/toolCalls',0,'customerActions',0/);
 assert.match(migration,/scheduled',false/);
 assert.match(migration,/humanReviewRequired',true/);
 assert.doesNotMatch(migration,/INSERT INTO public\.ai_agent_runs|INSERT INTO public\.intelligence_jobs/);
 assert.doesNotMatch(migration,/queue_budgeted_ai_agent|queue_ai_workforce_readonly_analysis/);
});
test("review and transition RPCs are bounded and fail closed",()=>{
 for(const rpc of ["create_ai_workforce_shadow_team","save_ai_workforce_shadow_plan",
  "transition_ai_workforce_shadow_team","preview_ai_workforce_shadow_team"]){
  assert.match(api,new RegExp('"'+rpc+'"'));
  assert.match(migration,new RegExp("REVOKE ALL ON FUNCTION public\\."+rpc+"\\("));
 }
 for(const action of ["submit","approve","return","pause","resume","retire"]){
  assert.match(migration,new RegExp("WHEN '"+action+"' THEN"));
 }
 assert.match(api,/Shadow team preview attempted unsupported execution/);
 assert.match(api,/requireAdminRole\(access\.role\)/);
 assert.match(api,/requireService\(context,tenantId,"omniqora\.ai-workforce"\)/);
 assert.match(api,/requireSupabaseAuth/);
});
test("UI Team Studio is wired into existing SaaS workforce and cannot execute models",()=>{
 assert.match(parent,/AIWorkforceTeamsPanel/);
 assert.match(parent,/writable && <div className="mt-6"/);
 assert.match(ui,/AI Workforce Team Studio/);
 assert.match(ui,/independent approval/i);
 assert.match(ui,/Shadow handoff plan saved/);
 assert.match(ui,/canExecute!==false/);
 assert.doesNotMatch(ui,/\bfetch\(|\.rpc\(|queueBudgetedFactoryTask|startAgentRun/);
 for(const [filename,source] of [
  ["teams.functions.ts",api],["AIWorkforceTeamsPanel.tsx",ui],
  ["AIWorkforcePanel.tsx",parent],
 ]){
  const result=ts.transpileModule(source,{fileName:filename,reportDiagnostics:true,
   compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,filename+": "+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,"\n")));
 }
});
test("real disposable PostgreSQL verifies foreign tenant, viewer and zero execution",()=>{
 assert.match(sql,/Foreign tenant saw AI team plans/);
 assert.match(sql,/Viewer saw private shadow mission/);
 assert.match(sql,/Self-review of shadow team plan was allowed/);
 assert.match(sql,/Duplicate shadow employees were accepted/);
 assert.match(sql,/Shadow plan preview claimed autonomous execution capability/);
 assert.match(sql,/Shadow planning illegally queued model jobs/);
 assert.match(sql,/Team edits failed to revoke earlier independent approval/);
 assert.match(staging,/ai-workforce-phase5a-teams\.sql/);
});
