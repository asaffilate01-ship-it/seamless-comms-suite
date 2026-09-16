-- AI hub tables extend the same forced tenant/project RLS boundary.
BEGIN;
CREATE TABLE business360.ai_settings(tenant text NOT NULL,project text NOT NULL,revision integer NOT NULL,payload text NOT NULL,
 PRIMARY KEY(tenant,project),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE TABLE business360.ai_runs(tenant text NOT NULL,project text NOT NULL,id text NOT NULL,creator text NOT NULL,
 profile text NOT NULL,goal text NOT NULL,version integer NOT NULL,policy_revision integer NOT NULL,config_digest text NOT NULL,
 status text NOT NULL,step integer NOT NULL,lease text,created text NOT NULL,updated text NOT NULL,payload text NOT NULL,
 PRIMARY KEY(tenant,project,id),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE TABLE business360.ai_usage(tenant text NOT NULL,project text NOT NULL,day text NOT NULL,
 model_calls integer NOT NULL DEFAULT 0,connector_calls integer NOT NULL DEFAULT 0,input_tokens integer NOT NULL DEFAULT 0,
 output_tokens integer NOT NULL DEFAULT 0,PRIMARY KEY(tenant,project,day),
 FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE TABLE business360.connector_snapshots(tenant text NOT NULL,project text NOT NULL,id text NOT NULL,
 connection text NOT NULL,created text NOT NULL,payload text NOT NULL,PRIMARY KEY(tenant,project,id),
 FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));

CREATE OR REPLACE FUNCTION business360.tenant_model_calls(day_key text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(SUM(model_calls),0)::bigint FROM business360.ai_usage
 WHERE tenant=current_setting('b360.tenant',true) AND day=day_key
$$;
REVOKE ALL ON FUNCTION business360.tenant_model_calls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business360.tenant_model_calls(text) TO business360_runtime;
-- The trusted adapter serialises transactions per tenant. This aggregate includes
-- hidden projects without exposing their rows or accepting another tenant ID.
DO $$ DECLARE n text; roles text; BEGIN
 FOREACH n IN ARRAY ARRAY['ai_settings','ai_runs','ai_usage','connector_snapshots'] LOOP
  EXECUTE format('ALTER TABLE business360.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE business360.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON business360.%I TO business360_runtime',n);
  EXECUTE format('CREATE POLICY ai_read ON business360.%I FOR SELECT TO business360_runtime USING(tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IS NOT NULL)',n);
  roles := CASE WHEN n='ai_settings' THEN '''owner''' ELSE '''owner'',''analyst'',''reviewer'',''finance''' END;
  EXECUTE format('CREATE POLICY ai_insert ON business360.%I FOR INSERT TO business360_runtime WITH CHECK(tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IN (%s))',n,roles);
  EXECUTE format('CREATE POLICY ai_update ON business360.%I FOR UPDATE TO business360_runtime USING(tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IN (%s)) WITH CHECK(tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IN (%s))',n,roles,roles);
 END LOOP;
END $$;
COMMIT;
