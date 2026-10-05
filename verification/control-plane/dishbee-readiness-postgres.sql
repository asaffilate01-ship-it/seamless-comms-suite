-- Run after dishbee-binding-postgres.sql in the disposable CI database.
-- These are schema-interface and JWT-context fixtures, not deployed Supabase acceptance.
ALTER TABLE public.tenants ADD COLUMN name text DEFAULT 'Test business', ADD COLUMN slug text DEFAULT 'test', ADD COLUMN country_code text DEFAULT 'GB';
ALTER TABLE public.provisioning_jobs ADD COLUMN last_error text, ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TABLE public.tenant_products(tenant_id uuid,product_key text,status text,external_tenant_id text,base_url text,plan_key text,config jsonb DEFAULT '{}',PRIMARY KEY(tenant_id,product_key));
CREATE TABLE public.tenant_services(tenant_id uuid,service_key text,status text,PRIMARY KEY(tenant_id,service_key));
CREATE TABLE public.integration_provider_catalogue(provider_key text PRIMARY KEY,display_name text,provider_family text,status text,integration_mode text,countries text[]);
CREATE TABLE public.test_memberships(tenant_id uuid,user_id uuid);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION public.is_platform_admin(_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT _user='00000000-0000-4000-8000-000000000901'::uuid;
$$;
CREATE FUNCTION public.is_tenant_member(_tenant uuid,_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN _user IS NULL THEN NULL ELSE EXISTS(SELECT 1 FROM public.test_memberships WHERE tenant_id=_tenant AND user_id=_user) END;
$$;
INSERT INTO public.test_memberships VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000902');
-- Return the binding fixture to its accepted one-location state. Trading remains draft.
DELETE FROM public.tenant_locations WHERE id='00000000-0000-4000-8000-000000000103';
UPDATE public.provisioning_jobs SET status='succeeded' WHERE tenant_id='00000000-0000-4000-8000-000000000001';
INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES('00000000-0000-4000-8000-000000000001','dishbee','active');
INSERT INTO public.tenant_services VALUES('00000000-0000-4000-8000-000000000001','dishbee.one','active');
\ir ../../supabase/migrations/20261005084000_dishbee_family_readiness.sql
\ir ../../supabase/migrations/20261005123000_dishbee_readiness_evidence.sql
CREATE FUNCTION public.test_readiness() RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.platform_dishbee_family_readiness('00000000-0000-4000-8000-000000000001');
$$;
CREATE FUNCTION public.check_blocker(code text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r jsonb:=public.test_readiness();
BEGIN
 PERFORM public.check_test(r->'factoryReady'='false'::jsonb AND r->'blockers' ? code,label);
END $$;
SELECT public.check_test(NOT has_function_privilege('anon','public.platform_dishbee_family_readiness(uuid)','EXECUTE'),'anonymous role cannot call readiness RPC');
SELECT public.check_test(NOT has_table_privilege('authenticated','public.dishbee_factory_binding_attempts','SELECT'),'authenticated role cannot read credential attempt ledger');
SELECT set_config('request.jwt.claims','{}',false);
SELECT public.expect_error('SELECT public.test_readiness()','NULL auth helpers fail closed');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000903"}',false);
SET ROLE authenticated;
SELECT public.expect_error('SELECT public.test_readiness()','foreign authenticated user cannot read tenant readiness');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000902"}',false);
SELECT public.check_test(public.test_readiness()->'factoryReady'='true'::jsonb,'own-tenant member can read the accepted binding');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000901"}',false);
DO $$
DECLARE
 t uuid:='00000000-0000-4000-8000-000000000001';
 c uuid:='00000000-0000-4000-8000-000000000010';
 l uuid:='00000000-0000-4000-8000-000000000101';
 r jsonb; original_scopes jsonb; status_value text;
BEGIN
 r:=public.test_readiness();
 PERFORM public.check_test(r->'factoryReady'='true'::jsonb,'current receipt, credentials and exact active mapping are Factory-ready');
 PERFORM public.check_test(r->'productionAccepted'='false'::jsonb AND r->'tenant'->>'status'='draft','Factory readiness never activates live trading');
 PERFORM public.check_test(r->'connections'->'dishbee'->>'bindingStage'='bound_awaiting_acceptance','binding is explicitly awaiting operational acceptance');
 PERFORM public.check_test(r->'modules'->'one'->>'one'='active' AND r->'modules'->'hive'->>'core'='not_requested','existing module report shape is preserved');
 PERFORM public.check_test(position(repeat('a',64) in r::text)=0 AND position('oqsvc_' in r::text)=0,'readiness does not expose binding hashes or runtime credential identifiers');

 UPDATE public.product_location_links SET status='configured' WHERE product_connection_id=c;
 PERFORM public.check_blocker('dishbee_location_mapping_incomplete','configured mapping is not verified');
 UPDATE public.product_location_links SET status='verified' WHERE product_connection_id=c;
 UPDATE public.product_location_links SET product_key='haccora' WHERE product_connection_id=c;
 PERFORM public.check_blocker('dishbee_location_mapping_incomplete','another product mapping cannot satisfy Dishbee');
 UPDATE public.product_location_links SET product_key='dishbee',tenant_id='00000000-0000-4000-8000-000000000002' WHERE product_connection_id=c;
 PERFORM public.check_blocker('dishbee_location_mapping_incomplete','foreign-tenant mapping cannot satisfy Dishbee');
 UPDATE public.product_location_links SET tenant_id=t WHERE product_connection_id=c;

 INSERT INTO public.tenant_locations VALUES('00000000-0000-4000-8000-000000000103',t,'active'),('00000000-0000-4000-8000-000000000104',t,'inactive');
 INSERT INTO public.product_location_links(tenant_id,product_connection_id,product_key,tenant_location_id,external_location_id,status)
 VALUES(t,c,'dishbee','00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000204','verified');
 PERFORM public.check_blocker('dishbee_location_mapping_incomplete','inactive extra mapping cannot hide an unmapped active location');
 PERFORM public.check_test(public.test_readiness()->'locations'->>'dishbeeMapped'='1','only verified active identities contribute to the count');
 INSERT INTO public.product_location_links(tenant_id,product_connection_id,product_key,tenant_location_id,external_location_id,status)
 VALUES(t,c,'dishbee','00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000203','verified');
 PERFORM public.check_blocker('dishbee_binding_locations_changed','new verified location still requires a matching binding receipt');
 DELETE FROM public.product_location_links WHERE tenant_location_id IN('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000104');
 DELETE FROM public.tenant_locations WHERE id IN('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000104');
 UPDATE public.product_location_links SET external_location_id='00000000-0000-4000-8000-000000000299' WHERE product_connection_id=c;
 PERFORM public.check_blocker('dishbee_binding_locations_changed','same mapping count with a changed external identity is not accepted');
 UPDATE public.product_location_links SET external_location_id='00000000-0000-4000-8000-000000000201' WHERE product_connection_id=c;

 SELECT scopes INTO original_scopes FROM public.platform_service_credentials;
 UPDATE public.platform_service_credentials SET scopes=jsonb_set(scopes,'{0,capabilities}',scopes->0->'capabilities'||'["*"]'::jsonb);
 PERFORM public.check_blocker('dishbee_runtime_credential_or_scope_invalid','over-broad runtime capability is rejected');
 UPDATE public.platform_service_credentials SET scopes=jsonb_set(original_scopes,'{0,tenantId}','"00000000-0000-4000-8000-000000000002"'::jsonb);
 PERFORM public.check_blocker('dishbee_runtime_credential_or_scope_invalid','foreign runtime tenant scope is rejected');
 UPDATE public.platform_service_credentials SET scopes=original_scopes,expires_at=now()-interval '1 second';
 PERFORM public.check_blocker('dishbee_runtime_credential_or_scope_invalid','expired runtime credential is rejected');
 UPDATE public.platform_service_credentials SET expires_at=now()+interval '365 days',status='revoked';
 PERFORM public.check_blocker('dishbee_runtime_credential_or_scope_invalid','revoked runtime credential is rejected');
 UPDATE public.platform_service_credentials SET status='active';
 UPDATE public.product_connections SET credential_expires_at=now()-interval '1 second' WHERE id=c;
 PERFORM public.check_blocker('dishbee_control_plane_credential_invalid','expired control-plane credential is rejected');
 UPDATE public.product_connections SET credential_expires_at=now()+interval '365 days',credential_hash=repeat('f',64) WHERE id=c;
 PERFORM public.check_blocker('dishbee_control_plane_credential_invalid','changed control-plane hash is rejected');
 UPDATE public.product_connections SET credential_hash=repeat('a',64) WHERE id=c;
 UPDATE public.dishbee_factory_binding_attempts SET state='prepared' WHERE connection_id=c;
 PERFORM public.check_blocker('dishbee_binding_receipt_required','prepared attempt is not an accepted binding');
 UPDATE public.dishbee_factory_binding_attempts SET state='accepted',receipt=jsonb_set(receipt,'{productionAccepted}','true'::jsonb) WHERE connection_id=c;
 PERFORM public.check_blocker('dishbee_binding_receipt_required','a forged live-acceptance flag cannot bypass the binding boundary');
 UPDATE public.dishbee_factory_binding_attempts SET receipt=jsonb_set(receipt,'{productionAccepted}','false'::jsonb) WHERE connection_id=c;
 UPDATE public.product_connections SET status='configured' WHERE id=c;
 PERFORM public.check_blocker('dishbee_workspace_not_connected','configured connector cannot be Factory-ready');
 UPDATE public.product_connections SET status='connected' WHERE id=c;

 INSERT INTO public.product_connections(id,tenant_id,product_key,external_tenant_id,status)
 VALUES('00000000-0000-4000-8000-000000000041',t,'dishbee','00000000-0000-4000-8000-000000000401','configured');
 PERFORM public.check_blocker('dishbee_workspace_selection_ambiguous','multiple live candidate workspaces require explicit reconciliation');
 DELETE FROM public.product_connections WHERE id='00000000-0000-4000-8000-000000000041';
 UPDATE public.tenant_locations SET status='inactive' WHERE id=l;
 PERFORM public.check_blocker('active_tenant_location_required','zero active locations never reports ready');
 UPDATE public.tenant_locations SET status='active' WHERE id=l;
 UPDATE public.tenant_products SET status='cancelled' WHERE tenant_id=t;
 UPDATE public.tenant_services SET status='cancelled' WHERE tenant_id=t;
 PERFORM public.check_blocker('dishbee_family_not_requested','an empty product selection never reports ready');
 UPDATE public.tenant_products SET status='active' WHERE tenant_id=t;
 UPDATE public.tenant_services SET status='active' WHERE tenant_id=t;
 FOR status_value IN SELECT unnest(ARRAY['queued','running','blocked','failed']) LOOP
  UPDATE public.provisioning_jobs SET status=status_value WHERE tenant_id=t;
  PERFORM public.check_blocker(CASE WHEN status_value IN('queued','running') THEN 'provisioning_jobs_pending' ELSE 'provisioning_jobs_'||status_value END,'unfinished job blocks readiness: '||status_value);
 END LOOP;
 UPDATE public.provisioning_jobs SET status='succeeded' WHERE tenant_id=t;

 INSERT INTO public.tenant_services VALUES(t,'haccora.core','requested');
 PERFORM public.check_blocker('haccora_workspace_not_connected','requested Haccora requires its own connection');
 DELETE FROM public.tenant_services WHERE tenant_id=t AND service_key='haccora.core';
 INSERT INTO public.tenant_products(tenant_id,product_key,status) VALUES(t,'dishbee-plus','requested');
 PERFORM public.check_blocker('dishbee_plus_workspace_not_connected','requested Plus requires its own connection');
 INSERT INTO public.product_connections(id,tenant_id,product_key,external_tenant_id,status)
 VALUES('00000000-0000-4000-8000-000000000042',t,'dishbee-plus','plus-workspace','connected');
 INSERT INTO public.product_location_links(tenant_id,product_connection_id,product_key,tenant_location_id,external_location_id,status)
 VALUES(t,'00000000-0000-4000-8000-000000000042','dishbee-plus',l,'plus-location','configured');
 PERFORM public.check_blocker('dishbee_plus_location_mapping_incomplete','Plus configured mappings are blocking, not just warnings');
 UPDATE public.product_location_links SET status='verified' WHERE product_connection_id='00000000-0000-4000-8000-000000000042';
 PERFORM public.check_test(public.test_readiness()->'factoryReady'='true'::jsonb,'optional products with verified active maps do not block the accepted Dishbee binding');
 PERFORM public.check_test(public.test_readiness()->'productionAccepted'='false'::jsonb,'connector registration still does not approve payments or live providers');
 PERFORM public.check_test((SELECT status='draft' FROM public.tenants WHERE id=t),'all readiness calls leave the business draft');
END $$;
