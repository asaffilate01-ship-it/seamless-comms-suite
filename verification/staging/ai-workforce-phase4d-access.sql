-- Executed inside the Phase 4A disposable Supabase transaction after 4B tests.
-- No real customer data, providers or external calls. Every record rolls back.
\set ON_ERROR_STOP on

-- Fixtures: 20 first-party CRM leads with deliberately sensitive fake titles.
-- The analysis must expose only totals and suppressed group counts.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);

INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
VALUES('aaaaaaaa-3333-4333-8333-333333333333','omniqora.intelligence-runtime','active','manual')
ON CONFLICT(tenant_id,service_key) DO UPDATE SET status='active';

INSERT INTO public.crm_leads(tenant_id,title,status,source_product_key)
SELECT 'aaaaaaaa-3333-4333-8333-333333333333',
 'PRIVATE TEST NAME AND CONTACT '||i,
 CASE WHEN i<=10 THEN 'qualified'
      WHEN i<=16 THEN 'converted'
      ELSE 'working' END,
 'omniqora'
FROM generate_series(1,20) i;

INSERT INTO public.provider_catalogue(provider_key,name,provider_kind,status,implementation_status)
VALUES('openai','OpenAI staging model test provider','ai','active','built_main')
ON CONFLICT(provider_key) DO NOTHING;

INSERT INTO public.provider_bindings
 (tenant_id,product_key,provider_key,environment,status,last_verified_at)
VALUES('aaaaaaaa-3333-4333-8333-333333333333','omniqora','openai',
 'production','active',now());

-- These are ephemeral local TEST prices, not real provider tariff approvals.
INSERT INTO public.ai_reviewed_model_rates(
 provider_key,model_key,rate_version,currency,input_minor_per_million,
 cached_input_minor_per_million,output_minor_per_million,minimum_risk_grade,
 supported_regions,evaluation_passed,evidence_url,verified_at,status)
VALUES('openai','gpt-4.1-mini','fixture-rate-4d','GBP',200,200,800,
 'standard',ARRAY['GB'],true,'https://platform.openai.com/docs/pricing',now(),'approved');

INSERT INTO public.ai_spend_budgets(
 tenant_id,product_key,period_month,currency,limit_minor,reserved_minor,spent_minor)
VALUES('aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 date_trunc('month',now() AT TIME ZONE 'UTC')::date,'GBP',500,0,0);

SELECT public.configure_ai_workforce_readonly_pilot(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',true,
 now()+interval '30 minutes',2,50,
 'Disposable local operator evidence for human-supervised CRM read-only pilot');

SELECT public.configure_ai_workforce_worker_allowlist(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'readonly_worker_01','gpt-4.1-mini',true,
 now()+interval '20 minutes',2,
 'Staging operator independently authorised one bounded CRM worker',
 'https://example.test/workforce/staging-attestation');


DO $audit$
BEGIN
 BEGIN
  PERFORM public.configure_ai_workforce_readonly_pilot(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',true,
   now()+interval '2 days',2,50,'Reject overlong CRM pilot approval');
  RAISE EXCEPTION 'Unexpected long-term CRM pilot approval';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Invalid operator approval%' THEN RAISE; END IF;
 END;
END $audit$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
SELECT public.request_ai_workforce_readonly_source(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'Allow only aggregate CRM lead status counts under review for the first-party staging employee.');

DO $audit$
BEGIN
 BEGIN
  PERFORM public.review_ai_workforce_readonly_source(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  (SELECT id FROM public.ai_workforce_readonly_sources
   WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333'),
  'approved','Owner should not approve their own data-source consent');
  RAISE EXCEPTION 'Self-approval of CRM access unexpectedly passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Independent CRM data-access reviewer required%' THEN RAISE; END IF;
 END;
END $audit$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000002',true);
SELECT public.review_ai_workforce_readonly_source(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_readonly_sources
  WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333'),
 'approved','Second administrator reviewed data minimisation and allowed aggregate CRM counts');

SELECT set_config('request.jwt.claim.sub','22222222-bbbb-4000-8000-000000000001',true);
DO $audit$
DECLARE number_visible integer;
BEGIN
 SELECT count(*) INTO number_visible FROM public.ai_workforce_readonly_sources;
 IF number_visible<>0 THEN RAISE EXCEPTION 'Foreign tenant saw consented CRM source'; END IF;
 BEGIN
  PERFORM public.queue_ai_workforce_readonly_analysis(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  'aaaaaaaa-5555-4555-8555-555555555555',
  'aaaaaaaa-7777-4777-8777-777777777777',
  (SELECT id FROM public.ai_workforce_readonly_sources LIMIT 1),
  'openai','gpt-4.1-mini','GBP',900,160,
  'aaaa1111-2222-4333-8444-555555555555');
  RAISE EXCEPTION 'Foreign tenant launched billable model task';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI Workforce tenant administrator required%' THEN RAISE; END IF;
 END;
END $audit$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
SELECT public.queue_ai_workforce_readonly_analysis(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'aaaaaaaa-5555-4555-8555-555555555555',
 'aaaaaaaa-7777-4777-8777-777777777777',
 (SELECT id FROM public.ai_workforce_readonly_sources
  WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333'),
 'openai','gpt-4.1-mini','GBP',900,160,
 'aaaa1111-2222-4333-8444-555555555555');

DO $audit$
DECLARE a public.ai_workforce_readonly_admissions;result jsonb;
BEGIN
 SELECT * INTO STRICT a FROM public.ai_workforce_readonly_admissions
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333';
 IF a.source_snapshot->>'totalLeads'<>'20' OR
    a.source_snapshot->>'qualifiedLeads' IS NOT NULL OR
    a.source_snapshot->>'convertedLeads' IS NOT NULL OR
    a.source_snapshot->>'workingLeads' IS NOT NULL THEN
  RAISE EXCEPTION 'Real CRM aggregation or small-group suppression is wrong';
 END IF;
 IF a.source_snapshot::text LIKE '%PRIVATE%' OR
  a.source_snapshot::text LIKE '%email%' OR a.source_snapshot::text LIKE '%phone%' THEN
  RAISE EXCEPTION 'Sensitive CRM data leaked into model snapshot';
 END IF;
 SELECT public.queue_ai_workforce_readonly_analysis(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  a.employee_id,a.task_id,a.source_id,
  'openai','gpt-4.1-mini','GBP',900,160,
  'aaaa1111-2222-4333-8444-555555555555') INTO result;
 IF result->>'alreadyExists'<>'true' THEN
  RAISE EXCEPTION 'Duplicate CRM model task was not idempotent';
 END IF;
 BEGIN
  PERFORM public.queue_ai_workforce_readonly_analysis(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
   a.employee_id,a.task_id,a.source_id,
   'openai','gpt-4.1-mini','GBP',900,200,
   'aaaa1111-2222-4333-8444-555555555555');
  RAISE EXCEPTION 'Changed model idempotency payload unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Read-only job idempotency payload changed%' THEN RAISE; END IF;
 END;
END $audit$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $audit$
DECLARE n integer;claim jsonb;payload jsonb;ref uuid;receipt jsonb;
BEGIN
 SELECT count(*) INTO n FROM public.claim_intelligence_jobs_for_scope(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',10,NULL,'generic_worker_01');
 IF n<>0 THEN RAISE EXCEPTION 'Generic agent stole the dedicated read-only job'; END IF;
 SELECT count(*) INTO n FROM public.claim_intelligence_jobs_for_scope(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',10,
 ARRAY['ai-workforce.readonly']::text[],'generic_worker_01');
 IF n<>0 THEN RAISE EXCEPTION 'Explicit generic claim bypassed read-only isolation'; END IF;
 SELECT x INTO claim FROM public.claim_ai_workforce_readonly_jobs(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora','readonly_worker_01',1) x LIMIT 1;
 IF claim IS NULL OR claim->>'sourceReadOnly'<>'true' OR
    claim->'allowedTools'<>'[]'::jsonb OR claim->>'sourceHash' IS NULL THEN
  RAISE EXCEPTION 'Missing independently verified CRM worker claim';
 END IF;
 ref:=(claim->>'admissionId')::uuid;
 BEGIN
  PERFORM public.finish_ai_workforce_readonly_job(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',ref,
   'readonly_worker_01','{"modelCalls":1,"toolCalls":1,"summary":"unsafe"}'::jsonb);
  RAISE EXCEPTION 'Unsafe model tool receipt was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Untrusted real CRM model receipt refused%' THEN RAISE; END IF;
 END;
 receipt:=jsonb_build_object(
  'sourceHash',claim->>'sourceHash',
  'sourceKey','omniqora.crm.leads-summary.v1',
  'dataOrigin','first_party_crm_aggregate',
  'modelId','gpt-4.1-mini',
  'modelCalls',1,'toolCalls',0,'customerActions',0,
  'reviewRequired',true,'inputTokens',180,'cachedInputTokens',0,'outputTokens',80,
  'providerReceiptId','resp_localfixture_1234567890',
  'summary','The CRM aggregate contains twenty synthetic leads. Five converted, ten qualified; small groups suppressed.');
 payload:=public.finish_ai_workforce_readonly_job(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',ref,
 'readonly_worker_01',receipt);
 IF payload->>'status'<>'waiting_review' OR payload->>'meteredCostMinor'<>'2' THEN
  RAISE EXCEPTION 'Model usage not settled correctly into the canonical budget ledger';
 END IF;
 SELECT count(*) INTO n FROM public.ai_budgeted_run_reservations
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND status='settled'
 AND actual_minor=2 AND provider_receipt_ref='resp_localfixture_1234567890';
 IF n<>1 THEN RAISE EXCEPTION 'Provider usage receipt not verified'; END IF;
END $audit$;

-- Model output must stay in human review until a different admin accepts.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
DO $audit$
BEGIN
 BEGIN
  PERFORM public.review_ai_workforce_readonly_result(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  (SELECT id FROM public.ai_workforce_readonly_admissions WHERE status='waiting_review'),
  'accepted','Owner must not approve own model analysis');
  RAISE EXCEPTION 'Self-review of metered model output accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Independent human result review required%' THEN RAISE; END IF;
 END;
END $audit$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000002',true);
SELECT public.review_ai_workforce_readonly_result(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_readonly_admissions WHERE status='waiting_review'),
 'accepted','Independent reviewer checked anonymisation and lead funnel calculations');

DO $audit$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_readonly_admissions
 WHERE status='completed';
 IF n<>1 THEN RAISE EXCEPTION 'Human-approved CRM model result was not persisted'; END IF;
 SELECT count(*) INTO n FROM public.ai_agent_runs r
 JOIN public.ai_workforce_readonly_admissions a ON a.run_id=r.id
 WHERE r.status='completed' AND r.result->>'humanReviewed'='true';
 IF n<>1 THEN RAISE EXCEPTION 'Canonical AI run missing independent human approval'; END IF;
END $audit$;

-- Revoke a second queued analysis; it cannot be claimed and may be cancelled
-- with its untouched reservation released, not silently spent.
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
SELECT public.queue_ai_workforce_readonly_analysis(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'aaaaaaaa-5555-4555-8555-555555555555',
 'aaaaaaaa-7777-4777-8777-777777777777',
 (SELECT id FROM public.ai_workforce_readonly_sources
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333'),
 'openai','gpt-4.1-mini','GBP',900,160,
 'bbbb1111-2222-4333-8444-555555555555');

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000002',true);
SELECT public.review_ai_workforce_readonly_source(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_readonly_sources
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333'),
 'revoked','The pilot CRM source access was revoked before the second task began');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $audit$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.claim_ai_workforce_readonly_jobs(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora','readonly_worker_01',2);
 IF n<>0 THEN RAISE EXCEPTION 'Revoked CRM access remained claimable'; END IF;
END $audit$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
SELECT public.cancel_ai_workforce_readonly_queued(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_readonly_admissions WHERE status='queued'));
DO $audit$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_readonly_admissions
 WHERE status='cancelled';
 IF n<>1 THEN RAISE EXCEPTION 'Unclaimed CRM run did not cancel'; END IF;
 SELECT count(*) INTO n FROM public.ai_budgeted_run_reservations
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND status='released';
 IF n<>1 THEN RAISE EXCEPTION 'Cancelled model budget not released'; END IF;
END $audit$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',true);
\echo 'AI Workforce 4D CRM consent, true SQL isolation, budget, metering, revocation and review tests passed.'
