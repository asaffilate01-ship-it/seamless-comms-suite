-- AI Workforce Phase 5A: disposable, tenant-isolated multi-agent shadow plan tests.
-- Executed inside the Phase 4A staging transaction and rolled back.
\set ON_ERROR_STOP on

DO $rls$
DECLARE tab text; enabled boolean; forced boolean;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_workforce_shadow_teams','ai_workforce_shadow_steps','ai_workforce_shadow_events'] LOOP
  SELECT c.relrowsecurity,c.relforcerowsecurity INTO enabled,forced
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=tab;
  IF NOT COALESCE(enabled,false) OR NOT COALESCE(forced,false) THEN
   RAISE EXCEPTION 'Shadow team RLS must be forced: %',tab;
  END IF;
  IF has_table_privilege('authenticated',format('public.%I',tab),'INSERT')
    OR has_table_privilege('authenticated',format('public.%I',tab),'UPDATE')
    OR has_table_privilege('authenticated',format('public.%I',tab),'DELETE') THEN
   RAISE EXCEPTION 'Direct browser shadow team table write grants found: %',tab;
  END IF;
 END LOOP;
END $rls$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO public.ai_employees(
 id,tenant_id,product_key,blueprint_key,display_name,role_title,status,revision,
 profile,created_by,last_edited_by,reviewed_by,reviewed_at)
VALUES (
 'aaaaaaaa-9999-4999-8999-999999999999',
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora','shared.daily-brief',
 'Staging second AI employee','AI research specialist','approved_configuration',1,
 '{"goal":"Prepare a controlled review of evidence","tasks":["Compare summary counts"],"capabilities":[],"trigger":{"type":"manual","value":"","enabled":false}}',
 '11111111-aaaa-4000-8000-000000000001','11111111-aaaa-4000-8000-000000000001',
 '11111111-aaaa-4000-8000-000000000002',now()
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);

SELECT public.create_ai_workforce_shadow_team(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 'Tenant A staged AI research team',
 'Collaboratively prepare a written, reviewable lead funnel summary with no model execution.');

SELECT public.save_ai_workforce_shadow_plan(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_shadow_teams
  WHERE team_name='Tenant A staged AI research team'),
 '[
   {"employeeId":"aaaaaaaa-5555-4555-8555-555555555555",
    "role":"lead",
    "instructions":"Prepare a clear evidence and questions checklist for review.",
    "expectedOutput":"Written lead funnel analysis brief and open questions."},
   {"employeeId":"aaaaaaaa-9999-4999-8999-999999999999",
    "role":"analyst",
    "instructions":"Examine the previous written outline and document missing support.",
    "expectedOutput":"Reviewed comparison and annotated evidence gaps."}
 ]'::jsonb);

DO $validate$
DECLARE team public.ai_workforce_shadow_teams; n integer;
BEGIN
 SELECT * INTO STRICT team FROM public.ai_workforce_shadow_teams
 WHERE team_name='Tenant A staged AI research team';
 IF team.revision<>1 OR team.status<>'draft' THEN
  RAISE EXCEPTION 'Versioned shadow team plan was not saved';
 END IF;
 SELECT count(*) INTO n FROM public.ai_workforce_shadow_steps
 WHERE team_id=team.id;
 IF n<>2 THEN RAISE EXCEPTION 'Expected two distinct shadow member handoffs'; END IF;
 BEGIN
  PERFORM public.save_ai_workforce_shadow_plan(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',team.id,
   '[{"employeeId":"aaaaaaaa-5555-4555-8555-555555555555",
      "role":"lead","instructions":"More than ten characters here",
      "expectedOutput":"Another reviewable written handoff"},
     {"employeeId":"aaaaaaaa-5555-4555-8555-555555555555",
      "role":"reporter","instructions":"Duplicate employee role deliberately",
      "expectedOutput":"This should be safely rejected"}]'::jsonb);
  RAISE EXCEPTION 'Duplicate shadow employees were accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Shadow team requires distinct%' THEN RAISE; END IF;
 END;
END $validate$;

SELECT public.transition_ai_workforce_shadow_team(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_shadow_teams
  WHERE team_name='Tenant A staged AI research team'),
 'submit',NULL);

DO $check$ BEGIN
 BEGIN
  PERFORM public.transition_ai_workforce_shadow_team(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
   (SELECT id FROM public.ai_workforce_shadow_teams
    WHERE team_name='Tenant A staged AI research team'),
   'approve','Creator attempts own plan approval');
  RAISE EXCEPTION 'Self-review of shadow team plan was allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Independent reviewer and current employee approvals required%' THEN RAISE; END IF;
 END;
END $check$;

SELECT set_config('request.jwt.claim.sub','22222222-bbbb-4000-8000-000000000001',true);
DO $check$ DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_shadow_teams;
 IF n<>0 THEN RAISE EXCEPTION 'Foreign tenant saw AI team plans'; END IF;
 BEGIN
  PERFORM public.preview_ai_workforce_shadow_team(
   'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
   (SELECT id FROM public.ai_workforce_shadow_teams LIMIT 1));
  RAISE EXCEPTION 'Foreign tenant previewed private shadow team';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AI Workforce tenant administrator required%' THEN RAISE; END IF;
 END;
END $check$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000003',true);
DO $check$ DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ai_workforce_shadow_teams;
 IF n<>0 THEN RAISE EXCEPTION 'Viewer saw private shadow mission'; END IF;
END $check$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000002',true);
SELECT public.transition_ai_workforce_shadow_team(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_shadow_teams
  WHERE team_name='Tenant A staged AI research team'),
 'approve','Independent reviewer approved the shadow handoff process');

DO $check$
DECLARE res jsonb; n integer;
BEGIN
 SELECT public.preview_ai_workforce_shadow_team(
  'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
  (SELECT id FROM public.ai_workforce_shadow_teams
   WHERE team_name='Tenant A staged AI research team')) INTO res;
 IF res->>'canExecute'<>'false' OR res->>'modelCalls'<>'0' OR
  res->>'toolCalls'<>'0' OR res->>'customerActions'<>'0' OR
  res->>'scheduled'<>'false' OR res->>'stepCount'<>'2' THEN
  RAISE EXCEPTION 'Shadow plan preview claimed autonomous execution capability';
 END IF;
 SELECT count(*) INTO n FROM public.intelligence_jobs
 WHERE job_type='ai-workforce.shadow';
 IF n<>0 THEN RAISE EXCEPTION 'Shadow planning illegally queued model jobs'; END IF;
 SELECT count(*) INTO n FROM public.ai_agent_runs
 WHERE input_version='shadow-team-v1';
 IF n<>0 THEN RAISE EXCEPTION 'Shadow planning illegally created canonical model runs'; END IF;
END $check$;

SELECT set_config('request.jwt.claim.sub','11111111-aaaa-4000-8000-000000000001',true);
SELECT public.transition_ai_workforce_shadow_team(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_shadow_teams
  WHERE team_name='Tenant A staged AI research team'),
 'pause','Manually pausing a human-supervised shadow mission');
SELECT public.save_ai_workforce_shadow_plan(
 'aaaaaaaa-3333-4333-8333-333333333333','omniqora',
 (SELECT id FROM public.ai_workforce_shadow_teams
  WHERE team_name='Tenant A staged AI research team'),
 '[
   {"employeeId":"aaaaaaaa-5555-4555-8555-555555555555",
    "role":"lead",
    "instructions":"Revised evidence questions checklist for a newly staged human review.",
    "expectedOutput":"Updated written handoff with no model execution."},
   {"employeeId":"aaaaaaaa-9999-4999-8999-999999999999",
    "role":"reporter",
    "instructions":"Summarise previous handoff and clarify each uncertain metric.",
    "expectedOutput":"Human-readable summary with documented limitations."}
 ]'::jsonb);
DO $check$ DECLARE team public.ai_workforce_shadow_teams;
BEGIN
 SELECT * INTO STRICT team FROM public.ai_workforce_shadow_teams
 WHERE team_name='Tenant A staged AI research team';
 IF team.revision<>2 OR team.status<>'draft' OR team.reviewed_by IS NOT NULL THEN
  RAISE EXCEPTION 'Team edits failed to revoke earlier independent approval';
 END IF;
END $check$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',true);
\echo 'AI Workforce Phase 5A real PostgreSQL tenant isolation, shadow review and zero-execution tests passed.'
