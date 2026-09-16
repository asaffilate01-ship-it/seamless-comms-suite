-- Execute as migration administrator. Application connections must use a separate
-- login with membership in business360_runtime, never postgres/service-role credentials.
CREATE SCHEMA IF NOT EXISTS business360;
REVOKE ALL ON SCHEMA business360 FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='business360_runtime') THEN
  CREATE ROLE business360_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA business360 TO business360_runtime;
CREATE TABLE IF NOT EXISTS business360.projects(tenant text NOT NULL,id text NOT NULL,name text NOT NULL,currency text NOT NULL,mode text NOT NULL DEFAULT 'approval',paused integer NOT NULL DEFAULT 0,data_version integer NOT NULL DEFAULT 0,created_by text NOT NULL DEFAULT current_setting('b360.user',true),PRIMARY KEY(tenant,id));
CREATE TABLE IF NOT EXISTS business360.members(tenant text NOT NULL,project text NOT NULL,"user" text NOT NULL,role text NOT NULL CHECK(role IN ('owner','reviewer','analyst','finance','viewer')),PRIMARY KEY(tenant,project,"user"),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE TABLE IF NOT EXISTS business360.objects(tenant text NOT NULL,project text NOT NULL,kind text NOT NULL,id text NOT NULL,revision integer NOT NULL,payload text NOT NULL,PRIMARY KEY(tenant,project,kind,id),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE TABLE IF NOT EXISTS business360.actions(tenant text NOT NULL,project text NOT NULL,id text NOT NULL,kind text NOT NULL,payload text NOT NULL,proposer text NOT NULL,reviewer text,status text NOT NULL,version integer NOT NULL,result text,created_order bigint GENERATED ALWAYS AS IDENTITY,PRIMARY KEY(tenant,project,id),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
CREATE TABLE IF NOT EXISTS business360.audit(seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,project text NOT NULL,created text NOT NULL,actor text NOT NULL,event text NOT NULL,payload text NOT NULL,previous text NOT NULL,digest text NOT NULL);
CREATE TABLE IF NOT EXISTS business360.nonces(id text PRIMARY KEY,expires bigint NOT NULL,tenant text NOT NULL DEFAULT current_setting('b360.tenant',true));
CREATE TABLE IF NOT EXISTS business360.plans(tenant text NOT NULL,project text NOT NULL,id text NOT NULL,scope_id text NOT NULL,version integer NOT NULL,created text NOT NULL,creator text NOT NULL,status text NOT NULL,reviewer text,review_ref text,payload text NOT NULL,created_order bigint GENERATED ALWAYS AS IDENTITY,PRIMARY KEY(tenant,project,id),FOREIGN KEY(tenant,project) REFERENCES business360.projects(tenant,id));
-- Definer only reads static membership fields and is not callable via public API.
CREATE OR REPLACE FUNCTION business360.role_for(t text,p text) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT role FROM business360.members WHERE tenant=t AND project=p AND "user"=current_setting('b360.user',true) AND t=current_setting('b360.tenant',true)
$$;
CREATE OR REPLACE FUNCTION business360.is_creator(t text,p text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM business360.projects WHERE tenant=t AND id=p AND created_by=current_setting('b360.user',true) AND t=current_setting('b360.tenant',true))
$$;
REVOKE ALL ON FUNCTION business360.role_for(text,text),business360.is_creator(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business360.role_for(text,text),business360.is_creator(text,text) TO business360_runtime;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['projects','members','objects','actions','audit','nonces','plans'] LOOP
  EXECUTE format('ALTER TABLE business360.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE business360.%I FORCE ROW LEVEL SECURITY',n);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA business360 TO business360_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA business360 TO business360_runtime;
-- There is deliberately no grant to anon or authenticated: browsers use the
-- verified host, whose narrow SQL adapter establishes a transaction-local actor.
CREATE POLICY project_read ON business360.projects FOR SELECT TO business360_runtime USING(tenant=current_setting('b360.tenant',true) AND (business360.role_for(tenant,id) IS NOT NULL OR created_by=current_setting('b360.user',true)));
CREATE POLICY project_create ON business360.projects FOR INSERT TO business360_runtime WITH CHECK(tenant=current_setting('b360.tenant',true) AND created_by=current_setting('b360.user',true) AND current_setting('b360.tenant_role',true) IN ('owner','admin'));
CREATE POLICY project_update ON business360.projects FOR UPDATE TO business360_runtime USING(business360.role_for(tenant,id) IN ('owner','analyst','reviewer','finance')) WITH CHECK(tenant=current_setting('b360.tenant',true));
CREATE POLICY members_read ON business360.members FOR SELECT TO business360_runtime USING(tenant=current_setting('b360.tenant',true) AND business360.role_for(tenant,project) IS NOT NULL);
CREATE POLICY members_create ON business360.members FOR INSERT TO business360_runtime WITH CHECK(tenant=current_setting('b360.tenant',true) AND (business360.role_for(tenant,project)='owner' OR ("user"=current_setting('b360.user',true) AND role='owner' AND business360.is_creator(tenant,project))));
CREATE POLICY members_update ON business360.members FOR UPDATE TO business360_runtime USING(business360.role_for(tenant,project)='owner' AND role!='owner') WITH CHECK(tenant=current_setting('b360.tenant',true) AND role!='owner');
CREATE POLICY members_delete ON business360.members FOR DELETE TO business360_runtime USING(business360.role_for(tenant,project)='owner' AND role!='owner');
CREATE POLICY objects_read ON business360.objects FOR SELECT TO business360_runtime USING(tenant=current_setting('b360.tenant',true) AND business360.role_for(tenant,project) IS NOT NULL AND (kind!='person_private' OR business360.role_for(tenant,project) IN ('owner','finance')));
CREATE POLICY objects_create ON business360.objects FOR INSERT TO business360_runtime WITH CHECK(tenant=current_setting('b360.tenant',true) AND CASE WHEN kind IN ('person_private','ledger','business_financials','receivable') THEN business360.role_for(tenant,project) IN ('owner','finance') ELSE business360.role_for(tenant,project) IN ('owner','analyst','reviewer','finance') END);
CREATE POLICY objects_update ON business360.objects FOR UPDATE TO business360_runtime USING(tenant=current_setting('b360.tenant',true) AND CASE WHEN kind IN ('person_private','ledger','business_financials','receivable') THEN business360.role_for(tenant,project) IN ('owner','finance') ELSE business360.role_for(tenant,project) IN ('owner','analyst','reviewer','finance') END) WITH CHECK(tenant=current_setting('b360.tenant',true) AND CASE WHEN kind IN ('person_private','ledger','business_financials','receivable') THEN business360.role_for(tenant,project) IN ('owner','finance') ELSE business360.role_for(tenant,project) IN ('owner','analyst','reviewer','finance') END);
CREATE POLICY audit_read ON business360.audit FOR SELECT TO business360_runtime USING(tenant=current_setting('b360.tenant',true) AND business360.role_for(tenant,project) IS NOT NULL);
CREATE POLICY audit_insert ON business360.audit FOR INSERT TO business360_runtime WITH CHECK(tenant=current_setting('b360.tenant',true) AND actor=current_setting('b360.user',true) AND business360.role_for(tenant,project) IS NOT NULL);
CREATE POLICY nonce_access ON business360.nonces FOR ALL TO business360_runtime USING(tenant=current_setting('b360.tenant',true)) WITH CHECK(tenant=current_setting('b360.tenant',true));
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['actions','plans'] LOOP
  EXECUTE format('CREATE POLICY read_records ON business360.%I FOR SELECT TO business360_runtime USING (tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IS NOT NULL)',n);
  EXECUTE format('CREATE POLICY write_records ON business360.%I FOR INSERT TO business360_runtime WITH CHECK (tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IN (''owner'',''analyst'',''reviewer''))',n);
  EXECUTE format('CREATE POLICY update_records ON business360.%I FOR UPDATE TO business360_runtime USING (tenant=current_setting(''b360.tenant'',true) AND business360.role_for(tenant,project) IN (''owner'',''analyst'',''reviewer'')) WITH CHECK (tenant=current_setting(''b360.tenant'',true))',n);
 END LOOP;
END $$;
-- Provision a dedicated LOGIN separately using a secret manager, then:
-- GRANT business360_runtime TO <application_login>;
