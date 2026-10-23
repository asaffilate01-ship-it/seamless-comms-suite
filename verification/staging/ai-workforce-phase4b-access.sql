-- Included by the Phase 4A disposable Supabase test inside the same transaction.
-- No BEGIN/COMMIT; parent test rolls everything back.
DO $check$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_workforce_sandbox_pilots','ai_workforce_sandbox_admissions'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=tab AND c.relrowsecurity
      AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Forced sandbox table RLS missing: %',tab;
  END IF;
  IF has_table_privilege('authenticated',format('public.%I',tab),'INSERT') OR
     has_table_privilege('authenticated',format('public.%I',tab),'UPDATE') OR
     has_table_privilege('authenticated',format('public.%I',tab),'DELETE') THEN
    RAISE EXCEPTION 'Browser write grant found for sandbox table: %',tab;
  END IF;
 END LOOP;
END $check$;

-- Both real tenant fixtures already exist from the parent test. Add only
-- independent employee/use-case sign-off, since the parent tests task approval.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE public.ai_employees
 SET reviewed_by='11111111-aaaa-4000-8000-000000000002',reviewed_at=now()
 WHERE id='aaaaaaaa-5555-4555-8555-555555555555';
INSERT INTO public.ai_use_cases
 (tenant_id,product_key,use_case_key,name,owner_user_id,purpose,status,approved_by,approved_at,risk_level,provider_route)
VALUES
 ('aaaaaaaa-3333-4333-8333-333333333333','omniqora','shared.daily-brief',
  'Staging synthetic daily brief','11111111-aaaa-4000-8000-000000000001',
  'Non-customer fixture only','approved',
  '11111111-aaaa-4000-8000-000000000002',now(),'low',
  '{"factoryBlueprint":"shared.daily-brief"}'::jsonb);

-- Operator can only enable a bounded, expiring staging pilot.
SELECT public.configure_ai_workforce_sandbox_pilot(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',true,now()+interval '1 hour',
 2,ARRAY['fixture.crm.pipeline','fixture.dishbee.orders']::text[],
 'staging operator approved synthetic fixture trial');
DO $check$ BEGIN
 BEGIN
  PERFORM public.configure_ai_workforce_sandbox_pilot(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',true,now()+interval '8 days',
   1,ARRAY['fixture.crm.pipeline']::text[],'staging should reject long expiry');
  RAISE EXCEPTION 'Overlong sandbox pilot was incorrectly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Invalid bounded sandbox%' THEN RAISE; END IF;
 END;
END $check$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000003',true);
DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_sandbox_pilots;
 IF n<>0 THEN RAISE EXCEPTION 'Viewer saw private sandbox policies'; END IF;
 BEGIN
  PERFORM public.queue_ai_workforce_fixture_rehearsal(
    'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
    'aaaaaaaa-5555-4555-8555-555555555555',
    'aaaaaaaa-7777-4777-8777-777777777777',
    'fixture.crm.pipeline','f0f0f0f0-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Viewer queued sandbox job';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI Workforce tenant administrator required%' THEN RAISE; END IF;
 END;
END $check$;
SELECT set_config('request.jwt.claim.sub','22222222-bbbb-4000-8000-000000000001',true);
DO $check$ BEGIN
 BEGIN
  PERFORM public.queue_ai_workforce_fixture_rehearsal(
    'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
    'aaaaaaaa-5555-4555-8555-555555555555',
    'aaaaaaaa-7777-4777-8777-777777777777',
    'fixture.crm.pipeline','f0f0f0f0-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Foreign tenant owner admitted sandbox job';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI Workforce tenant administrator required%' THEN RAISE; END IF;
 END;
END $check$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
SELECT public.queue_ai_workforce_fixture_rehearsal(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'aaaaaaaa-5555-4555-8555-555555555555',
 'aaaaaaaa-7777-4777-8777-777777777777',
 'fixture.crm.pipeline','f0f0f0f0-1111-4111-8111-111111111111');

DO $check$
DECLARE n integer; body jsonb;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_sandbox_admissions;
 IF n<>1 THEN RAISE EXCEPTION 'Expected exactly one scoped fixture admission'; END IF;
 SELECT public.queue_ai_workforce_fixture_rehearsal(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  'aaaaaaaa-5555-4555-8555-555555555555',
  'aaaaaaaa-7777-4777-8777-777777777777',
  'fixture.crm.pipeline','f0f0f0f0-1111-4111-8111-111111111111') INTO body;
 IF body->>'alreadyExists'<>'true' THEN RAISE EXCEPTION 'Idempotent duplicate not recognised'; END IF;
 BEGIN
  PERFORM public.queue_ai_workforce_fixture_rehearsal(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
   'aaaaaaaa-5555-4555-8555-555555555555',
   'aaaaaaaa-7777-4777-8777-777777777777',
   'fixture.dishbee.orders','f0f0f0f0-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Changed idempotency payload was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Sandbox idempotency payload changed%' THEN RAISE; END IF;
 END;
END $check$;

-- The generic worker must not claim fixture jobs; the specialist worker can.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $check$
DECLARE n integer; receipt jsonb; claim jsonb; admission uuid;
BEGIN
 SELECT count(*) INTO n FROM public.claim_intelligence_jobs_for_scope(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',10,NULL,'normal_work');
 IF n<>0 THEN RAISE EXCEPTION 'Generic worker intercepted a synthetic fixture job'; END IF;
 SELECT count(*) INTO n FROM public.claim_intelligence_jobs_for_scope(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',10,ARRAY['ai-workforce.fixture']::text[],'normal_work');
 IF n<>0 THEN RAISE EXCEPTION 'Explicit generic fixture claim was allowed'; END IF;
 SELECT x INTO claim FROM public.claim_ai_workforce_fixture_rehearsals(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora','sandbox_worker_01',2) AS x LIMIT 1;
 IF claim IS NULL OR claim->>'fixtureKey'<>'fixture.crm.pipeline' THEN
  RAISE EXCEPTION 'Dedicated worker did not claim the expected fixture';
 END IF;
 admission:=(claim->>'admissionId')::uuid;
 -- Invalid receipt must be refused, preserving the processing job.
 BEGIN
  PERFORM public.finish_ai_workforce_fixture_rehearsal(
    'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
    admission,'sandbox_worker_01',true,
    '{"fixtureKey":"fixture.crm.pipeline","dataOrigin":"customer","modelCalls":5}'::jsonb,NULL);
  RAISE EXCEPTION 'Unsafe sandbox receipt accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Untrusted or executable sandbox receipt refused%' THEN RAISE; END IF;
 END;
 receipt:=jsonb_build_object('fixtureKey','fixture.crm.pipeline','dataOrigin','synthetic_fixture',
  'reviewRequired',true,'modelCalls',0,'toolCalls',0,'costMinor',0,
  'findings',jsonb_build_array(jsonb_build_object('observation','Test synthetic','value',60,'unit','percent')),
  'citations',jsonb_build_array(jsonb_build_object('ref','synthetic:fixture.crm.pipeline')));
 PERFORM public.finish_ai_workforce_fixture_rehearsal(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  admission,'sandbox_worker_01',true,receipt,NULL);
 SELECT count(*) INTO n FROM public.ai_workforce_sandbox_admissions a
 WHERE a.tenant_id='aaaaaaaa-3333-4333-8333-333333333333'
   AND a.status='completed' AND a.receipt_fingerprint IS NOT NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Successful sandbox receipt not recorded'; END IF;
END $check$;

-- No employee-tagged AI model run is created by a synthetic rehearsal.
DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_agent_runs
 WHERE ai_employee_id IS NOT NULL;
 IF n<>0 THEN RAISE EXCEPTION 'Sandbox caused unapproved model-run attribution'; END IF;
 SELECT count(*) INTO n FROM public.ai_budgeted_run_reservations
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333';
 IF n<>0 THEN RAISE EXCEPTION 'Sandbox created a paid model budget reservation'; END IF;
END $check$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',true);
\echo 'AI Workforce Phase 4B service-role RLS/claim/receipt tests passed; enclosing test will roll back.'
