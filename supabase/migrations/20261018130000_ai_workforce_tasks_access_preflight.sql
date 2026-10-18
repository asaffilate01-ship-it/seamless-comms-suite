-- AI Workforce Phase 4A — governed employee work orders & connector ACCESS PROPOSALS.
-- Inert by construction. No models, payments, external tools, worker or schedules.
-- Stacked on the Phase 3 AI Workforce migration.
BEGIN;

CREATE TABLE public.ai_employee_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 employee_id uuid NOT NULL,
 request_key uuid NOT NULL,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 180),
 objective text NOT NULL CHECK (length(btrim(objective)) BETWEEN 10 AND 3000),
 output_spec text NOT NULL CHECK (length(btrim(output_spec)) BETWEEN 4 AND 1000),
 acceptance_criteria text NOT NULL CHECK (length(btrim(acceptance_criteria)) BETWEEN 8 AND 1800),
 requested_capabilities text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(requested_capabilities)<=20),
 proposed_trigger jsonb NOT NULL DEFAULT '{"type":"manual","value":"","enabled":false}'::jsonb
    CHECK (jsonb_typeof(proposed_trigger)='object' AND proposed_trigger->'enabled'='false'::jsonb),
 status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','approved_brief','returned','cancelled')),
 employee_revision integer NOT NULL DEFAULT 0 CHECK(employee_revision>=0),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 last_edited_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE,
 UNIQUE (id,tenant_id,product_key),
 UNIQUE (tenant_id,product_key,request_key)
);
CREATE INDEX ai_employee_tasks_board_idx
 ON public.ai_employee_tasks(tenant_id,product_key,employee_id,status,updated_at DESC);

CREATE TABLE public.ai_employee_task_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 employee_id uuid NOT NULL,
 task_id uuid NOT NULL,
 event_type text NOT NULL CHECK (event_type IN (
  'created','updated','submitted','approved_brief','returned','cancelled','preflight')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (task_id,tenant_id,product_key)
   REFERENCES public.ai_employee_tasks(id,tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY (employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX ai_employee_task_events_idx
 ON public.ai_employee_task_events(tenant_id,product_key,task_id,created_at DESC);

CREATE TABLE public.ai_employee_access_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 employee_id uuid NOT NULL,
 capability_key text NOT NULL CHECK (capability_key ~ '^[a-z0-9][a-z0-9._-]{1,99}$'),
 provider_key text NOT NULL CHECK (provider_key ~ '^[a-z0-9][a-z0-9._-]{1,99}$'),
 rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 12 AND 900),
 status text NOT NULL DEFAULT 'requested'
  CHECK (status IN ('requested','shortlisted_metadata','declined','revoked')),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE,
 UNIQUE (tenant_id,product_key,employee_id,provider_key,capability_key)
);
CREATE INDEX ai_employee_access_proposals_idx
 ON public.ai_employee_access_proposals(tenant_id,product_key,employee_id,status,created_at DESC);

-- No broad browser write permissions, and no anonymous access. Read only to
-- tenant owner/admin or platform admin. SECURITY DEFINER functions check again.
DO $security$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_employee_tasks','ai_employee_task_events','ai_employee_access_proposals'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
     public.is_platform_admin(auth.uid()) OR EXISTS(
       SELECT 1 FROM public.tenant_members m
       WHERE m.tenant_id=%I.tenant_id AND m.user_id=auth.uid()
         AND m.role IN('owner','admin'))
    )$p$, 'ai workforce p4 read '||tab,tab,tab);
 END LOOP;
END $security$;

-- Database validates the proposed schedule as INERT metadata, never cron code.
CREATE FUNCTION public.ai_workforce_check_trigger(_trigger jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $trigger$
DECLARE kind text; value text;
BEGIN
 IF _trigger IS NULL OR jsonb_typeof(_trigger)<>'object' OR
    jsonb_typeof(_trigger->'enabled') IS DISTINCT FROM 'boolean' OR
    _trigger->>'enabled'<>'false' THEN
  RAISE EXCEPTION 'Executable trigger proposal forbidden';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_trigger) AS x(key)
           WHERE x.key NOT IN('type','value','enabled')) THEN
  RAISE EXCEPTION 'Unrecognized trigger property';
 END IF;
 kind:=_trigger->>'type';
 value:=COALESCE(_trigger->>'value','');
 IF kind IS NULL OR jsonb_typeof(_trigger->'value') IS DISTINCT FROM 'string' OR
     length(value)>120 THEN
  RAISE EXCEPTION 'Invalid trigger proposal';
 END IF;
 IF NOT (
  (kind='manual' AND value='') OR
  (kind='daily' AND value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') OR
  (kind='weekly' AND value ~ '^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01][0-9]|2[0-3]):[0-5][0-9]$') OR
  (kind='event' AND value ~ '^[a-z0-9][a-z0-9._-]{2,119}$')
 ) THEN
  RAISE EXCEPTION 'Unsupported or unsafe trigger proposal';
 END IF;
 RETURN jsonb_build_object('type',kind,'value',value,'enabled',false);
END $trigger$;

CREATE FUNCTION public.ai_workforce_check_task_capabilities(
 _employee uuid,_tenant uuid,_product text,_caps text[])
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $caps$
DECLARE e public.ai_employees; item text;
BEGIN
 SELECT * INTO STRICT e FROM public.ai_employees
  WHERE id=_employee AND tenant_id=_tenant AND product_key=_product;
 IF _caps IS NULL OR cardinality(_caps)>20 THEN
  RAISE EXCEPTION 'Invalid requested task capabilities';
 END IF;
 FOREACH item IN ARRAY _caps LOOP
  IF item IS NULL OR item !~ '^[a-z0-9][a-z0-9._-]{1,99}$' OR
     NOT (COALESCE(e.profile->'capabilities','[]'::jsonb) ? item) THEN
    RAISE EXCEPTION 'Task capability was not proposed in employee profile';
  END IF;
 END LOOP;
 RETURN ARRAY(SELECT DISTINCT x FROM unnest(_caps) x ORDER BY x);
END $caps$;

-- Idempotent task creation. A changed request with reused ID is rejected.
CREATE FUNCTION public.create_ai_employee_task(
 _tenant uuid,_product text,_employee uuid,_request_key uuid,
 _title text,_objective text,_output_spec text,_criteria text,
 _capabilities text[],_trigger jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE
 e public.ai_employees; existing public.ai_employee_tasks; result uuid;
 caps text[]; trig jsonb; name text; goal text; output_text text; criteria_text text;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
   WHERE id=_employee AND tenant_id=_tenant AND product_key=_product;
 IF e.status='retired' OR e.revision=0 THEN
  RAISE EXCEPTION 'Save a non-retired employee profile first';
 END IF;
 IF _request_key IS NULL OR
    length(btrim(COALESCE(_title,''))) NOT BETWEEN 4 AND 180 OR
    length(btrim(COALESCE(_objective,''))) NOT BETWEEN 10 AND 3000 OR
    length(btrim(COALESCE(_output_spec,''))) NOT BETWEEN 4 AND 1000 OR
    length(btrim(COALESCE(_criteria,''))) NOT BETWEEN 8 AND 1800 THEN
  RAISE EXCEPTION 'Invalid employee task request';
 END IF;
 name:=btrim(_title);goal:=btrim(_objective);
 output_text:=btrim(_output_spec);criteria_text:=btrim(_criteria);
 caps:=public.ai_workforce_check_task_capabilities(_employee,_tenant,_product,_capabilities);
 trig:=public.ai_workforce_check_trigger(_trigger);
 SELECT * INTO existing FROM public.ai_employee_tasks
   WHERE tenant_id=_tenant AND product_key=_product AND request_key=_request_key;
 IF existing.id IS NOT NULL THEN
  IF existing.employee_id<>_employee OR existing.title<>name OR
    existing.objective<>goal OR existing.output_spec<>output_text OR
    existing.acceptance_criteria<>criteria_text OR
    existing.requested_capabilities<>caps OR existing.proposed_trigger<>trig THEN
   RAISE EXCEPTION 'Task idempotency payload changed';
  END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO public.ai_employee_tasks
  (tenant_id,product_key,employee_id,request_key,title,objective,output_spec,
   acceptance_criteria,requested_capabilities,proposed_trigger,created_by,last_edited_by)
 VALUES (_tenant,_product,_employee,_request_key,name,goal,output_text,
   criteria_text,caps,trig,auth.uid(),auth.uid())
 ON CONFLICT(tenant_id,product_key,request_key) DO NOTHING
 RETURNING id INTO result;
 IF result IS NULL THEN
   SELECT * INTO STRICT existing FROM public.ai_employee_tasks
   WHERE tenant_id=_tenant AND product_key=_product AND request_key=_request_key;
   IF existing.employee_id<>_employee OR existing.title<>name OR
      existing.objective<>goal OR existing.output_spec<>output_text OR
      existing.acceptance_criteria<>criteria_text OR
      existing.requested_capabilities<>caps OR existing.proposed_trigger<>trig THEN
     RAISE EXCEPTION 'Task idempotency payload changed';
   END IF;
   RETURN existing.id;
 END IF;
 INSERT INTO public.ai_employee_task_events
  (tenant_id,product_key,employee_id,task_id,event_type,actor_id)
 VALUES (_tenant,_product,_employee,result,'created',auth.uid());
 RETURN result;
END $create$;

-- Revision-aware edits. A returned brief can be corrected and resubmitted.
-- Editing an approved brief revokes the old approval and resets to draft.
CREATE FUNCTION public.revise_ai_employee_task(
 _tenant uuid,_product text,_employee uuid,_task uuid,_expected_revision integer,
 _title text,_objective text,_output_spec text,_criteria text,
 _capabilities text[],_trigger jsonb)
RETURNS public.ai_employee_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $revise$
DECLARE
 e public.ai_employees; t public.ai_employee_tasks; result public.ai_employee_tasks;
 caps text[]; trig jsonb;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
  WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT t FROM public.ai_employee_tasks
  WHERE id=_task AND employee_id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF e.status='retired' OR t.status NOT IN('draft','returned','approved_brief') THEN
   RAISE EXCEPTION 'This employee task cannot be revised';
 END IF;
 IF t.revision<>_expected_revision THEN
   RAISE EXCEPTION 'Task has been edited elsewhere: refresh before saving';
 END IF;
 IF length(btrim(COALESCE(_title,''))) NOT BETWEEN 4 AND 180 OR
    length(btrim(COALESCE(_objective,''))) NOT BETWEEN 10 AND 3000 OR
    length(btrim(COALESCE(_output_spec,''))) NOT BETWEEN 4 AND 1000 OR
    length(btrim(COALESCE(_criteria,''))) NOT BETWEEN 8 AND 1800 THEN
   RAISE EXCEPTION 'Invalid revised task brief';
 END IF;
 caps:=public.ai_workforce_check_task_capabilities(_employee,_tenant,_product,_capabilities);
 trig:=public.ai_workforce_check_trigger(_trigger);
 UPDATE public.ai_employee_tasks
 SET title=btrim(_title),objective=btrim(_objective),output_spec=btrim(_output_spec),
     acceptance_criteria=btrim(_criteria),requested_capabilities=caps,
     proposed_trigger=trig,status='draft',employee_revision=0,revision=t.revision+1,
     last_edited_by=auth.uid(),reviewed_by=NULL,reviewed_at=NULL,review_note=NULL,updated_at=now()
 WHERE id=t.id RETURNING * INTO result;
 INSERT INTO public.ai_employee_task_events
 (tenant_id,product_key,employee_id,task_id,event_type,actor_id,detail)
 VALUES(_tenant,_product,_employee,_task,'updated',auth.uid(),
        jsonb_build_object('revision',result.revision,'reviewReset',true));
 RETURN result;
END $revise$;

-- Task review is administrative approval of a written brief, NOT approval
-- to execute a model or third-party action.
CREATE FUNCTION public.transition_ai_employee_task(
 _tenant uuid,_product text,_employee uuid,_task uuid,_action text,_note text DEFAULT NULL)
RETURNS public.ai_employee_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $transition$
DECLARE e public.ai_employees; t public.ai_employee_tasks; result public.ai_employee_tasks;
 next_status text; ev text; review_id uuid; review_time timestamptz; captured_revision integer;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
  WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 SELECT * INTO STRICT t FROM public.ai_employee_tasks
  WHERE id=_task AND employee_id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF length(COALESCE(_note,''))>1000 THEN RAISE EXCEPTION 'Note exceeds limit'; END IF;
 CASE _action
  WHEN 'submit' THEN
   IF t.status NOT IN('draft','returned') OR e.status<>'approved_configuration' THEN
    RAISE EXCEPTION 'Approved employee configuration and draft brief required';
   END IF;
   next_status:='pending_review';ev:='submitted';
   captured_revision:=e.revision;review_id:=NULL;review_time:=NULL;
  WHEN 'approve' THEN
   IF t.status<>'pending_review' OR e.status<>'approved_configuration' OR
      t.employee_revision<>e.revision OR
      auth.uid() IN(t.created_by,t.last_edited_by) THEN
    RAISE EXCEPTION 'Independent task review of current employee revision required';
   END IF;
   next_status:='approved_brief';ev:='approved_brief';
   captured_revision:=t.employee_revision;review_id:=auth.uid();review_time:=now();
  WHEN 'return' THEN
   IF t.status<>'pending_review' OR
      auth.uid() IN(t.created_by,t.last_edited_by) OR
      length(btrim(COALESCE(_note,'')))<12 THEN
    RAISE EXCEPTION 'Independent review and return reason required';
   END IF;
   next_status:='returned';ev:='returned';
   captured_revision:=t.employee_revision;review_id:=NULL;review_time:=NULL;
  WHEN 'cancel' THEN
   IF t.status='cancelled' THEN RAISE EXCEPTION 'Task already cancelled'; END IF;
   next_status:='cancelled';ev:='cancelled';
   captured_revision:=t.employee_revision;review_id:=t.reviewed_by;review_time:=t.reviewed_at;
  ELSE RAISE EXCEPTION 'Unknown AI task transition';
 END CASE;
 UPDATE public.ai_employee_tasks SET
   status=next_status,employee_revision=captured_revision,
   reviewed_by=review_id,reviewed_at=review_time,
   review_note=CASE WHEN _action IN('approve','return') THEN NULLIF(btrim(_note),'') ELSE review_note END,
   updated_at=now()
 WHERE id=t.id RETURNING * INTO result;
 INSERT INTO public.ai_employee_task_events
   (tenant_id,product_key,employee_id,task_id,event_type,actor_id,
    detail)
 VALUES (_tenant,_product,_employee,_task,ev,auth.uid(),
    jsonb_build_object('employeeRevision',captured_revision,
       'note',COALESCE(NULLIF(btrim(_note),''),'')));
 RETURN result;
END $transition$;

CREATE FUNCTION public.request_ai_employee_access_review(
 _tenant uuid,_product text,_employee uuid,_capability text,_provider text,_rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $request$
DECLARE result uuid;e public.ai_employees;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
  WHERE id=_employee AND tenant_id=_tenant AND product_key=_product;
 IF e.status='retired' OR e.revision=0 THEN
  RAISE EXCEPTION 'Employee profile required to request access';
 END IF;
 IF _capability IS NULL OR _capability !~ '^[a-z0-9][a-z0-9._-]{1,99}$' OR
    _provider IS NULL OR _provider !~ '^[a-z0-9][a-z0-9._-]{1,99}$' OR
    length(btrim(COALESCE(_rationale,''))) NOT BETWEEN 12 AND 900 THEN
  RAISE EXCEPTION 'Invalid capability/proposed provider request';
 END IF;
 IF NOT(COALESCE(e.profile->'capabilities','[]'::jsonb) ? _capability) THEN
  RAISE EXCEPTION 'Capability must be present in the approved employee blueprint proposal';
 END IF;
 INSERT INTO public.ai_employee_access_proposals
 (tenant_id,product_key,employee_id,capability_key,provider_key,rationale,requested_by)
 VALUES (_tenant,_product,_employee,_capability,_provider,btrim(_rationale),auth.uid())
 ON CONFLICT(tenant_id,product_key,employee_id,provider_key,capability_key) DO NOTHING
 RETURNING id INTO result;
 IF result IS NULL THEN
  SELECT id INTO STRICT result FROM public.ai_employee_access_proposals
  WHERE tenant_id=_tenant AND product_key=_product AND employee_id=_employee
    AND provider_key=_provider AND capability_key=_capability;
 END IF;
 RETURN result;
END $request$;

CREATE FUNCTION public.review_ai_employee_access_proposal(
 _tenant uuid,_product text,_proposal uuid,_decision text,_note text)
RETURNS public.ai_employee_access_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $review$
DECLARE rec public.ai_employee_access_proposals; out_row public.ai_employee_access_proposals;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT rec FROM public.ai_employee_access_proposals
 WHERE id=_proposal AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF _decision NOT IN('shortlisted_metadata','declined','revoked') OR
    length(btrim(COALESCE(_note,''))) NOT BETWEEN 12 AND 900 THEN
  RAISE EXCEPTION 'Invalid access proposal review';
 END IF;
 IF _decision IN('shortlisted_metadata','declined') AND
    (rec.status<>'requested' OR auth.uid()=rec.requested_by) THEN
  RAISE EXCEPTION 'Independent access proposal reviewer required';
 END IF;
 IF _decision='revoked' AND rec.status<>'shortlisted_metadata' THEN
  RAISE EXCEPTION 'Only a shortlisted metadata proposal can be revoked';
 END IF;
 UPDATE public.ai_employee_access_proposals
 SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(_note)
 WHERE id=rec.id RETURNING * INTO out_row;
 RETURN out_row;
END $review$;

-- Read-only deterministic preflight. This DOES NOT queue or execute the task.
CREATE FUNCTION public.preflight_ai_employee_task(
 _tenant uuid,_product text,_employee uuid,_task uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $preflight$
DECLARE e public.ai_employees;t public.ai_employee_tasks; uc public.ai_use_cases;
 is_runtime boolean; has_budget boolean; missing_access integer;
 blockers jsonb:='[]'::jsonb; details jsonb; readiness jsonb;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
 WHERE id=_employee AND tenant_id=_tenant AND product_key=_product;
 SELECT * INTO STRICT t FROM public.ai_employee_tasks
 WHERE id=_task AND employee_id=_employee AND tenant_id=_tenant AND product_key=_product;
 SELECT * INTO uc FROM public.ai_use_cases
 WHERE tenant_id=_tenant AND product_key=_product AND use_case_key=e.blueprint_key;
 is_runtime:=public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime');
 SELECT EXISTS(SELECT 1 FROM public.ai_spend_budgets b
  WHERE b.tenant_id=_tenant AND b.product_key=_product AND
   b.period_month=date_trunc('month',now() AT TIME ZONE 'UTC')::date AND
   b.limit_minor > b.reserved_minor + b.spent_minor) INTO has_budget;
 SELECT count(*) INTO missing_access FROM unnest(t.requested_capabilities) AS c(key)
 WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_employee_access_proposals p
  WHERE p.employee_id=e.id AND p.tenant_id=_tenant AND p.product_key=_product
    AND p.capability_key=c.key AND p.status='shortlisted_metadata');
 IF e.status<>'approved_configuration' THEN blockers:=blockers||'"employee_not_approved"'::jsonb; END IF;
 IF t.status<>'approved_brief' THEN blockers:=blockers||'"task_brief_not_approved"'::jsonb; END IF;
 IF t.employee_revision<>e.revision THEN blockers:=blockers||'"employee_profile_changed"'::jsonb; END IF;
 IF uc.id IS NULL OR uc.status NOT IN('approved','pilot') OR
    uc.approved_by IS NULL OR uc.owner_user_id IS NOT DISTINCT FROM uc.approved_by THEN
   blockers:=blockers||'"approved_agent_use_case_missing"'::jsonb;
 END IF;
 IF NOT is_runtime THEN blockers:=blockers||'"ai_runtime_not_entitled"'::jsonb; END IF;
 IF NOT has_budget THEN blockers:=blockers||'"ai_budget_unavailable"'::jsonb; END IF;
 IF missing_access>0 THEN blockers:=blockers||'"access_metadata_review_pending"'::jsonb; END IF;
 blockers:=blockers||'["employee_execution_not_deployed","capability_grants_not_verified"]'::jsonb;
 details:=jsonb_build_object(
  'employeeApproved',e.status='approved_configuration',
  'taskBriefApproved',t.status='approved_brief',
  'employeeRevisionCurrent',t.employee_revision=e.revision,
  'useCaseIndependentlyApproved',COALESCE(uc.status IN('approved','pilot') AND
    uc.approved_by IS NOT NULL AND uc.owner_user_id IS DISTINCT FROM uc.approved_by,false),
  'runtimeEntitled',is_runtime,
  'budgetHasUnreservedHeadroom',has_budget,
  'pendingMetadataReviewCount',missing_access,
  'workerCertified',false,
  'capabilityGrantsLive',false,
  'scheduleEnabled',false);
 readiness:=jsonb_build_object(
  'mode','read_only_preflight','taskId',t.id,'employeeId',e.id,
  'employeeRevision',e.revision,'canExecute',false,'modelCalls',0,
  'toolCalls',0,'queuedJobs',0,'blockers',blockers,'checks',details);
 INSERT INTO public.ai_employee_task_events
 (tenant_id,product_key,employee_id,task_id,event_type,actor_id,detail)
 VALUES (_tenant,_product,_employee,_task,'preflight',auth.uid(),
   jsonb_build_object('blockers',blockers,'checks',details,'canExecute',false));
 RETURN readiness;
END $preflight$;

-- Existing generic ai_agent_runs allows tenant write access. Stop browser
-- attribution forgery and even privileged accidental linking until a later
-- independently certified workforce worker replaces this fail-closed guard.
CREATE FUNCTION public.block_unverified_ai_employee_run_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.ai_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'AI employee run linkage disabled until certified workforce worker';
  END IF;
 ELSIF NEW.ai_employee_id IS DISTINCT FROM OLD.ai_employee_id THEN
    RAISE EXCEPTION 'AI employee run linkage disabled until certified workforce worker';
 END IF;
 RETURN NEW;
END $guard$;
CREATE TRIGGER ai_workforce_run_link_locked
 BEFORE INSERT OR UPDATE OF ai_employee_id ON public.ai_agent_runs
 FOR EACH ROW EXECUTE FUNCTION public.block_unverified_ai_employee_run_link();

-- Guard helpers cannot be called from browser.
REVOKE ALL ON FUNCTION public.ai_workforce_check_trigger(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_workforce_check_task_capabilities(uuid,uuid,text,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.block_unverified_ai_employee_run_link() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_workforce_check_trigger(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_workforce_check_task_capabilities(uuid,uuid,text,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.block_unverified_ai_employee_run_link() TO service_role;
DO $grants$
BEGIN
 REVOKE ALL ON FUNCTION public.create_ai_employee_task(uuid,text,uuid,uuid,text,text,text,text,text[],jsonb) FROM PUBLIC,anon;
 REVOKE ALL ON FUNCTION public.revise_ai_employee_task(uuid,text,uuid,uuid,integer,text,text,text,text,text[],jsonb) FROM PUBLIC,anon;
 REVOKE ALL ON FUNCTION public.transition_ai_employee_task(uuid,text,uuid,uuid,text,text) FROM PUBLIC,anon;
 REVOKE ALL ON FUNCTION public.request_ai_employee_access_review(uuid,text,uuid,text,text,text) FROM PUBLIC,anon;
 REVOKE ALL ON FUNCTION public.review_ai_employee_access_proposal(uuid,text,uuid,text,text) FROM PUBLIC,anon;
 REVOKE ALL ON FUNCTION public.preflight_ai_employee_task(uuid,text,uuid,uuid) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION public.create_ai_employee_task(uuid,text,uuid,uuid,text,text,text,text,text[],jsonb) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.revise_ai_employee_task(uuid,text,uuid,uuid,integer,text,text,text,text,text[],jsonb) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.transition_ai_employee_task(uuid,text,uuid,uuid,text,text) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.request_ai_employee_access_review(uuid,text,uuid,text,text,text) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.review_ai_employee_access_proposal(uuid,text,uuid,text,text) TO authenticated;
 GRANT EXECUTE ON FUNCTION public.preflight_ai_employee_task(uuid,text,uuid,uuid) TO authenticated;
END $grants$;

COMMIT;
