-- Bridge context and results belong to the dedicated source principal, not every project member.
BEGIN;
CREATE TABLE business360.bridge_jobs(
 tenant text NOT NULL,project text NOT NULL,connection text NOT NULL,id text NOT NULL,creator text NOT NULL,
 product text NOT NULL,contract text NOT NULL,profile text NOT NULL,request_hash text NOT NULL,
 scope text NOT NULL,payload text NOT NULL,status text NOT NULL CHECK(status IN ('received','processing','draft','failed')),
 created text NOT NULL,updated text NOT NULL,lease text,result text,error text,
 PRIMARY KEY(tenant,project,connection,id),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE INDEX bridge_job_usage ON business360.bridge_jobs(tenant,project,connection,created);
ALTER TABLE business360.bridge_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE business360.bridge_jobs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON business360.bridge_jobs TO business360_runtime;
CREATE POLICY source_principal_only ON business360.bridge_jobs FOR ALL TO business360_runtime
 USING(tenant=current_setting('b360.tenant',true) AND creator=current_setting('b360.user',true)
  AND business360.role_for(tenant,project) IN ('owner','analyst','reviewer','finance'))
 WITH CHECK(tenant=current_setting('b360.tenant',true) AND creator=current_setting('b360.user',true)
  AND business360.role_for(tenant,project) IN ('owner','analyst','reviewer','finance'));
COMMIT;
