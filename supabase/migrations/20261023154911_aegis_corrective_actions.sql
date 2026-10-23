BEGIN;
CREATE TABLE public.aegis_corrective_actions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),report_id uuid NOT NULL,check_index integer NOT NULL CHECK(check_index BETWEEN 0 AND 29),
 assignee_id uuid NOT NULL,due_on date NOT NULL CHECK(isfinite(due_on)),priority text NOT NULL CHECK(priority IN ('normal','high','critical')),
 stage text NOT NULL DEFAULT 'open' CHECK(stage IN ('open','in_progress','submitted','closed')),
 evidence text NOT NULL DEFAULT '' CHECK(length(evidence)<=5000),review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=2000),reviewed_by uuid REFERENCES auth.users(id),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),request_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,report_id,check_index),UNIQUE(tenant_id,created_by,request_id),
 FOREIGN KEY(tenant_id,report_id) REFERENCES public.aegis_reports(tenant_id,id),FOREIGN KEY(tenant_id,assignee_id) REFERENCES public.tenant_members(tenant_id,user_id)
);
CREATE TABLE public.aegis_corrective_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,action_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),revision integer NOT NULL,snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,action_id) REFERENCES public.aegis_corrective_actions(tenant_id,id)
);
CREATE INDEX aegis_corrective_due ON public.aegis_corrective_actions(tenant_id,stage,due_on);
CREATE INDEX aegis_corrective_events_time ON public.aegis_corrective_events(tenant_id,recorded_at DESC);
ALTER TABLE public.aegis_corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_corrective_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_corrective_actions,public.aegis_corrective_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.aegis_corrective_actions TO authenticated;
GRANT SELECT ON public.aegis_corrective_events TO authenticated;
CREATE POLICY aegis_corrective_read ON public.aegis_corrective_actions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.aegis_reports r WHERE r.tenant_id=aegis_corrective_actions.tenant_id AND r.id=report_id));
CREATE POLICY aegis_corrective_create ON public.aegis_corrective_actions FOR INSERT TO authenticated WITH CHECK(public.aegis_member_access(tenant_id,true) AND created_by=auth.uid());
CREATE POLICY aegis_corrective_update ON public.aegis_corrective_actions FOR UPDATE TO authenticated USING(public.aegis_member_access(tenant_id) AND (public.aegis_member_access(tenant_id,true) OR assignee_id=auth.uid())) WITH CHECK(public.aegis_member_access(tenant_id) AND (public.aegis_member_access(tenant_id,true) OR assignee_id=auth.uid()));
CREATE POLICY aegis_corrective_events_read ON public.aegis_corrective_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.aegis_corrective_actions a WHERE a.tenant_id=aegis_corrective_events.tenant_id AND a.id=action_id));
CREATE FUNCTION public.aegis_validate_corrective() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.aegis_reports; target_role text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=NEW.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')) THEN RAISE EXCEPTION 'Corrective action role required'; END IF;
 SELECT * INTO source FROM public.aegis_reports WHERE tenant_id=NEW.tenant_id AND id=NEW.report_id;
 IF NOT FOUND OR source.stage<>'approved' THEN RAISE EXCEPTION 'Accessible approved source report required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.stage<>'open' OR NEW.revision<>1 OR NEW.evidence<>'' OR NEW.review_note<>'' OR NEW.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'Open initial state required'; END IF;
  IF source.checks->NEW.check_index->>'result' IS DISTINCT FROM 'fail' THEN RAISE EXCEPTION 'Failed source check required'; END IF;
  SELECT role::text INTO target_role FROM public.tenant_members WHERE tenant_id=NEW.tenant_id AND user_id=NEW.assignee_id;
  IF target_role IS NULL OR target_role NOT IN ('owner','admin','agent') THEN RAISE EXCEPTION 'Eligible tenant assignee required'; END IF;
  IF target_role='agent' AND NOT EXISTS(SELECT 1 FROM public.aegis_operations o WHERE o.tenant_id=NEW.tenant_id AND o.assigned_user_id=NEW.assignee_id AND o.status='active' AND o.area NOT IN ('close-protection','journey','investigations') AND ((o.kind='site' AND o.id=source.site_id) OR (o.kind='engagement' AND o.parent_id=source.site_id))) THEN RAISE EXCEPTION 'Assignee must have site access'; END IF;
 ELSE
  IF (NEW.id,NEW.tenant_id,NEW.report_id,NEW.check_index,NEW.assignee_id,NEW.due_on,NEW.priority,NEW.created_by,NEW.request_id) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.report_id,OLD.check_index,OLD.assignee_id,OLD.due_on,OLD.priority,OLD.created_by,OLD.request_id) THEN RAISE EXCEPTION 'Corrective identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Corrective revision conflict'; END IF;
  IF (OLD.stage='open' AND NEW.stage='in_progress') OR (OLD.stage='in_progress' AND NEW.stage IN ('in_progress','submitted')) THEN
   IF auth.uid()<>OLD.assignee_id THEN RAISE EXCEPTION 'Only assignee may record remediation'; END IF;
   NEW.reviewed_by:=NULL;NEW.review_note:='';
   IF NEW.stage='submitted' AND length(trim(NEW.evidence))=0 THEN RAISE EXCEPTION 'Remediation evidence required'; END IF;
  ELSIF OLD.stage='submitted' AND NEW.stage IN ('closed','in_progress') THEN
   IF NOT public.aegis_member_access(NEW.tenant_id,true) OR auth.uid()=OLD.assignee_id THEN RAISE EXCEPTION 'Independent supervisor required'; END IF;
   IF NEW.evidence<>OLD.evidence THEN RAISE EXCEPTION 'Review cannot alter remediation evidence'; END IF;
   IF length(trim(NEW.review_note))=0 THEN RAISE EXCEPTION 'Review note required'; END IF;
   NEW.reviewed_by:=auth.uid();
  ELSE RAISE EXCEPTION 'Invalid corrective transition'; END IF;
 END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_corrective() FROM PUBLIC,anon;
CREATE TRIGGER aegis_corrective_validate BEFORE INSERT OR UPDATE ON public.aegis_corrective_actions FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_corrective();
CREATE FUNCTION aegis_private.audit_corrective() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.aegis_member_access(NEW.tenant_id) THEN RAISE EXCEPTION 'Authenticated Aegis member required'; END IF;
 INSERT INTO public.aegis_corrective_events(tenant_id,action_id,actor,revision,snapshot) VALUES(NEW.tenant_id,NEW.id,auth.uid(),NEW.revision,to_jsonb(NEW));RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aegis_private.audit_corrective() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aegis_corrective_audit AFTER INSERT OR UPDATE ON public.aegis_corrective_actions FOR EACH ROW EXECUTE FUNCTION aegis_private.audit_corrective();
COMMIT;
