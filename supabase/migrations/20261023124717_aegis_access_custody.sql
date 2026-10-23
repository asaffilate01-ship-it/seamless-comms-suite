BEGIN;
CREATE TABLE public.aegis_resources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 site_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('visitor','key','equipment')),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160),host_ref text NOT NULL DEFAULT '' CHECK(length(host_ref)<=200),
 custodian_id uuid,stage text NOT NULL,note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
 request_id uuid NOT NULL,created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,created_by,request_id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES public.aegis_operations(tenant_id,id),
 FOREIGN KEY(tenant_id,custodian_id) REFERENCES public.tenant_members(tenant_id,user_id)
);
CREATE INDEX aegis_resources_site_kind ON public.aegis_resources(tenant_id,site_id,kind,updated_at DESC);
CREATE TABLE public.aegis_resource_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,resource_id uuid NOT NULL,
 actor uuid NOT NULL REFERENCES auth.users(id),from_stage text,to_stage text NOT NULL,
 custodian_id uuid,previous_custodian_id uuid,note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),revision integer NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,resource_id) REFERENCES public.aegis_resources(tenant_id,id)
);
CREATE INDEX aegis_resource_events_tenant_time ON public.aegis_resource_events(tenant_id,recorded_at DESC);
ALTER TABLE public.aegis_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_resource_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_resources,public.aegis_resource_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.aegis_resources TO authenticated;
GRANT SELECT ON public.aegis_resource_events TO authenticated;
CREATE FUNCTION public.aegis_site_resource_access(_tenant uuid,_site uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT public.aegis_member_access(_tenant) AND EXISTS(
 SELECT 1 FROM public.aegis_operations o WHERE o.tenant_id=_tenant AND
 ((o.id=_site AND o.kind='site' AND o.status='active') OR (o.parent_id=_site AND o.kind='engagement' AND o.status='active')) AND
 (public.aegis_member_access(_tenant,true) OR o.assigned_user_id=auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.aegis_site_resource_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aegis_site_resource_access(uuid,uuid) TO authenticated;
CREATE POLICY aegis_resources_read ON public.aegis_resources FOR SELECT TO authenticated USING(public.aegis_site_resource_access(tenant_id,site_id));
CREATE POLICY aegis_resources_create ON public.aegis_resources FOR INSERT TO authenticated WITH CHECK(public.aegis_member_access(tenant_id,true) AND created_by=auth.uid());
CREATE POLICY aegis_resources_update ON public.aegis_resources FOR UPDATE TO authenticated
 USING(public.aegis_site_resource_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=aegis_resources.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')))
 WITH CHECK(public.aegis_site_resource_access(tenant_id,site_id));
CREATE POLICY aegis_resource_events_read ON public.aegis_resource_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.aegis_resources r WHERE r.tenant_id=aegis_resource_events.tenant_id AND r.id=resource_id));
CREATE FUNCTION public.aegis_validate_resource() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE site public.aegis_operations; allowed boolean;
BEGIN
 SELECT * INTO site FROM public.aegis_operations WHERE tenant_id=NEW.tenant_id AND id=NEW.site_id;
 -- An assigned engagement can expose its site's resource records without exposing site notes.
 IF TG_OP='INSERT' AND (NOT FOUND OR site.kind<>'site' OR site.status<>'active') THEN RAISE EXCEPTION 'Accessible site required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.stage<>(CASE WHEN NEW.kind='visitor' THEN 'expected' ELSE 'available' END) OR NEW.custodian_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid resource initial state'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.site_id<>OLD.site_id OR NEW.kind<>OLD.kind OR NEW.label<>OLD.label OR NEW.host_ref<>OLD.host_ref OR NEW.created_by<>OLD.created_by OR NEW.request_id<>OLD.request_id THEN RAISE EXCEPTION 'Resource identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Resource revision conflict'; END IF;
  IF NEW.stage=OLD.stage THEN RAISE EXCEPTION 'Choose a workflow transition'; END IF;
  IF NEW.kind='visitor' THEN
   allowed:=(OLD.stage='expected' AND NEW.stage IN ('approved','cancelled')) OR (OLD.stage='approved' AND NEW.stage IN ('onsite','cancelled')) OR (OLD.stage='onsite' AND NEW.stage='departed');
   IF NEW.stage IN ('approved','cancelled') AND NOT public.aegis_member_access(NEW.tenant_id,true) THEN RAISE EXCEPTION 'Supervisor approval required'; END IF;
  ELSE
   allowed:=(OLD.stage IN ('available','returned') AND NEW.stage IN ('issued','maintenance')) OR (OLD.stage='issued' AND NEW.stage IN ('returned','lost')) OR (OLD.stage='maintenance' AND NEW.stage='available');
   IF NEW.stage='lost' AND NEW.custodian_id IS DISTINCT FROM OLD.custodian_id THEN RAISE EXCEPTION 'Lost asset must retain last custodian'; END IF;
   IF NEW.stage IN ('maintenance','available','lost') AND NOT public.aegis_member_access(NEW.tenant_id,true) THEN RAISE EXCEPTION 'Supervisor review required'; END IF;
  END IF;
  IF NOT allowed THEN RAISE EXCEPTION 'Invalid resource transition'; END IF;
  IF length(trim(NEW.note))=0 THEN RAISE EXCEPTION 'Handover or review note required'; END IF;
 END IF;
 IF NEW.kind='visitor' AND (length(trim(NEW.host_ref))=0 OR NEW.custodian_id IS NOT NULL) THEN RAISE EXCEPTION 'Visitor requires host reference, without asset custodian'; END IF;
 IF NEW.kind<>'visitor' AND ((NEW.stage='issued' AND NEW.custodian_id IS NULL) OR (NEW.stage NOT IN ('issued','lost') AND NEW.custodian_id IS NOT NULL)) THEN RAISE EXCEPTION 'Custodian required only for issued or lost assets'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_resource() FROM PUBLIC,anon;
CREATE TRIGGER aegis_resource_validate BEFORE INSERT OR UPDATE ON public.aegis_resources FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_resource();
CREATE FUNCTION aegis_private.audit_resource() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.aegis_member_access(NEW.tenant_id) THEN RAISE EXCEPTION 'Authenticated Aegis member required'; END IF;
 INSERT INTO public.aegis_resource_events(tenant_id,resource_id,actor,from_stage,to_stage,custodian_id,previous_custodian_id,note,revision)
 VALUES(NEW.tenant_id,NEW.id,auth.uid(),CASE WHEN TG_OP='UPDATE' THEN OLD.stage ELSE NULL END,NEW.stage,NEW.custodian_id,CASE WHEN TG_OP='UPDATE' THEN OLD.custodian_id ELSE NULL END,NEW.note,NEW.revision);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aegis_private.audit_resource() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aegis_resource_audit AFTER INSERT OR UPDATE ON public.aegis_resources FOR EACH ROW EXECUTE FUNCTION aegis_private.audit_resource();
COMMIT;
