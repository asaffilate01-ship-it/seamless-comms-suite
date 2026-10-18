-- Omniqora AI Workforce Phase 3: governed employee configurations only.
-- Deliberately no model calls, live MCP/OAuth links, executable schedules, or new run ledger.
BEGIN;

INSERT INTO public.service_catalogue
 (service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata)
VALUES
 ('omniqora.ai-workforce','Omniqora AI Workforce',
  'Tenant-scoped AI employee configuration and independent review; execution not enabled.',
  'ai','omniqora',true,'manual','beta',
  '{"release":"phase3","executionEnabled":false,"triggersEnabled":false}'::jsonb)
ON CONFLICT(service_key) DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES ('omniqora','omniqora.ai-workforce',false,false,'{"executionEnabled":false}'::jsonb)
ON CONFLICT(product_key,service_key) DO NOTHING;

CREATE TABLE public.ai_employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 blueprint_key text NOT NULL CHECK (blueprint_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
 display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 120),
 role_title text NOT NULL CHECK (length(btrim(role_title)) BETWEEN 3 AND 120),
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN ('draft','pending_review','approved_configuration','paused','retired')),
 profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(profile)='object'),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 last_edited_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,product_key)
   REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 UNIQUE(id,tenant_id,product_key)
);
CREATE INDEX ai_employees_scope_idx ON public.ai_employees(tenant_id,product_key,updated_at DESC);

CREATE TABLE public.ai_employee_revisions (
 employee_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 profile jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(employee_id,revision),
 FOREIGN KEY (employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX ai_employee_revisions_scope_idx ON public.ai_employee_revisions(tenant_id,product_key,employee_id,revision DESC);

CREATE TABLE public.ai_employee_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 event_key text NOT NULL CHECK(event_key IN
  ('created','profile_saved','review_requested','approved_configuration','returned_for_edit',
   'paused','resumed','retired','preview_created')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 note text CHECK(note IS NULL OR length(note)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX ai_employee_events_scope_idx ON public.ai_employee_audit_events(tenant_id,product_key,employee_id,created_at DESC);

CREATE TABLE public.ai_employee_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 product_key text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX ai_employee_previews_scope_idx ON public.ai_employee_previews(tenant_id,product_key,employee_id,created_at DESC);

-- New references on the canonical run ledger, never a competing execution ledger.
-- No Phase 3 path creates a model job or populates this field.
ALTER TABLE public.ai_agent_runs ADD COLUMN IF NOT EXISTS ai_employee_id uuid;
DO $constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_agent_runs_employee_scope_fk') THEN
  ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_employee_scope_fk
   FOREIGN KEY (ai_employee_id,tenant_id,product_key)
   REFERENCES public.ai_employees(id,tenant_id,product_key) ON DELETE SET NULL (ai_employee_id);
 END IF;
END $constraint$;
CREATE INDEX IF NOT EXISTS ai_agent_runs_employee_idx
 ON public.ai_agent_runs(tenant_id,product_key,ai_employee_id,created_at DESC)
 WHERE ai_employee_id IS NOT NULL;

-- Configuration is visible only to tenant owners/admins (not general users/agents).
-- Authenticated users have SELECT only; ALL state changes go through checked RPCs.
DO $security$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_employees','ai_employee_revisions',
                             'ai_employee_audit_events','ai_employee_previews'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
    public.is_platform_admin(auth.uid()) OR EXISTS(
      SELECT 1 FROM public.tenant_members m
      WHERE m.tenant_id=%I.tenant_id AND m.user_id=auth.uid()
        AND m.role IN ('owner','admin'))
  )$p$,'ai workforce admin read '||tab,tab,tab);
 END LOOP;
END $security$;

-- Fail-closed, server-derived tenant/product/role/entitlement guard.
-- Exposed to no browser caller, used only by SECURITY DEFINER mutations.
CREATE FUNCTION public.ai_workforce_require_admin(_tenant uuid,_product text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard$
DECLARE member_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT m.role::text INTO member_role FROM public.tenant_members m
 WHERE m.tenant_id=_tenant AND m.user_id=auth.uid();
 IF COALESCE(member_role,'') NOT IN ('owner','admin')
   AND NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'AI Workforce tenant administrator required';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant
     AND p.product_key=_product AND p.status='active') THEN
  RAISE EXCEPTION 'Active tenant product required';
 END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.ai-workforce') THEN
  RAISE EXCEPTION 'AI Workforce entitlement required';
 END IF;
END $guard$;

CREATE FUNCTION public.create_ai_employee_draft(
 _tenant uuid,_product text,_blueprint text,_name text,_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE result uuid;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 IF _blueprint IS NULL OR _blueprint !~ '^[a-z0-9][a-z0-9._-]{2,119}$'
   OR length(btrim(COALESCE(_name,''))) NOT BETWEEN 3 AND 120
   OR length(btrim(COALESCE(_role,''))) NOT BETWEEN 3 AND 120 THEN
  RAISE EXCEPTION 'Invalid AI employee draft';
 END IF;
 INSERT INTO public.ai_employees
  (tenant_id,product_key,blueprint_key,display_name,role_title,created_by,last_edited_by)
 VALUES (_tenant,_product,_blueprint,btrim(_name),btrim(_role),auth.uid(),auth.uid())
 RETURNING id INTO result;
 INSERT INTO public.ai_employee_audit_events
  (employee_id,tenant_id,product_key,event_key,actor_id)
 VALUES (result,_tenant,_product,'created',auth.uid());
 RETURN result;
END $create$;

-- Store only versioned requests for capabilities and schedules.
-- Their existence NEVER grants a tool, installs an MCP server or enables a trigger.
CREATE FUNCTION public.save_ai_employee_profile(
 _tenant uuid,_product text,_employee uuid,_name text,_role text,_profile jsonb)
RETURNS public.ai_employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $save$
DECLARE e public.ai_employees; ret public.ai_employees;
 p jsonb; elem jsonb; k text; trigger_type text; trigger_value text;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
 WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF e.status='retired' THEN RAISE EXCEPTION 'Retired AI employees cannot be edited'; END IF;
 IF length(btrim(COALESCE(_name,''))) NOT BETWEEN 3 AND 120 OR
    length(btrim(COALESCE(_role,''))) NOT BETWEEN 3 AND 120 THEN
  RAISE EXCEPTION 'Invalid AI employee name or role';
 END IF;
 IF _profile IS NULL OR jsonb_typeof(_profile)<>'object' OR
    length(_profile::text)>30000 THEN
  RAISE EXCEPTION 'Invalid AI employee profile';
 END IF;
 IF jsonb_typeof(_profile->'goal') IS DISTINCT FROM 'string'
    OR length(btrim(_profile->>'goal')) NOT BETWEEN 10 AND 1500
    OR jsonb_typeof(_profile->'businessContext') IS DISTINCT FROM 'string'
    OR length(_profile->>'businessContext')>6000
    OR jsonb_typeof(_profile->'instructions') IS DISTINCT FROM 'string'
    OR length(_profile->>'instructions')>6000 THEN
  RAISE EXCEPTION 'Invalid employee goal, context or instructions';
 END IF;
 FOREACH k IN ARRAY ARRAY['tasks','sopRefs','capabilities'] LOOP
  IF jsonb_typeof(_profile->k) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Invalid AI employee profile list: %',k;
  END IF;
 END LOOP;
 IF jsonb_array_length(_profile->'tasks') NOT BETWEEN 1 AND 20 OR
    jsonb_array_length(_profile->'sopRefs')>20 OR
    jsonb_array_length(_profile->'capabilities')>30 THEN
  RAISE EXCEPTION 'AI employee profile item limit exceeded';
 END IF;
 FOR elem IN SELECT value FROM jsonb_array_elements(_profile->'tasks') LOOP
  IF jsonb_typeof(elem)<>'string' OR length(btrim(elem #>> '{}')) NOT BETWEEN 4 AND 350 THEN
   RAISE EXCEPTION 'Invalid AI employee task';
  END IF;
 END LOOP;
 FOR elem IN SELECT value FROM jsonb_array_elements(_profile->'sopRefs') LOOP
  IF jsonb_typeof(elem)<>'string' OR length(elem #>> '{}') NOT BETWEEN 3 AND 300 THEN
   RAISE EXCEPTION 'Invalid SOP reference';
  END IF;
 END LOOP;
 FOR elem IN SELECT value FROM jsonb_array_elements(_profile->'capabilities') LOOP
  IF jsonb_typeof(elem)<>'string' OR (elem #>> '{}') !~ '^[a-z0-9][a-z0-9._-]{1,99}$' THEN
   RAISE EXCEPTION 'Invalid requested capability';
  END IF;
 END LOOP;
 IF jsonb_typeof(_profile->'trigger') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid proposed trigger';
 END IF;
 trigger_type:=_profile->'trigger'->>'type';
 trigger_value:=COALESCE(_profile->'trigger'->>'value','');
 IF trigger_type IS NULL OR trigger_type NOT IN ('manual','daily','weekly','event') OR length(trigger_value)>120 THEN
  RAISE EXCEPTION 'Unsupported proposed trigger';
 END IF;
 IF trigger_type='event' AND trigger_value !~ '^[a-z0-9][a-z0-9._-]{2,119}$' THEN
  RAISE EXCEPTION 'Invalid event trigger key';
 END IF;
 -- Reject attempts to smuggle arbitrary new keys or an enabled action in JSON.
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_profile) AS keys(field_name)
   WHERE field_name NOT IN('goal','tasks','businessContext','instructions',
                    'sopRefs','capabilities','trigger')) THEN
  RAISE EXCEPTION 'Unsupported AI employee profile field';
 END IF;
 p:=jsonb_build_object(
  'goal',btrim(_profile->>'goal'),
  'tasks',_profile->'tasks',
  'businessContext',_profile->>'businessContext',
  'instructions',_profile->>'instructions',
  'sopRefs',_profile->'sopRefs',
  'capabilities',_profile->'capabilities',
  'trigger',jsonb_build_object('type',trigger_type,'value',trigger_value,'enabled',false)
 );
 UPDATE public.ai_employees
 SET display_name=btrim(_name),role_title=btrim(_role),profile=p,
  revision=e.revision+1,status='draft',reviewed_by=NULL,reviewed_at=NULL,
  review_note=NULL,last_edited_by=auth.uid(),updated_at=now()
 WHERE id=e.id RETURNING * INTO ret;
 INSERT INTO public.ai_employee_revisions(employee_id,tenant_id,product_key,revision,profile,created_by)
 VALUES (ret.id,_tenant,_product,ret.revision,p,auth.uid());
 INSERT INTO public.ai_employee_audit_events
  (employee_id,tenant_id,product_key,event_key,actor_id,revision)
 VALUES (ret.id,_tenant,_product,'profile_saved',auth.uid(),ret.revision);
 RETURN ret;
END $save$;

CREATE FUNCTION public.transition_ai_employee(
 _tenant uuid,_product text,_employee uuid,_action text,_note text DEFAULT NULL)
RETURNS public.ai_employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $transition$
DECLARE e public.ai_employees; ret public.ai_employees; target text; event text;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
 WHERE id=_employee AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF length(COALESCE(_note,''))>1000 THEN RAISE EXCEPTION 'Review note too long'; END IF;
 CASE _action
  WHEN 'submit' THEN
   IF e.status<>'draft' OR e.revision=0 THEN RAISE EXCEPTION 'Save a draft before review'; END IF;
   target:='pending_review'; event:='review_requested';
  WHEN 'approve' THEN
   IF e.status<>'pending_review' OR
      auth.uid() IN (e.created_by,e.last_edited_by) THEN
    RAISE EXCEPTION 'Independent reviewer required';
   END IF;
   target:='approved_configuration'; event:='approved_configuration';
  WHEN 'reject' THEN
   IF e.status<>'pending_review' OR
      auth.uid() IN (e.created_by,e.last_edited_by) OR
      length(btrim(COALESCE(_note,'')))<12 THEN
    RAISE EXCEPTION 'Independent return-for-edit review with reason required';
   END IF;
   target:='draft'; event:='returned_for_edit';
  WHEN 'pause' THEN
   IF e.status<>'approved_configuration' THEN RAISE EXCEPTION 'Only approved configurations can pause'; END IF;
   target:='paused'; event:='paused';
  WHEN 'resume' THEN
   IF e.status<>'paused' THEN RAISE EXCEPTION 'Only paused configurations can resume'; END IF;
   target:='approved_configuration'; event:='resumed';
  WHEN 'retire' THEN
   IF e.status='retired' THEN RAISE EXCEPTION 'Already retired'; END IF;
   target:='retired'; event:='retired';
  ELSE RAISE EXCEPTION 'Unknown AI employee transition';
 END CASE;
 UPDATE public.ai_employees
 SET status=target,
     reviewed_by=CASE WHEN _action='approve' THEN auth.uid()
       WHEN _action='reject' THEN NULL ELSE reviewed_by END,
     reviewed_at=CASE WHEN _action='approve' THEN now()
       WHEN _action='reject' THEN NULL ELSE reviewed_at END,
     review_note=CASE WHEN _action IN('approve','reject') THEN NULLIF(btrim(_note),'')
       ELSE review_note END,
     updated_at=now()
 WHERE id=e.id RETURNING * INTO ret;
 INSERT INTO public.ai_employee_audit_events
  (employee_id,tenant_id,product_key,event_key,actor_id,revision,note)
 VALUES (e.id,_tenant,_product,event,auth.uid(),e.revision,NULLIF(btrim(_note),''));
 RETURN ret;
END $transition$;

-- Deterministic configuration preview: NO LLM, NO job, NO MCP, NO outbound requests.
CREATE FUNCTION public.preview_ai_employee(_tenant uuid,_product text,_employee uuid)
RETURNS public.ai_employee_previews
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $preview$
DECLARE e public.ai_employees; result public.ai_employee_previews; checks jsonb;
BEGIN
 PERFORM public.ai_workforce_require_admin(_tenant,_product);
 SELECT * INTO STRICT e FROM public.ai_employees
 WHERE id=_employee AND tenant_id=_tenant AND product_key=_product;
 IF e.revision=0 THEN RAISE EXCEPTION 'Save the employee profile first'; END IF;
 checks:=jsonb_build_array(
  jsonb_build_object('key','goal_present','passed',
    length(btrim(COALESCE(e.profile->>'goal','')))>=10),
  jsonb_build_object('key','tasks_present','passed',
    jsonb_array_length(COALESCE(e.profile->'tasks','[]'::jsonb))>0),
  jsonb_build_object('key','instructions_recorded','passed',
    length(btrim(COALESCE(e.profile->>'instructions','')))>0),
  jsonb_build_object('key','independent_review','passed',e.status IN('approved_configuration','paused')),
  jsonb_build_object('key','live_connectors_verified','passed',false),
  jsonb_build_object('key','worker_execution_verified','passed',false)
 );
 INSERT INTO public.ai_employee_previews
  (employee_id,tenant_id,product_key,revision,result,created_by)
 VALUES (e.id,_tenant,_product,e.revision,jsonb_build_object(
  'mode','configuration_preview_only','executed',false,'modelCalls',0,
  'toolCalls',0,'scheduleEnabled',false,'canExecute',false,
  'checks',checks,'reviewStatus',e.status),auth.uid())
 RETURNING * INTO result;
 INSERT INTO public.ai_employee_audit_events
  (employee_id,tenant_id,product_key,event_key,actor_id,revision)
 VALUES (e.id,_tenant,_product,'preview_created',auth.uid(),e.revision);
 RETURN result;
END $preview$;

REVOKE ALL ON FUNCTION public.ai_workforce_require_admin(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_workforce_require_admin(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.create_ai_employee_draft(uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_ai_employee_profile(uuid,text,uuid,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transition_ai_employee(uuid,text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.preview_ai_employee(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_ai_employee_draft(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_employee_profile(uuid,text,uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ai_employee(uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_ai_employee(uuid,text,uuid) TO authenticated;

COMMIT;
