BEGIN;
CREATE TABLE public.aegis_handovers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),site_id uuid NOT NULL,
 incoming_id uuid NOT NULL,created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),request_id uuid NOT NULL,
 summary text NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 5000),outstanding text NOT NULL DEFAULT '' CHECK(length(outstanding)<=5000),
 stage text NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','offered','returned','acknowledged')),
 response text NOT NULL DEFAULT '' CHECK(length(response)<=2000),revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,created_by,request_id),CHECK(incoming_id<>created_by),
 FOREIGN KEY(tenant_id,site_id) REFERENCES public.aegis_operations(tenant_id,id),FOREIGN KEY(tenant_id,incoming_id) REFERENCES public.tenant_members(tenant_id,user_id)
);
CREATE TABLE public.aegis_handover_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,handover_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),revision integer NOT NULL,snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,handover_id) REFERENCES public.aegis_handovers(tenant_id,id)
);
CREATE INDEX aegis_handovers_site_time ON public.aegis_handovers(tenant_id,site_id,updated_at DESC);
CREATE INDEX aegis_handover_events_time ON public.aegis_handover_events(tenant_id,recorded_at DESC);
ALTER TABLE public.aegis_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_handover_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_handovers,public.aegis_handover_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.aegis_handovers TO authenticated;
GRANT SELECT ON public.aegis_handover_events TO authenticated;
CREATE POLICY aegis_handovers_read ON public.aegis_handovers FOR SELECT TO authenticated USING(public.aegis_site_resource_access(tenant_id,site_id) AND (public.aegis_member_access(tenant_id,true) OR created_by=auth.uid() OR incoming_id=auth.uid()));
CREATE POLICY aegis_handovers_create ON public.aegis_handovers FOR INSERT TO authenticated WITH CHECK(public.aegis_site_resource_access(tenant_id,site_id) AND created_by=auth.uid());
CREATE POLICY aegis_handovers_update ON public.aegis_handovers FOR UPDATE TO authenticated USING(public.aegis_site_resource_access(tenant_id,site_id) AND (created_by=auth.uid() OR incoming_id=auth.uid())) WITH CHECK(public.aegis_site_resource_access(tenant_id,site_id) AND (created_by=auth.uid() OR incoming_id=auth.uid()));
CREATE POLICY aegis_handover_events_read ON public.aegis_handover_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.aegis_handovers h WHERE h.tenant_id=aegis_handover_events.tenant_id AND h.id=handover_id));
CREATE FUNCTION public.aegis_validate_handover() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=NEW.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')) THEN RAISE EXCEPTION 'Handover authoring role required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.stage<>'draft' OR NEW.revision<>1 OR NEW.response<>'' THEN RAISE EXCEPTION 'Draft initial state required'; END IF;
 ELSE
  IF (NEW.id,NEW.tenant_id,NEW.site_id,NEW.incoming_id,NEW.created_by,NEW.request_id) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.site_id,OLD.incoming_id,OLD.created_by,OLD.request_id) THEN RAISE EXCEPTION 'Handover identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Handover revision conflict'; END IF;
  IF OLD.stage IN ('draft','returned') AND NEW.stage IN ('draft','offered') THEN
   IF auth.uid()<>OLD.created_by THEN RAISE EXCEPTION 'Only outgoing author may offer'; END IF;
   NEW.response:='';
  ELSIF OLD.stage='offered' AND NEW.stage IN ('returned','acknowledged') THEN
   IF auth.uid()<>OLD.incoming_id THEN RAISE EXCEPTION 'Only incoming recipient may respond'; END IF;
   IF (NEW.summary,NEW.outstanding) IS DISTINCT FROM (OLD.summary,OLD.outstanding) THEN RAISE EXCEPTION 'Response cannot alter offered evidence'; END IF;
   IF length(trim(NEW.response))=0 THEN RAISE EXCEPTION 'Acknowledgement or return note required'; END IF;
  ELSE RAISE EXCEPTION 'Invalid handover transition'; END IF;
 END IF;
 -- Eligibility uses existing tenant membership and site assignment without exposing a staff directory.
 -- Incoming recipients independently prove current site access when they respond.
 IF TG_OP='INSERT' OR NEW.stage='offered' THEN
  IF NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=NEW.tenant_id AND m.user_id=NEW.incoming_id AND m.role::text IN ('owner','admin','agent')) THEN RAISE EXCEPTION 'Eligible incoming tenant member required'; END IF;
 END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_handover() FROM PUBLIC,anon;
CREATE TRIGGER aegis_handover_validate BEFORE INSERT OR UPDATE ON public.aegis_handovers FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_handover();
CREATE FUNCTION aegis_private.audit_handover() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.aegis_member_access(NEW.tenant_id) THEN RAISE EXCEPTION 'Authenticated Aegis member required'; END IF;
 INSERT INTO public.aegis_handover_events(tenant_id,handover_id,actor,revision,snapshot) VALUES(NEW.tenant_id,NEW.id,auth.uid(),NEW.revision,to_jsonb(NEW));RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aegis_private.audit_handover() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aegis_handover_audit AFTER INSERT OR UPDATE ON public.aegis_handovers FOR EACH ROW EXECUTE FUNCTION aegis_private.audit_handover();
COMMIT;
