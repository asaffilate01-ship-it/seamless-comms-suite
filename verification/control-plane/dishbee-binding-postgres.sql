-- Isolated interface fixture, not the full deployed Supabase migration chain.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
$$;
CREATE TABLE public.tenants(id uuid PRIMARY KEY,status text NOT NULL DEFAULT 'draft');
CREATE TABLE public.product_connections(id uuid PRIMARY KEY,tenant_id uuid REFERENCES public.tenants,product_key text,external_tenant_id text,
 base_url text,status text,credential_hash text,credential_suffix text,credential_expires_at timestamptz,last_verified_at timestamptz,
 updated_at timestamptz,metadata jsonb DEFAULT '{}',capabilities text[]);
CREATE TABLE public.provisioning_jobs(id uuid PRIMARY KEY,tenant_id uuid REFERENCES public.tenants,status text,target_kind text,action text,target_key text);
CREATE TABLE public.tenant_locations(id uuid PRIMARY KEY,tenant_id uuid REFERENCES public.tenants,status text);
CREATE TABLE public.product_location_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES public.tenants,
 product_connection_id uuid REFERENCES public.product_connections,product_key text,tenant_location_id uuid REFERENCES public.tenant_locations,
 external_location_id text,status text,metadata jsonb DEFAULT '{}',last_verified_at timestamptz,updated_at timestamptz,
 UNIQUE(product_connection_id,tenant_location_id),UNIQUE(product_connection_id,external_location_id));
CREATE TABLE public.platform_service_credentials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),key_id text UNIQUE,secret_hash text,secret_suffix text,
 status text,scopes jsonb,expires_at timestamptz);
\ir ../../supabase/migrations/20261005111500_dishbee_binding_attempts.sql
CREATE FUNCTION public.check_test(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.expect_error(sql_text text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN BEGIN EXECUTE sql_text; EXCEPTION WHEN OTHERS THEN caught:=true; END; PERFORM public.check_test(caught,label); END $$;
CREATE FUNCTION public.test_prepare(c uuid,j uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.server_prepare_dishbee_factory_binding(c,j,repeat('a',64),'aaaabbbb','oqsvc_'||repeat('c',18),repeat('b',64),'bbbbcccc');
$$;
INSERT INTO public.tenants(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO public.product_connections(id,tenant_id,product_key,external_tenant_id,base_url,status) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','dishbee','00000000-0000-4000-8000-000000000100','https://dishbee.example','configured'),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','dishbee','00000000-0000-4000-8000-000000000200','https://dishbee.example','configured'),
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000003','dishbee','00000000-0000-4000-8000-000000000300','https://dishbee.example','configured');
INSERT INTO public.provisioning_jobs VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','running','product','provision',NULL),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','running','product','provision',NULL),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000003','running','product','provision',NULL);
INSERT INTO public.tenant_locations VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','active'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000002','active');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.server_prepare_dishbee_factory_binding(uuid,uuid,text,text,text,text,text)','EXECUTE'),'authenticated cannot mint server credentials');
SELECT public.check_test(NOT has_table_privilege('authenticated','public.dishbee_factory_binding_attempts','SELECT'),'attempt ledger is not browser-readable');
SELECT public.check_test((SELECT relrowsecurity FROM pg_class WHERE oid='public.dishbee_factory_binding_attempts'::regclass),'attempt ledger has RLS enabled');
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',false);
SELECT public.expect_error($q$SELECT public.test_prepare('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011')$q$,'modern authenticated JWT denied');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
SELECT public.expect_error($q$SELECT public.test_prepare('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012')$q$,'cross-tenant job rejected');
SELECT public.expect_error($q$SELECT public.test_prepare('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000013')$q$,'zero active locations rejected');
SELECT public.expect_error($q$SELECT public.test_prepare('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011')$q$,'missing location links rejected');
SELECT public.check_test((SELECT count(*)=0 FROM public.platform_service_credentials),'validation failures create no credentials');
INSERT INTO public.product_location_links(tenant_id,product_connection_id,product_key,tenant_location_id,external_location_id,status)
 VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','dishbee','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','configured');
DO $$
DECLARE c uuid:='00000000-0000-4000-8000-000000000010'; j uuid:='00000000-0000-4000-8000-000000000011'; a jsonb; r jsonb; result jsonb; change jsonb;
BEGIN
 UPDATE public.provisioning_jobs SET target_kind='integration',action='verify',target_key='dishbee:00000000-0000-4000-8000-000000000999' WHERE id=j;
 PERFORM public.expect_error(format('SELECT public.test_prepare(%L,%L)',c,j),'integration job cannot select a different external workspace');
 UPDATE public.provisioning_jobs SET target_key='dishbee:00000000-0000-4000-8000-000000000100' WHERE id=j;
 a:=public.test_prepare(c,j);
 PERFORM public.check_test((SELECT count(*)=1 FROM public.platform_service_credentials),'one runtime credential reserved');
 PERFORM public.check_test((SELECT status='configured' AND last_verified_at IS NULL FROM public.product_connections WHERE id=c),'reservation does not claim connected or verified');
 PERFORM public.check_test((SELECT scopes->0->>'tenantId'='00000000-0000-4000-8000-000000000001' AND scopes->0->>'productKey'='dishbee'
  AND scopes->0->'locationIds'='["00000000-0000-4000-8000-000000000101"]'::jsonb
  AND scopes->0->'capabilities'='["orders.consume","orders.ack","events.write","usage.write","crm.write"]'::jsonb
  FROM public.platform_service_credentials),'runtime scope contains only the selected tenant, product, locations and five capabilities');
 PERFORM public.expect_error(format('SELECT public.test_prepare(%L,%L)',c,j),'duplicate reservation is blocked');
 PERFORM public.check_test((SELECT count(*)=1 FROM public.platform_service_credentials),'duplicate reservation cannot mint extra keys');
 r:=jsonb_build_object('tenantId',a->>'externalTenantId','omniqoraTenantId',a->>'tenantId','controlPlaneKeySuffix',a->>'controlPlaneKeySuffix',
  'runtimeKeyId',a->>'runtimeKeyId','locationMappings',a->'locationMappings','bindingComplete',true,'productionAccepted',false,'activeLocations',1,'mappedLocations',1);
 FOR change IN SELECT x FROM jsonb_array_elements('[{"tenantId":"wrong"},{"omniqoraTenantId":"wrong"},{"runtimeKeyId":"wrong"},{"controlPlaneKeySuffix":"wrong"},{"productionAccepted":true},{"bindingComplete":false},{"activeLocations":0},{"locationMappings":[]}]'::jsonb) x LOOP
  PERFORM public.expect_error(format('SELECT public.server_complete_dishbee_factory_binding(%L,%L::jsonb)',c,r||change),'mismatched receipt rejected: '||change::text);
 END LOOP;
 PERFORM public.check_test((SELECT status='configured' FROM public.product_connections WHERE id=c),'bad acknowledgements cannot connect the tenant');
 UPDATE public.platform_service_credentials SET expires_at=now()-interval '1 second';
 PERFORM public.expect_error(format('SELECT public.server_complete_dishbee_factory_binding(%L,%L::jsonb)',c,r),'expired runtime credential rejected');
 UPDATE public.platform_service_credentials SET expires_at=now()+interval '365 days';
 UPDATE public.product_location_links SET external_location_id='00000000-0000-4000-8000-000000000999' WHERE product_connection_id=c;
 PERFORM public.expect_error(format('SELECT public.server_complete_dishbee_factory_binding(%L,%L::jsonb)',c,r),'mapping edits during binding invalidate acknowledgement');
 UPDATE public.product_location_links SET external_location_id='00000000-0000-4000-8000-000000000201' WHERE product_connection_id=c;
 result:=public.server_complete_dishbee_factory_binding(c,r||'{"unexpected":"not-retained"}'::jsonb);
 PERFORM public.check_test(result->>'status'='connected','matching receipt connects Factory product');
 PERFORM public.check_test(result->'metadata'->'productionAccepted'='false'::jsonb,'Factory connection does not approve live trading');
 PERFORM public.check_test((SELECT state='accepted' AND NOT (receipt ? 'unexpected') FROM public.dishbee_factory_binding_attempts WHERE connection_id=c),'ledger stores sanitised acknowledgement');
 PERFORM public.server_complete_dishbee_factory_binding(c,r);
 PERFORM public.check_test((SELECT count(*)=1 FROM public.platform_service_credentials),'replayed acknowledgement reuses existing credentials');
 PERFORM public.check_test((SELECT status='draft' FROM public.tenants WHERE id='00000000-0000-4000-8000-000000000001'),'business stays draft');
 INSERT INTO public.tenant_locations VALUES('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','active');
 PERFORM public.expect_error(format('SELECT public.server_complete_dishbee_factory_binding(%L,%L::jsonb)',c,r),'a new unmapped active location invalidates old acknowledgement');
END $$;
