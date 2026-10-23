BEGIN;
CREATE TABLE public.aegis_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),site_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('inspection','service_report')),title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 body text NOT NULL DEFAULT '' CHECK(length(body)<=10000),
 checks jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(checks)='array' AND jsonb_array_length(checks)<=30),
 stage text NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','submitted','approved','changes_requested')),
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=2000),reviewed_by uuid REFERENCES auth.users(id),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),request_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,created_by,request_id),FOREIGN KEY(tenant_id,site_id) REFERENCES public.aegis_operations(tenant_id,id)
);
CREATE TABLE public.aegis_report_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,report_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),
 revision integer NOT NULL,snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,report_id) REFERENCES public.aegis_reports(tenant_id,id)
);
CREATE INDEX aegis_reports_site ON public.aegis_reports(tenant_id,site_id,updated_at DESC);
CREATE INDEX aegis_report_events_time ON public.aegis_report_events(tenant_id,recorded_at DESC);
ALTER TABLE public.aegis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_reports,public.aegis_report_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.aegis_reports TO authenticated;
GRANT SELECT ON public.aegis_report_events TO authenticated;
CREATE POLICY aegis_reports_read ON public.aegis_reports FOR SELECT TO authenticated USING(public.aegis_site_resource_access(tenant_id,site_id));
CREATE POLICY aegis_reports_insert ON public.aegis_reports FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND public.aegis_site_resource_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=aegis_reports.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')));
CREATE POLICY aegis_reports_update ON public.aegis_reports FOR UPDATE TO authenticated USING(public.aegis_site_resource_access(tenant_id,site_id) AND (created_by=auth.uid() OR public.aegis_member_access(tenant_id,true))) WITH CHECK(public.aegis_site_resource_access(tenant_id,site_id));
CREATE POLICY aegis_report_events_read ON public.aegis_report_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.aegis_reports r WHERE r.tenant_id=aegis_report_events.tenant_id AND r.id=report_id));
CREATE FUNCTION public.aegis_validate_report() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE item jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=NEW.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')) THEN RAISE EXCEPTION 'Report authoring role required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.stage<>'draft' OR NEW.revision<>1 OR NEW.reviewed_by IS NOT NULL OR NEW.review_note<>'' THEN RAISE EXCEPTION 'Draft initial state required'; END IF;
 ELSE
  IF (NEW.id,NEW.tenant_id,NEW.site_id,NEW.kind,NEW.title,NEW.created_by,NEW.request_id) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.site_id,OLD.kind,OLD.title,OLD.created_by,OLD.request_id) THEN RAISE EXCEPTION 'Report identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Report revision conflict'; END IF;
  IF OLD.stage IN ('draft','changes_requested') AND NEW.stage IN ('draft','submitted') THEN
   IF auth.uid()<>OLD.created_by THEN RAISE EXCEPTION 'Only author may edit or submit'; END IF;
   NEW.reviewed_by:=NULL;NEW.review_note:='';
  ELSIF OLD.stage='submitted' AND NEW.stage IN ('approved','changes_requested') THEN
   IF NOT public.aegis_member_access(NEW.tenant_id,true) OR auth.uid()=OLD.created_by THEN RAISE EXCEPTION 'Independent supervisor required'; END IF;
   IF NEW.body<>OLD.body OR NEW.checks<>OLD.checks THEN RAISE EXCEPTION 'Review cannot alter submitted evidence'; END IF;
   IF length(trim(NEW.review_note))=0 THEN RAISE EXCEPTION 'Review note required'; END IF;
   NEW.reviewed_by:=auth.uid();
  ELSE RAISE EXCEPTION 'Invalid report transition'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.checks) LOOP
  IF jsonb_typeof(item)<>'object' OR NOT(item ?& ARRAY['label','result','finding']) OR (item - ARRAY['label','result','finding'])<>'{}'::jsonb OR
   jsonb_typeof(item->'label')<>'string' OR length(trim(item->>'label')) NOT BETWEEN 1 AND 160 OR
   jsonb_typeof(item->'result')<>'string' OR item->>'result' NOT IN ('pass','fail','not_applicable') OR
   jsonb_typeof(item->'finding')<>'string' OR length(item->>'finding')>2000 OR (item->>'result'='fail' AND length(trim(item->>'finding'))=0)
   THEN RAISE EXCEPTION 'Invalid checklist evidence'; END IF;
 END LOOP;
 IF NEW.stage='submitted' AND (length(trim(NEW.body))=0 OR (NEW.kind='inspection' AND jsonb_array_length(NEW.checks)=0)) THEN RAISE EXCEPTION 'Complete report evidence required'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_report() FROM PUBLIC,anon;
CREATE TRIGGER aegis_report_validate BEFORE INSERT OR UPDATE ON public.aegis_reports FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_report();
CREATE FUNCTION aegis_private.audit_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.aegis_member_access(NEW.tenant_id) THEN RAISE EXCEPTION 'Authenticated Aegis member required'; END IF;
 INSERT INTO public.aegis_report_events(tenant_id,report_id,actor,revision,snapshot) VALUES(NEW.tenant_id,NEW.id,auth.uid(),NEW.revision,to_jsonb(NEW));RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aegis_private.audit_report() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aegis_report_audit AFTER INSERT OR UPDATE ON public.aegis_reports FOR EACH ROW EXECUTE FUNCTION aegis_private.audit_report();
COMMIT;
