-- AI Workforce Phase 4E operator attestation and kill-switch rehearsal.
-- Called at the end of the 4D staging fixture, before the parent rollback.
\set ON_ERROR_STOP on
DO $assert$
DECLARE tab text; enabled boolean; forced boolean;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_workforce_worker_allowlist','ai_workforce_operator_events'] LOOP
  SELECT c.relrowsecurity,c.relforcerowsecurity INTO enabled,forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=tab;
  IF NOT COALESCE(enabled,false) OR NOT COALESCE(forced,false) THEN
   RAISE EXCEPTION 'Missing operations RLS: %',tab;
  END IF;
  IF has_table_privilege('authenticated',format('public.%I',tab),'INSERT')
    OR has_table_privilege('authenticated',format('public.%I',tab),'UPDATE')
    OR has_table_privilege('authenticated',format('public.%I',tab),'DELETE') THEN
   RAISE EXCEPTION 'Browser writes incorrectly allowed on %',tab;
  END IF;
 END LOOP;
END $assert$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000003',true);
DO $assert$ DECLARE count_rows integer;
BEGIN
 SELECT count(*) INTO count_rows FROM public.ai_workforce_worker_allowlist;
 IF count_rows<>0 THEN RAISE EXCEPTION 'Viewer saw worker permit metadata'; END IF;
 SELECT count(*) INTO count_rows FROM public.ai_workforce_operator_events;
 IF count_rows<>0 THEN RAISE EXCEPTION 'Viewer saw operator audit events'; END IF;
END $assert$;

SELECT set_config('request.jwt.claim.sub','22222222-bbbb-4000-8000-000000000001',true);
DO $assert$ DECLARE count_rows integer;
BEGIN
 SELECT count(*) INTO count_rows FROM public.ai_workforce_worker_allowlist;
 IF count_rows<>0 THEN RAISE EXCEPTION 'Foreign tenant saw employee worker permits'; END IF;
END $assert$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $assert$
DECLARE record public.ai_workforce_worker_allowlist; n integer; result jsonb;
BEGIN
 SELECT * INTO STRICT record FROM public.ai_workforce_worker_allowlist
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND product_key='omniqora'
   AND worker_ref='readonly_worker_01';
 IF record.status<>'active' OR record.used_claims<>1 OR record.max_claims<>2
  OR record.expires_at<=now() THEN
  RAISE EXCEPTION 'The real CRM worker did not consume exactly one attested claim';
 END IF;
 BEGIN
  PERFORM public.configure_ai_workforce_worker_allowlist(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora','readonly_worker_01',
   'gpt-4.1-mini',true,now()+interval '20 minutes',2,
   'Attempt to silently renew a live worker permit','https://example.test/ops/evidence');
  RAISE EXCEPTION 'Live worker permit was silently renewed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Cannot silently renew%' THEN RAISE; END IF;
 END;
 -- Service role normally has broad table grants. The trigger must reject a
 -- forged worker even then, without changing any real job or reservations.
 BEGIN
  UPDATE public.ai_workforce_readonly_admissions SET status='queued'
  WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND status='completed';
  UPDATE public.ai_workforce_readonly_admissions
   SET status='processing',worker_ref='unapproved_worker_01'
  WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND status='queued';
  RAISE EXCEPTION 'Unapproved worker changed admission to processing';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Read-only worker attestation missing%' THEN RAISE; END IF;
 END;
 SELECT public.quarantine_stale_ai_workforce_readonly(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',15,10) INTO result;
 IF result->>'quarantined'<>'0' OR result->>'reservationsReleased'<>'0' THEN
  RAISE EXCEPTION 'Quarantine incorrectly released legitimate, non-stale model budget';
 END IF;
END $assert$;

SELECT public.emergency_stop_ai_workforce_readonly(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'Disposable operator triggered manual emergency stop and held-cost protection');
DO $assert$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_readonly_pilots
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND enabled;
 IF n<>0 THEN RAISE EXCEPTION 'Pilot remained enabled after operator emergency stop'; END IF;
 SELECT count(*) INTO n FROM public.ai_workforce_worker_allowlist
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND status='active';
 IF n<>0 THEN RAISE EXCEPTION 'Worker credentials remained permitted after emergency stop'; END IF;
 SELECT count(*) INTO n FROM public.ai_budgeted_run_reservations
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333' AND status='settled'
   AND actual_minor=2;
 IF n<>1 THEN RAISE EXCEPTION 'Emergency stop modified historical provider metering'; END IF;
 SELECT count(*) INTO n FROM public.ai_workforce_operator_events
 WHERE tenant_id='aaaaaaaa-3333-4333-8333-333333333333'
   AND event_key='pilot_emergency_stopped';
 IF n<>1 THEN RAISE EXCEPTION 'Operator emergency stop missing immutable event'; END IF;
END $assert$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',true);
\echo 'AI Workforce Phase 4E worker allowlist, lease guard and emergency-stop SQL checks passed.'
