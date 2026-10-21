-- Omniqora AI Workforce Phase 5A — human-approved sequential shadow teams.
-- No model calls, tool grants, customer-data retrieval or executable team queue.
BEGIN;

CREATE TABLE public.ai_workforce_shadow_teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 team_name text NOT NULL CHECK(length(btrim(team_name)) BETWEEN 3 AND 120),
 mission_purpose text NOT NULL CHECK(length(btrim(mission_purpose)) BETWEEN 12 AND 1200),
 status text NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','pending_review','approved_plan','paused','retired')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 last_edited_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 UNIQUE(id,tenant_id,product_key)
);
CREATE INDEX workforce_shadow_teams_scope_idx
 ON public.ai_workforce_shadow_teams(tenant_id,product_key,updated_at DESC);

CREATE TABLE public.ai_workforce_shadow_steps (
 team_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 8),
 employee_id uuid NOT NULL,
 step_role text NOT NULL CHECK(step_role IN('lead','analyst','researcher','reviewer','reporter')),
 instructions text NOT NULL CHECK(length(btrim(instructions)) BETWEEN 10 AND 1000),
 expected_output text NOT NULL CHECK(length(btrim(expected_output)) BETWEEN 10 AND 1000),
 execution_mode text NOT NULL DEFAULT 'shadow_only' CHECK(execution_mode='shadow_only'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(team_id,position),
 UNIQUE(team_id,employee_id),
 FOREIGN KEY(team_id,tenant_id,product_key)
  REFERENCES public.ai_workforce_shadow_teams(id,tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY(employee_id,tenant_id,product_key)
  REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX workforce_shadow_steps_scope_idx
 ON public.ai_workforce_shadow_steps(tenant_id,product_key,team_id,position);

CREATE TABLE public.ai_workforce_shadow_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 team_id uuid NOT NULL,
 event_key text NOT NULL CHECK(event_key IN
  ('created','plan_saved','review_requested','approved_plan',
   'returned','paused','resumed','retired','previewed')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 revision integer NOT NULL,
 note text CHECK(note IS NULL OR length(note)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(team_id,tenant_id,product_key)
  REFERENCES public.ai_workforce_shadow_teams(id,tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX workforce_shadow_events_scope_idx
 ON public.ai_workforce_shadow_events(tenant_id,product_key,team_id,created_at DESC);

DO $rls$ DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['ai_workforce_shadow_teams','ai_workforce_shadow_steps',
                           'ai_workforce_shadow_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tbl);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);
  EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
   public.is_platform_admin(auth.uid()) OR EXISTS(
     SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=%I.tenant_id
      AND m.user_id=auth.uid() AND m.role IN('owner','admin'))
  )$p$,'shadow team admin read '||tbl,tbl,tbl);
 END LOOP;
END $rls$;

CREATE FUNCTION public.create_ai_workforce_shadow_team(
 _tenant uuid,_product text,_name text,_purpose text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE team uuid;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 IF length(btrim(COALESCE(_name,''))) NOT BETWEEN 3 AND 120 OR
    length(btrim(COALESCE(_purpose,''))) NOT BETWEEN 12 AND 1200 THEN
  RAISE EXCEPTION 'Invalid AI team mission details';
 END IF;
 INSERT INTO public.ai_workforce_shadow_teams(
  tenant_id,product_key,team_name,mission_purpose,created_by,last_edited_by)
 VALUES(_tenant,_product,btrim(_name),btrim(_purpose),auth.uid(),auth.uid())
 RETURNING id INTO team;
 INSERT INTO public.ai_workforce_shadow_events(
  tenant_id,product_key,team_id,event_key,actor_id,revision)
 VALUES(_tenant,_product,team,'created',auth.uid(),0);
 RETURN team;
END $create$;

-- A sequential plan has a bounded, unambiguous order. Parallel execution,
-- dynamic dependency graphs, webhooks and model/tool permissions are absent.
CREATE FUNCTION public.save_ai_workforce_shadow_plan(
 _tenant uuid,_product text,_team uuid,_steps jsonb)
RETURNS public.ai_workforce_shadow_teams
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $save$
DECLARE t public.ai_workforce_shadow_teams;result public.ai_workforce_shadow_teams;
 item jsonb; position_no integer:=0; member_id uuid; member_status text;
 member_ids uuid[]:='{}'::uuid[]; r text; instruction text; output_text text;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT t FROM public.ai_workforce_shadow_teams
 WHERE id=_team AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF t.status='retired' THEN RAISE EXCEPTION 'Retired teams cannot be revised'; END IF;
 IF _steps IS NULL OR jsonb_typeof(_steps) IS DISTINCT FROM 'array' OR
    jsonb_array_length(_steps) NOT BETWEEN 2 AND 8 OR length(_steps::text)>20000 THEN
  RAISE EXCEPTION 'AI shadow plan must contain two to eight distinct members';
 END IF;
 -- Validate entire input BEFORE removing existing steps.
 FOR item IN SELECT value FROM jsonb_array_elements(_steps) LOOP
  position_no:=position_no+1;
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
   EXISTS(SELECT 1 FROM jsonb_object_keys(item) AS x(k)
    WHERE x.k NOT IN('employeeId','role','instructions','expectedOutput')) OR
   COALESCE(item->>'employeeId','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
   OR jsonb_typeof(item->'role') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'instructions') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'expectedOutput') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Unsupported or unbounded shadow team step';
  END IF;
  member_id:=(item->>'employeeId')::uuid;
  IF member_id=ANY(member_ids) THEN
   RAISE EXCEPTION 'Shadow team requires distinct AI employees';
  END IF;
  member_ids:=array_append(member_ids,member_id);
  r:=item->>'role';instruction:=btrim(item->>'instructions');
  output_text:=btrim(item->>'expectedOutput');
  IF r NOT IN('lead','analyst','researcher','reviewer','reporter') OR
    (position_no=1 AND r<>'lead') OR
    length(instruction) NOT BETWEEN 10 AND 1000 OR
    length(output_text) NOT BETWEEN 10 AND 1000 THEN
   RAISE EXCEPTION 'Invalid human-supervised team role or deliverable';
  END IF;
  SELECT status INTO member_status FROM public.ai_employees
   WHERE id=member_id AND tenant_id=_tenant AND product_key=_product;
  IF member_status IS DISTINCT FROM 'approved_configuration' THEN
   RAISE EXCEPTION 'AI team member must be an approved, unpaused employee configuration';
  END IF;
 END LOOP;
 DELETE FROM public.ai_workforce_shadow_steps WHERE team_id=t.id
  AND tenant_id=_tenant AND product_key=_product;
 position_no:=0;
 FOR item IN SELECT value FROM jsonb_array_elements(_steps) LOOP
  position_no:=position_no+1;
  INSERT INTO public.ai_workforce_shadow_steps(
   team_id,tenant_id,product_key,position,employee_id,
   step_role,instructions,expected_output)
  VALUES(t.id,_tenant,_product,position_no,(item->>'employeeId')::uuid,
   item->>'role',btrim(item->>'instructions'),btrim(item->>'expectedOutput'));
 END LOOP;
 UPDATE public.ai_workforce_shadow_teams SET revision=t.revision+1,status='draft',
  reviewed_by=NULL,reviewed_at=NULL,review_note=NULL,
  last_edited_by=auth.uid(),updated_at=now()
 WHERE id=t.id RETURNING * INTO result;
 INSERT INTO public.ai_workforce_shadow_events(
  tenant_id,product_key,team_id,event_key,actor_id,revision)
 VALUES(_tenant,_product,t.id,'plan_saved',auth.uid(),result.revision);
 RETURN result;
END $save$;

CREATE FUNCTION public.transition_ai_workforce_shadow_team(
 _tenant uuid,_product text,_team uuid,_action text,_note text DEFAULT NULL)
RETURNS public.ai_workforce_shadow_teams
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $transition$
DECLARE t public.ai_workforce_shadow_teams;result public.ai_workforce_shadow_teams;
 new_status text;event text;reviewer uuid;reviewed_time timestamptz;
 invalid_members integer;step_count integer;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT t FROM public.ai_workforce_shadow_teams
  WHERE id=_team AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF length(COALESCE(_note,''))>1000 THEN RAISE EXCEPTION 'Review note too long'; END IF;
 SELECT count(*) INTO step_count FROM public.ai_workforce_shadow_steps
 WHERE team_id=t.id AND tenant_id=_tenant AND product_key=_product;
 SELECT count(*) INTO invalid_members FROM public.ai_workforce_shadow_steps s
 JOIN public.ai_employees e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id
  AND e.product_key=s.product_key
 WHERE s.team_id=t.id AND s.tenant_id=_tenant AND s.product_key=_product
  AND e.status<>'approved_configuration';
 CASE _action
  WHEN 'submit' THEN
   IF t.status<>'draft' OR t.revision<1 OR
     step_count NOT BETWEEN 2 AND 8 OR invalid_members>0 THEN
    RAISE EXCEPTION 'Save an approved-member team plan before independent review';
   END IF;
   new_status:='pending_review';event:='review_requested';
  WHEN 'approve' THEN
   IF t.status<>'pending_review' OR step_count NOT BETWEEN 2 AND 8 OR invalid_members>0 OR
    auth.uid() IN(t.created_by,t.last_edited_by) THEN
    RAISE EXCEPTION 'Independent reviewer and current employee approvals required';
   END IF;
   new_status:='approved_plan';event:='approved_plan';
  WHEN 'return' THEN
   IF t.status<>'pending_review' OR auth.uid() IN(t.created_by,t.last_edited_by)
    OR length(btrim(COALESCE(_note,'')))<12 THEN
    RAISE EXCEPTION 'Independent correction reason required';
   END IF;
   new_status:='draft';event:='returned';
  WHEN 'pause' THEN
   IF t.status<>'approved_plan' THEN RAISE EXCEPTION 'Only approved team plans can pause'; END IF;
   new_status:='paused';event:='paused';
  WHEN 'resume' THEN
   IF t.status<>'paused' OR step_count NOT BETWEEN 2 AND 8 OR invalid_members>0 THEN
    RAISE EXCEPTION 'Cannot resume team with unapproved members';
   END IF;
   new_status:='approved_plan';event:='resumed';
  WHEN 'retire' THEN
   IF t.status='retired' THEN RAISE EXCEPTION 'Already retired'; END IF;
   new_status:='retired';event:='retired';
  ELSE RAISE EXCEPTION 'Unrecognised shadow team transition';
 END CASE;
 reviewer:=CASE WHEN _action='approve' THEN auth.uid()
  WHEN _action='return' THEN NULL ELSE t.reviewed_by END;
 reviewed_time:=CASE WHEN _action='approve' THEN now()
  WHEN _action='return' THEN NULL ELSE t.reviewed_at END;
 UPDATE public.ai_workforce_shadow_teams
 SET status=new_status,reviewed_by=reviewer,reviewed_at=reviewed_time,
 review_note=CASE WHEN _action IN('approve','return') THEN NULLIF(btrim(_note),'')
   ELSE review_note END,updated_at=now()
 WHERE id=t.id RETURNING * INTO result;
 INSERT INTO public.ai_workforce_shadow_events(
  tenant_id,product_key,team_id,event_key,actor_id,revision,note)
 VALUES(_tenant,_product,t.id,event,auth.uid(),t.revision,NULLIF(btrim(_note),''));
 RETURN result;
END $transition$;

CREATE FUNCTION public.preview_ai_workforce_shadow_team(
 _tenant uuid,_product text,_team uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $preview$
DECLARE t public.ai_workforce_shadow_teams;
 steps jsonb;inactive integer;res jsonb;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT t FROM public.ai_workforce_shadow_teams
 WHERE id=_team AND tenant_id=_tenant AND product_key=_product;
 SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
   'position',s.position,'role',s.step_role,'employeeId',s.employee_id,
   'employeeName',e.display_name,'expectedOutput',s.expected_output,
   'requiresHumanReview',true,'execute',false)
  ORDER BY s.position),'[]'::jsonb),
  count(*) FILTER(WHERE e.status<>'approved_configuration')
 INTO steps,inactive
 FROM public.ai_workforce_shadow_steps s
 JOIN public.ai_employees e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id
  AND e.product_key=s.product_key
 WHERE s.team_id=t.id AND s.tenant_id=_tenant AND s.product_key=_product;
 res:=jsonb_build_object(
  'teamId',t.id,'revision',t.revision,'status',t.status,
  'mode','sequential_shadow_only','canExecute',false,'modelCalls',0,
  'toolCalls',0,'customerActions',0,'scheduled',false,
  'stepCount',jsonb_array_length(steps),'inactiveMembers',inactive,
  'steps',steps,'humanReviewRequired',true);
 INSERT INTO public.ai_workforce_shadow_events(
  tenant_id,product_key,team_id,event_key,actor_id,revision)
 VALUES(_tenant,_product,t.id,'previewed',auth.uid(),t.revision);
 RETURN res;
END $preview$;

REVOKE ALL ON FUNCTION public.create_ai_workforce_shadow_team(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_ai_workforce_shadow_plan(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transition_ai_workforce_shadow_team(uuid,text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.preview_ai_workforce_shadow_team(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_ai_workforce_shadow_team(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_workforce_shadow_plan(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ai_workforce_shadow_team(uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_ai_workforce_shadow_team(uuid,text,uuid) TO authenticated;

COMMIT;
