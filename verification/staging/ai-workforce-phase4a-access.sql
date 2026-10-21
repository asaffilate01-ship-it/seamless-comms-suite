-- Execute ONLY against a disposable, fully migrated local Supabase database.
-- This whole test rolls back its test users, tenants, employees, tasks and logs.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users
 (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
VALUES
 ('11111111-aaaa-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','ai-workforce-owner-a@test.invalid','-',now(),now(),now()),
 ('11111111-aaaa-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','ai-workforce-reviewer-a@test.invalid','-',now(),now(),now()),
 ('22222222-bbbb-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','ai-workforce-owner-b@test.invalid','-',now(),now(),now()),
 ('11111111-aaaa-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','ai-workforce-viewer-a@test.invalid','-',now(),now(),now());

INSERT INTO public.organisations(id,name,slug)
VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','Workforce test organisation A','workforce-test-org-a'),
 ('bbbbbbbb-2222-4222-8222-222222222222','Workforce test organisation B','workforce-test-org-b');

INSERT INTO public.tenants(id,name,slug,organisation_id)
VALUES
 ('aaaaaaaa-3333-4333-8333-333333333333','Workforce staging tenant A','workforce-test-tenant-a','aaaaaaaa-1111-4111-8111-111111111111'),
 ('bbbbbbbb-4444-4444-8444-444444444444','Workforce staging tenant B','workforce-test-tenant-b','bbbbbbbb-2222-4222-8222-222222222222');

INSERT INTO public.tenant_members(tenant_id,user_id,role)
VALUES
 ('aaaaaaaa-3333-4333-8333-333333333333','11111111-aaaa-4000-8000-000000000001','owner'),
 ('aaaaaaaa-3333-4333-8333-333333333333','11111111-aaaa-4000-8000-000000000002','admin'),
 ('aaaaaaaa-3333-4333-8333-333333333333','11111111-aaaa-4000-8000-000000000003','viewer'),
 ('bbbbbbbb-4444-4444-8444-444444444444','22222222-bbbb-4000-8000-000000000001','owner');

INSERT INTO public.tenant_products(tenant_id,product_key,status)
VALUES
 ('aaaaaaaa-3333-4333-8333-333333333333','omniqora','active'),
 ('bbbbbbbb-4444-4444-8444-444444444444','omniqora','active');

INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
VALUES
 ('aaaaaaaa-3333-4333-8333-333333333333','omniqora.ai-workforce','active','manual'),
 ('bbbbbbbb-4444-4444-8444-444444444444','omniqora.ai-workforce','active','manual');

INSERT INTO public.ai_employees
(id,tenant_id,product_key,blueprint_key,display_name,role_title,status,revision,
 profile,created_by,last_edited_by)
VALUES
 ('aaaaaaaa-5555-4555-8555-555555555555','aaaaaaaa-3333-4333-8333-333333333333',
  'omniqora','shared.daily-brief','Test brief author A','Business analyst',
  'approved_configuration',1,
  '{"goal":"Produce a daily evidence report","tasks":["Summarise the portfolio"],"capabilities":["analytics.read"],"trigger":{"type":"manual","value":"","enabled":false}}',
  '11111111-aaaa-4000-8000-000000000001','11111111-aaaa-4000-8000-000000000001'),
 ('bbbbbbbb-6666-4666-8666-666666666666','bbbbbbbb-4444-4444-8444-444444444444',
  'omniqora','shared.daily-brief','Test brief author B','Business analyst',
  'approved_configuration',1,
  '{"goal":"Produce a daily evidence report","tasks":["Summarise the portfolio"],"capabilities":["analytics.read"],"trigger":{"type":"manual","value":"","enabled":false}}',
  '22222222-bbbb-4000-8000-000000000001','22222222-bbbb-4000-8000-000000000001');

INSERT INTO public.ai_employee_tasks
(id,tenant_id,product_key,employee_id,request_key,title,objective,
 output_spec,acceptance_criteria,employee_revision,status,created_by,last_edited_by)
VALUES
 ('aaaaaaaa-7777-4777-8777-777777777777','aaaaaaaa-3333-4333-8333-333333333333',
  'omniqora','aaaaaaaa-5555-4555-8555-555555555555',
  'aaaaaaaa-8888-4888-8888-888888888888','Review daily evidence',
  'Check order anomalies and prepare a report','Evidence report',
  'Record evidence gaps and route for human approval',1,'pending_review',
  '11111111-aaaa-4000-8000-000000000001','11111111-aaaa-4000-8000-000000000001'),
 ('bbbbbbbb-7777-4777-8777-777777777777','bbbbbbbb-4444-4444-8444-444444444444',
  'omniqora','bbbbbbbb-6666-4666-8666-666666666666',
  'bbbbbbbb-8888-4888-8888-888888888888','Review seller performance',
  'Identify dealer inventory anomalies','Evidence report',
  'Record uncertainty and route for human approval',1,'draft',
  '22222222-bbbb-4000-8000-000000000001','22222222-bbbb-4000-8000-000000000001');

-- Validate actual grants/forced RLS in PostgreSQL, not merely source patterns.
DO $check$
DECLARE tab text; enabled boolean; forced boolean;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_employees','ai_employee_revisions','ai_employee_previews',
 'ai_employee_audit_events','ai_employee_tasks','ai_employee_task_events',
 'ai_employee_access_proposals'] LOOP
  SELECT c.relrowsecurity,c.relforcerowsecurity INTO enabled,forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=tab;
  IF NOT COALESCE(enabled,false) OR NOT COALESCE(forced,false) THEN
   RAISE EXCEPTION 'Missing forced RLS for %',tab;
  END IF;
  IF has_table_privilege('authenticated',format('public.%I',tab),'INSERT') OR
     has_table_privilege('authenticated',format('public.%I',tab),'UPDATE') OR
     has_table_privilege('authenticated',format('public.%I',tab),'DELETE') THEN
   RAISE EXCEPTION 'Unauthorized table write grant for %',tab;
  END IF;
 END LOOP;
END $check$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);

DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_employee_tasks;
 IF n<>1 THEN RAISE EXCEPTION 'Tenant A owner saw % task rows, expected 1',n; END IF;
 BEGIN
  PERFORM public.transition_ai_employee_task(
    'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
    'aaaaaaaa-5555-4555-8555-555555555555',
    'aaaaaaaa-7777-4777-8777-777777777777','approve',NULL);
  RAISE EXCEPTION 'Self-approval was incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Independent task review%' THEN RAISE; END IF;
 END;
END $check$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000002',true);
SELECT public.transition_ai_employee_task(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'aaaaaaaa-5555-4555-8555-555555555555',
 'aaaaaaaa-7777-4777-8777-777777777777','approve','Reviewed evidence; no execution');

SELECT set_config('request.jwt.claim.sub','22222222-bbbb-4000-8000-000000000001',true);
DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_employee_tasks;
 IF n<>1 THEN RAISE EXCEPTION 'Tenant B owner saw % task rows, expected 1',n; END IF;
 BEGIN
  PERFORM public.preflight_ai_employee_task(
    'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
    'aaaaaaaa-5555-4555-8555-555555555555',
    'aaaaaaaa-7777-4777-8777-777777777777');
  RAISE EXCEPTION 'Cross-tenant preflight was incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI Workforce tenant administrator required%' THEN RAISE; END IF;
 END;
END $check$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000003',true);
DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_employee_tasks;
 IF n<>0 THEN RAISE EXCEPTION 'Viewer saw privileged AI Workforce tasks'; END IF;
 BEGIN
  PERFORM public.preflight_ai_employee_task(
    'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
    'aaaaaaaa-5555-4555-8555-555555555555',
    'aaaaaaaa-7777-4777-8777-777777777777');
  RAISE EXCEPTION 'Viewer preflight was incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI Workforce tenant administrator required%' THEN RAISE; END IF;
 END;
END $check$;

RESET ROLE;
DO $check$
DECLARE n integer;
BEGIN
 -- Existing canonical non-employee agent jobs must remain usable.
 INSERT INTO public.ai_agent_runs(tenant_id,product_key,profile,goal,ai_employee_id)
 VALUES ('aaaaaaaa-3333-4333-8333-333333333333','omniqora',
         'operations','General AI task not linked to an AI employee',NULL);
 BEGIN
  INSERT INTO public.ai_agent_runs(tenant_id,product_key,profile,goal,ai_employee_id)
  VALUES ('aaaaaaaa-3333-4333-8333-333333333333','omniqora',
         'operations','Forged AI employee attribution',
         'aaaaaaaa-5555-4555-8555-555555555555');
  RAISE EXCEPTION 'Employee attribution was incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI employee run linkage disabled%' THEN RAISE; END IF;
 END;
END $check$;

\ir ai-workforce-phase4b-access.sql

ROLLBACK;
\echo 'AI Workforce real PostgreSQL RLS/role/attribution checks passed (all fixtures rolled back).'
