import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const sql=await readFile(new URL("../../supabase/migrations/20261014121500_agent_read_isolation.sql",import.meta.url),"utf8");
for(const table of ["dispatch_agents","dispatch_jobs","dispatch_job_stops","dispatch_vehicles",
"dispatch_agent_positions","dispatch_pod","tracking_snapshots","public_tracking_tokens"])
 assert.match(sql,new RegExp('CREATE POLICY "[^"]+" ON public\\.'+table+' FOR SELECT TO authenticated'));
assert.match(sql,/a\.user_id=auth\.uid\(\)/);
assert.match(sql,/j\.id=dispatch_job_stops\.job_id AND j\.tenant_id=dispatch_job_stops\.tenant_id/);
assert.match(sql,/a\.tenant_id=dispatch_jobs\.tenant_id/);
assert.match(sql,/j\.assigned_vehicle_id=dispatch_vehicles\.id/);
assert.match(sql,/subject_type='dispatch_job'/);
assert.match(sql,/dispatch signed tokens admin read/);
assert.doesNotMatch(sql,/CREATE POLICY "[^"]+" ON public\.dispatch_jobs FOR SELECT TO authenticated\s+USING\(public\.is_tenant_member\(tenant_id,auth\.uid\(\)\)\);/);
console.log("Driver read policies scope records, stop details and tracking to own assignments");
