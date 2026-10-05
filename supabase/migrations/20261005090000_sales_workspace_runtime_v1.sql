BEGIN;

-- Omniqora Sales, controlled pilot. Extends the existing CRM/Growth tables.
-- This migration does not send messages, call providers, enable entitlements,
-- provision tenants, or activate any production campaign.
ALTER TABLE public.sales_sequences
 ADD COLUMN IF NOT EXISTS runtime_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.sales_sequence_enrolments
 ADD COLUMN IF NOT EXISTS runtime_version integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS steps_snapshot jsonb,
 ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS stop_reason text;
CREATE UNIQUE INDEX sales_v1_enrolment_identity ON public.sales_sequence_enrolments(tenant_id,sequence_id,person_id) WHERE runtime_version=1;
CREATE UNIQUE INDEX IF NOT EXISTS sales_v1_enrolment_tenant_id ON public.sales_sequence_enrolments(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_v1_person_tenant_id ON public.crm_people(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_v1_task_tenant_id ON public.crm_tasks(tenant_id,id);
CREATE INDEX sales_v1_due ON public.sales_sequence_enrolments(tenant_id,next_action_at) WHERE runtime_version=1 AND status='active';

CREATE TABLE public.sales_sequence_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 enrolment_id uuid NOT NULL,
 step_index integer NOT NULL CHECK(step_index>=0),
 kind text NOT NULL CHECK(kind IN('call','task','email','whatsapp','sms')),
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 subject text,
 status text NOT NULL CHECK(status IN('manual_open','pending_review','approved_blocked','completed','cancelled')),
 task_id uuid,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 completed_at timestamptz,
 completion_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrolment_id,step_index),
 FOREIGN KEY(tenant_id,enrolment_id) REFERENCES public.sales_sequence_enrolments(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,task_id) REFERENCES public.crm_tasks(tenant_id,id) ON DELETE RESTRICT,
 CHECK((kind IN('call','task') AND status IN('manual_open','completed','cancelled')) OR
       (kind IN('email','whatsapp','sms') AND status IN('pending_review','approved_blocked','cancelled')))
);
CREATE INDEX sales_v1_action_queue ON public.sales_sequence_actions(tenant_id,status,created_at);

-- An opt-out is tenant-wide across portfolio products. Editing CRM consent does
-- not remove it. A reviewed, evidence-backed re-permission workflow is future work.
CREATE TABLE public.sales_contact_suppressions (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 person_id uuid NOT NULL,
 reason text NOT NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,person_id),
 FOREIGN KEY(tenant_id,person_id) REFERENCES public.crm_people(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE public.sales_runtime_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 person_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN('replied','meeting_booked','opt_out')),
 source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 180),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_key),
 FOREIGN KEY(tenant_id,person_id) REFERENCES public.crm_people(tenant_id,id) ON DELETE CASCADE
);

CREATE FUNCTION public.sales_v1_access(_tenant uuid,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(auth.uid() IS NOT NULL
  AND public.has_tenant_entitlement(_tenant,'omniqora.sales-engagement')
  AND (public.is_platform_admin(auth.uid()) OR
       CASE WHEN _write THEN public.can_write(_tenant,auth.uid())
            ELSE public.is_tenant_member(_tenant,auth.uid()) END),false)
$$;
CREATE FUNCTION public.sales_v1_assert_write(_tenant uuid,_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sales_v1_access(_tenant,true) THEN RAISE EXCEPTION 'Sales access or entitlement required' USING ERRCODE='42501'; END IF;
 IF _admin AND NOT (public.is_platform_admin(auth.uid()) OR EXISTS(
  SELECT 1 FROM public.tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid() AND role IN('owner','admin')
 )) THEN RAISE EXCEPTION 'Sales administrator required' USING ERRCODE='42501'; END IF;
 -- Serialise managed mutations per tenant, including enrollment vs opt-out.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text,7105));
END $$;

CREATE FUNCTION public.sales_v1_validate_steps(_steps jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF jsonb_typeof(_steps) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Steps must be an array'; END IF;
 IF jsonb_array_length(_steps) NOT BETWEEN 1 AND 30 OR pg_column_size(_steps)>200000 THEN RAISE EXCEPTION 'Use 1 to 30 bounded steps'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(_steps) LOOP
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR COALESCE(s->>'kind','') NOT IN('call','task','email','whatsapp','sms') THEN RAISE EXCEPTION 'Unsupported step kind'; END IF;
  IF jsonb_typeof(s->'title') IS DISTINCT FROM 'string' OR length(btrim(s->>'title')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Step title required'; END IF;
  IF jsonb_typeof(s->'delayMinutes') IS DISTINCT FROM 'number' OR COALESCE(s->>'delayMinutes','') !~ '^(0|[1-9][0-9]{0,5})$' THEN RAISE EXCEPTION 'Delay must be a nonnegative whole number of minutes'; END IF;
  IF (s->>'delayMinutes')::integer>525600 THEN RAISE EXCEPTION 'Step delay is too large'; END IF;
  IF s ? 'body' AND (jsonb_typeof(s->'body') IS DISTINCT FROM 'string' OR length(s->>'body')>5000) THEN RAISE EXCEPTION 'Invalid step body'; END IF;
  IF s ? 'subject' AND (jsonb_typeof(s->'subject') IS DISTINCT FROM 'string' OR length(s->>'subject')>300) THEN RAISE EXCEPTION 'Invalid subject'; END IF;
  IF s->>'kind' IN('email','whatsapp','sms') AND length(btrim(COALESCE(s->>'body','')))=0 THEN RAISE EXCEPTION 'Message draft body required'; END IF;
 END LOOP;
END $$;

-- Existing legacy rows retain their existing policies. Managed v1 rows are
-- mutable ONLY through checked RPCs; a REST client cannot flip status, bypass
-- approval, clear an opt-out, replace a snapshot, or downgrade runtime_version.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sales_sequences','sales_sequence_enrolments'] LOOP
  EXECUTE format('CREATE POLICY sales_v1_read_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(runtime_version=0 OR public.sales_v1_access(tenant_id,false))',t);
  EXECUTE format('CREATE POLICY sales_v1_insert_gate ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(runtime_version=0)',t);
  EXECUTE format('CREATE POLICY sales_v1_update_gate ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(runtime_version=0) WITH CHECK(runtime_version=0)',t);
  EXECUTE format('CREATE POLICY sales_v1_delete_gate ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(runtime_version=0)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['sales_sequence_actions','sales_contact_suppressions','sales_runtime_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY sales_v1_read ON public.%I FOR SELECT TO authenticated USING(public.sales_v1_access(tenant_id,false))',t);
 END LOOP;
END $$;

CREATE FUNCTION public.sales_v1_create_sequence(_tenant uuid,_name text,_product text,_steps jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Sequence name required'; END IF;
 PERFORM public.sales_v1_validate_steps(_steps);
 IF _product IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key=_product AND status='active') THEN RAISE EXCEPTION 'Active product required'; END IF;
 INSERT INTO public.sales_sequences(tenant_id,product_key,name,status,steps,runtime_version)
 VALUES(_tenant,_product,btrim(_name),'draft',_steps,1) RETURNING id INTO result;
 RETURN result;
END $$;

-- Internal only. Caller holds the tenant lock. Cancels linked open CRM tasks.
CREATE FUNCTION public.sales_v1_cancel_enrolment(_tenant uuid,_id uuid,_status text,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.sales_sequence_enrolments SET status=_status,stop_reason=_reason,next_action_at=NULL,updated_at=now()
 WHERE id=_id AND tenant_id=_tenant AND runtime_version=1 AND status IN('active','paused');
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.crm_tasks SET status='cancelled',updated_at=now()
 WHERE tenant_id=_tenant AND status IN('open','in_progress') AND id IN(
  SELECT task_id FROM public.sales_sequence_actions WHERE tenant_id=_tenant AND enrolment_id=_id AND status='manual_open');
 UPDATE public.sales_sequence_actions SET status='cancelled',updated_at=now()
 WHERE tenant_id=_tenant AND enrolment_id=_id AND status IN('manual_open','pending_review','approved_blocked');
END $$;

CREATE FUNCTION public.sales_v1_sequence_status(_tenant uuid,_sequence uuid,_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sales_sequences; e record;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant,_status='active');
 IF _status IS NULL OR _status NOT IN('active','paused','archived') THEN RAISE EXCEPTION 'Unsupported sequence status'; END IF;
 SELECT * INTO s FROM public.sales_sequences WHERE id=_sequence AND tenant_id=_tenant AND runtime_version=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed sequence not found'; END IF;
 IF s.status='archived' AND _status<>'archived' THEN RAISE EXCEPTION 'Archived sequences cannot restart'; END IF;
 IF _status='active' THEN PERFORM public.sales_v1_validate_steps(s.steps); END IF;
 UPDATE public.sales_sequences SET status=_status,updated_at=now() WHERE id=s.id;
 IF _status='archived' THEN
  FOR e IN SELECT id FROM public.sales_sequence_enrolments WHERE tenant_id=_tenant AND sequence_id=s.id AND runtime_version=1 AND status IN('active','paused') LOOP
   PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,'cancelled','sequence_archived');
  END LOOP;
 END IF;
END $$;

CREATE FUNCTION public.sales_v1_enrol(_tenant uuid,_sequence uuid,_person uuid,_lead uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sales_sequences; result uuid; l public.crm_leads;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 SELECT * INTO s FROM public.sales_sequences WHERE id=_sequence AND tenant_id=_tenant AND runtime_version=1 AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'An active managed sequence is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crm_people WHERE tenant_id=_tenant AND id=_person) THEN RAISE EXCEPTION 'CRM person not found in tenant'; END IF;
 IF _lead IS NOT NULL THEN
  SELECT * INTO l FROM public.crm_leads WHERE id=_lead AND tenant_id=_tenant;
  IF NOT FOUND OR l.person_id IS DISTINCT FROM _person THEN RAISE EXCEPTION 'Lead must belong to this tenant and person'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.sales_contact_suppressions WHERE tenant_id=_tenant AND person_id=_person) THEN RAISE EXCEPTION 'Contact is suppressed'; END IF;
 -- A repeated request returns the same enrollment, including terminal records.
 -- It NEVER restarts a replied, completed, cancelled or failed enrollment.
 SELECT id INTO result FROM public.sales_sequence_enrolments WHERE tenant_id=_tenant AND sequence_id=s.id AND person_id=_person AND runtime_version=1;
 IF FOUND THEN RETURN result; END IF;
 PERFORM public.sales_v1_validate_steps(s.steps);
 INSERT INTO public.sales_sequence_enrolments(tenant_id,sequence_id,lead_id,person_id,status,current_step,next_action_at,runtime_version,steps_snapshot,owner_user_id)
 VALUES(_tenant,s.id,_lead,_person,'active',0,now()+make_interval(mins=>(s.steps->0->>'delayMinutes')::integer),1,s.steps,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;

-- Internal progression is only for an actually completed manual task. There is
-- deliberately no public API that can mark an email/WhatsApp/SMS draft as sent.
CREATE FUNCTION public.sales_v1_finish_manual(_tenant uuid,_action uuid,_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.sales_sequence_actions; e public.sales_sequence_enrolments; n integer;
BEGIN
 SELECT * INTO a FROM public.sales_sequence_actions WHERE id=_action AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Action not found'; END IF;
 IF a.status='completed' THEN RETURN; END IF;
 IF a.kind NOT IN('call','task') OR a.status<>'manual_open' THEN RAISE EXCEPTION 'Only open manual actions can complete'; END IF;
 SELECT * INTO e FROM public.sales_sequence_enrolments WHERE id=a.enrolment_id AND tenant_id=_tenant AND runtime_version=1 FOR UPDATE;
 IF NOT FOUND OR e.status NOT IN('active','paused') OR e.current_step<>a.step_index THEN RAISE EXCEPTION 'Enrollment is no longer actionable'; END IF;
 IF _note IS NULL OR length(btrim(_note)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Completion note required'; END IF;
 UPDATE public.sales_sequence_actions SET status='completed',completion_note=_note,completed_at=now(),updated_at=now() WHERE id=a.id;
 UPDATE public.crm_tasks SET status='completed',updated_at=now() WHERE id=a.task_id AND tenant_id=_tenant;
 n:=e.current_step+1;
 UPDATE public.sales_sequence_enrolments SET current_step=n,
  status=CASE WHEN n>=jsonb_array_length(e.steps_snapshot) THEN 'completed' ELSE e.status END,
  next_action_at=CASE WHEN n>=jsonb_array_length(e.steps_snapshot) THEN NULL ELSE now()+make_interval(mins=>(e.steps_snapshot->n->>'delayMinutes')::integer) END,
  updated_at=now() WHERE id=e.id;
END $$;

CREATE FUNCTION public.sales_v1_prepare_due(_tenant uuid,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e record; a public.sales_sequence_actions; s jsonb; task uuid; n integer:=0; synced integer:=0; ts text;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Batch limit must be 1 to 100'; END IF;
 FOR e IN SELECT en.*,seq.product_key FROM public.sales_sequence_enrolments en
  JOIN public.sales_sequences seq ON seq.id=en.sequence_id AND seq.tenant_id=en.tenant_id
  WHERE en.tenant_id=_tenant AND en.runtime_version=1 AND en.status='active' AND seq.status='active'
   AND en.next_action_at<=now()
  ORDER BY en.next_action_at,en.id LIMIT _limit FOR UPDATE OF en SKIP LOCKED LOOP
  IF EXISTS(SELECT 1 FROM public.sales_contact_suppressions WHERE tenant_id=_tenant AND person_id=e.person_id) THEN
   PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,'cancelled','opt_out'); CONTINUE;
  END IF;
  SELECT * INTO a FROM public.sales_sequence_actions WHERE enrolment_id=e.id AND step_index=e.current_step;
  IF FOUND THEN
   IF a.status='manual_open' AND a.task_id IS NOT NULL THEN
    SELECT status INTO ts FROM public.crm_tasks WHERE id=a.task_id AND tenant_id=_tenant;
    IF ts='completed' THEN
     PERFORM public.sales_v1_finish_manual(_tenant,a.id,'Completed in CRM; reconciled by sales queue'); synced:=synced+1;
    ELSIF ts='cancelled' THEN
     PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,'cancelled','crm_task_cancelled');
    END IF;
   END IF;
   CONTINUE;
  END IF;
  s:=e.steps_snapshot->e.current_step;
  IF s IS NULL THEN RAISE EXCEPTION 'Invalid enrollment snapshot'; END IF;
  task:=NULL;
  IF s->>'kind' IN('call','task') THEN
   INSERT INTO public.crm_tasks(tenant_id,title,description,due_at,assignee_user_id,related_type,related_id,source_product_key,external_ref,created_by)
   VALUES(_tenant,s->>'title',COALESCE(s->>'body',''),e.next_action_at,e.owner_user_id,'person',e.person_id::text,e.product_key,
    'sales-v1:'||e.id::text||':'||e.current_step::text,auth.uid()) RETURNING id INTO task;
  END IF;
  INSERT INTO public.sales_sequence_actions(tenant_id,enrolment_id,step_index,kind,title,body,subject,status,task_id,created_by)
  VALUES(_tenant,e.id,e.current_step,s->>'kind',s->>'title',COALESCE(s->>'body',''),s->>'subject',
   CASE WHEN s->>'kind' IN('call','task') THEN 'manual_open' ELSE 'pending_review' END,task,auth.uid());
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('prepared',n,'reconciled',synced,'deliveryMode','review_only');
END $$;

CREATE FUNCTION public.sales_v1_complete_action(_tenant uuid,_action uuid,_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 PERFORM public.sales_v1_finish_manual(_tenant,_action,_note);
END $$;
CREATE FUNCTION public.sales_v1_approve_content(_tenant uuid,_action uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.sales_sequence_actions;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant,true);
 SELECT * INTO a FROM public.sales_sequence_actions WHERE id=_action AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR a.kind NOT IN('email','whatsapp','sms') OR a.status NOT IN('pending_review','approved_blocked') THEN RAISE EXCEPTION 'Reviewable message draft not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sales_sequence_enrolments en JOIN public.sales_sequences seq ON seq.id=en.sequence_id AND seq.tenant_id=en.tenant_id
  WHERE en.id=a.enrolment_id AND en.tenant_id=_tenant AND en.status='active' AND seq.status='active' AND en.current_step=a.step_index
  AND NOT EXISTS(SELECT 1 FROM public.sales_contact_suppressions x WHERE x.tenant_id=en.tenant_id AND x.person_id=en.person_id))
 THEN RAISE EXCEPTION 'Enrollment is paused, stopped or suppressed'; END IF;
 IF a.status='approved_blocked' THEN RETURN; END IF;
 UPDATE public.sales_sequence_actions SET status='approved_blocked',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=a.id;
 -- Content review is not consent, channel-policy approval or provider delivery.
END $$;

CREATE FUNCTION public.sales_v1_control_enrolment(_tenant uuid,_enrolment uuid,_command text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sales_sequence_enrolments;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 IF _command IS NULL OR _command NOT IN('pause','resume','cancel') THEN RAISE EXCEPTION 'Unsupported command'; END IF;
 SELECT * INTO e FROM public.sales_sequence_enrolments WHERE tenant_id=_tenant AND id=_enrolment AND runtime_version=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment not found'; END IF;
 IF e.status NOT IN('active','paused') THEN RAISE EXCEPTION 'Terminal enrollments cannot restart'; END IF;
 IF _command='cancel' THEN PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,'cancelled','manual_cancel'); RETURN; END IF;
 IF _command='resume' AND (EXISTS(SELECT 1 FROM public.sales_contact_suppressions WHERE tenant_id=_tenant AND person_id=e.person_id)
  OR NOT EXISTS(SELECT 1 FROM public.sales_sequences WHERE id=e.sequence_id AND tenant_id=_tenant AND status='active')) THEN RAISE EXCEPTION 'Sequence inactive or contact suppressed'; END IF;
 UPDATE public.sales_sequence_enrolments SET status=CASE WHEN _command='pause' THEN 'paused' ELSE 'active' END,updated_at=now() WHERE id=e.id;
END $$;

-- Internal outcome ingress; trusted adapters must authenticate events before
-- calling a checked public entry point. The UI entry point records MANUAL facts.
CREATE FUNCTION public.sales_v1_stop_person(_tenant uuid,_person uuid,_outcome text,_key text,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.sales_runtime_events; e record; stopped integer:=0;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text,7105));
 IF _outcome IS NULL OR _outcome NOT IN('replied','meeting_booked','opt_out') THEN RAISE EXCEPTION 'Unsupported outcome'; END IF;
 IF _key IS NULL OR length(_key) NOT BETWEEN 1 AND 180 OR _note IS NULL OR length(_note)>1000 THEN RAISE EXCEPTION 'Invalid outcome evidence'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crm_people WHERE tenant_id=_tenant AND id=_person) THEN RAISE EXCEPTION 'CRM person not found in tenant'; END IF;
 SELECT * INTO prior FROM public.sales_runtime_events WHERE tenant_id=_tenant AND source_key=_key;
 IF FOUND THEN
  IF prior.person_id IS DISTINCT FROM _person OR prior.event_type IS DISTINCT FROM _outcome OR prior.note IS DISTINCT FROM _note THEN RAISE EXCEPTION 'Idempotency key already used for another outcome'; END IF;
  RETURN jsonb_build_object('stopped',0,'replayed',true);
 END IF;
 INSERT INTO public.sales_runtime_events(tenant_id,person_id,event_type,source_key,note,actor_user_id) VALUES(_tenant,_person,_outcome,_key,_note,auth.uid());
 IF _outcome='opt_out' THEN
  INSERT INTO public.sales_contact_suppressions(tenant_id,person_id,reason,created_by) VALUES(_tenant,_person,_note,auth.uid()) ON CONFLICT(tenant_id,person_id) DO NOTHING;
 END IF;
 FOR e IN SELECT id FROM public.sales_sequence_enrolments WHERE tenant_id=_tenant AND person_id=_person AND runtime_version=1 AND status IN('active','paused') LOOP
  PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,CASE WHEN _outcome='replied' THEN 'replied' ELSE 'cancelled' END,_outcome); stopped:=stopped+1;
 END LOOP;
 RETURN jsonb_build_object('stopped',stopped,'replayed',false);
END $$;
CREATE FUNCTION public.sales_v1_record_outcome(_tenant uuid,_person uuid,_outcome text,_key text,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 IF _note IS NULL OR length(btrim(_note))=0 THEN RAISE EXCEPTION 'Record the source of this manual outcome'; END IF;
 RETURN public.sales_v1_stop_person(_tenant,_person,_outcome,'manual:'||_key,_note);
END $$;

-- A scheduled sales-meeting RECORD stops pending cadences. This does not create
-- a calendar event or claim calendar sync. Legacy company-only meetings are kept.
CREATE FUNCTION public.sales_v1_meeting_stop() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person uuid;
BEGIN
 IF NEW.status<>'scheduled' THEN RETURN NEW; END IF;
 person:=NEW.person_id;
 IF NEW.lead_id IS NOT NULL THEN
  SELECT person_id INTO person FROM public.crm_leads WHERE id=NEW.lead_id AND tenant_id=NEW.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting lead not found in tenant'; END IF;
  IF NEW.person_id IS NOT NULL AND person IS DISTINCT FROM NEW.person_id THEN RAISE EXCEPTION 'Meeting lead and person mismatch'; END IF;
 END IF;
 IF person IS NOT NULL THEN
  PERFORM public.sales_v1_stop_person(NEW.tenant_id,person,'meeting_booked','meeting:'||NEW.id::text||':'||person::text,'Scheduled sales meeting record');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_v1_meeting_stop AFTER INSERT OR UPDATE OF status,person_id,lead_id ON public.sales_meetings
 FOR EACH ROW EXECUTE FUNCTION public.sales_v1_meeting_stop();

-- Add an existing CRM person to a list with repeat-safe, explainable manual
-- scoring. This is not AI scoring and does not alter unrelated legacy members.
CREATE FUNCTION public.sales_v1_save_prospect(_tenant uuid,_list uuid,_person uuid,_fit integer,_intent integer,_engagement integer,_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; total numeric;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 IF NOT EXISTS(SELECT 1 FROM public.sales_prospect_lists WHERE id=_list AND tenant_id=_tenant AND status='active') THEN RAISE EXCEPTION 'Active list not found in tenant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crm_people WHERE id=_person AND tenant_id=_tenant) THEN RAISE EXCEPTION 'CRM person not found in tenant'; END IF;
 IF _fit IS NULL OR _intent IS NULL OR _engagement IS NULL OR _fit NOT BETWEEN 0 AND 100 OR _intent NOT BETWEEN 0 AND 100 OR _engagement NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Scores must be 0 to 100'; END IF;
 IF _reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Scoring evidence required'; END IF;
 total:=round((_fit+_intent+_engagement)::numeric/3,2);
 SELECT id INTO result FROM public.sales_prospect_members WHERE tenant_id=_tenant AND list_id=_list AND person_id=_person ORDER BY created_at,id LIMIT 1;
 IF FOUND THEN
  UPDATE public.sales_prospect_members SET fit_score=_fit,intent_score=_intent,engagement_score=_engagement,total_score=total,
   score_reasons=jsonb_build_array(jsonb_build_object('source','manual_review','reason',_reason,'reviewer',auth.uid())),updated_at=now() WHERE id=result;
 ELSE
  INSERT INTO public.sales_prospect_members(tenant_id,list_id,person_id,fit_score,intent_score,engagement_score,total_score,score_reasons)
  VALUES(_tenant,_list,_person,_fit,_intent,_engagement,total,jsonb_build_array(jsonb_build_object('source','manual_review','reason',_reason,'reviewer',auth.uid()))) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

-- Revoke PostgreSQL's default PUBLIC execution on every new helper and RPC.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'sales_v1_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname IN('sales_v1_access','sales_v1_create_sequence','sales_v1_sequence_status','sales_v1_enrol','sales_v1_prepare_due','sales_v1_complete_action','sales_v1_approve_content','sales_v1_control_enrolment','sales_v1_record_outcome','sales_v1_save_prospect') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
  END IF;
 END LOOP;
END $$;
COMMIT;
