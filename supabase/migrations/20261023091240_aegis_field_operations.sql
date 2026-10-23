BEGIN;
CREATE TABLE public.aegis_checkpoints(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 site_id uuid NOT NULL,label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,site_id) REFERENCES public.aegis_operations(tenant_id,id)
);
CREATE TABLE public.aegis_field_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 operation_id uuid NOT NULL,checkpoint_id uuid,actor uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN ('attendance_in','attendance_out','checkpoint_observation','welfare_check')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
 request_id uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 evidence_class text NOT NULL DEFAULT 'operator_reported' CHECK(evidence_class='operator_reported'),
 UNIQUE(tenant_id,actor,request_id),FOREIGN KEY(tenant_id,operation_id) REFERENCES public.aegis_operations(tenant_id,id),
 FOREIGN KEY(tenant_id,checkpoint_id) REFERENCES public.aegis_checkpoints(tenant_id,id),
 CHECK((kind='checkpoint_observation')=(checkpoint_id IS NOT NULL))
);
CREATE UNIQUE INDEX aegis_one_attendance_event ON public.aegis_field_events(tenant_id,operation_id,actor,kind) WHERE kind IN ('attendance_in','attendance_out');
CREATE INDEX aegis_field_tenant_time ON public.aegis_field_events(tenant_id,recorded_at DESC);
ALTER TABLE public.aegis_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_field_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_checkpoints,public.aegis_field_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.aegis_checkpoints TO authenticated;
GRANT SELECT,INSERT ON public.aegis_field_events TO authenticated;
CREATE POLICY aegis_checkpoint_read ON public.aegis_checkpoints FOR SELECT TO authenticated USING(
 public.aegis_member_access(tenant_id) AND EXISTS(SELECT 1 FROM public.aegis_operations o WHERE o.tenant_id=aegis_checkpoints.tenant_id AND (o.id=site_id OR o.parent_id=site_id)));
CREATE POLICY aegis_checkpoint_create ON public.aegis_checkpoints FOR INSERT TO authenticated WITH CHECK(public.aegis_member_access(tenant_id,true) AND created_by=auth.uid());
CREATE POLICY aegis_checkpoint_update ON public.aegis_checkpoints FOR UPDATE TO authenticated USING(public.aegis_member_access(tenant_id,true)) WITH CHECK(public.aegis_member_access(tenant_id,true));
CREATE POLICY aegis_field_read ON public.aegis_field_events FOR SELECT TO authenticated USING(
 public.aegis_member_access(tenant_id) AND EXISTS(SELECT 1 FROM public.aegis_operations o WHERE o.tenant_id=aegis_field_events.tenant_id AND o.id=operation_id));
CREATE POLICY aegis_field_create ON public.aegis_field_events FOR INSERT TO authenticated WITH CHECK(
 public.aegis_member_access(tenant_id) AND actor=auth.uid() AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=aegis_field_events.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')));
CREATE FUNCTION public.aegis_validate_checkpoint() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE site public.aegis_operations;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.site_id<>OLD.site_id OR NEW.created_by<>OLD.created_by) THEN RAISE EXCEPTION 'Checkpoint identity is immutable'; END IF;
 SELECT * INTO site FROM public.aegis_operations WHERE tenant_id=NEW.tenant_id AND id=NEW.site_id;
 IF NOT FOUND OR site.kind<>'site' THEN RAISE EXCEPTION 'Accessible site required'; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_checkpoint() FROM PUBLIC,anon;
CREATE TRIGGER aegis_checkpoint_validate BEFORE INSERT OR UPDATE ON public.aegis_checkpoints FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_checkpoint();
CREATE FUNCTION public.aegis_validate_field_event() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE op public.aegis_operations; cp public.aegis_checkpoints;
BEGIN
 SELECT * INTO op FROM public.aegis_operations WHERE tenant_id=NEW.tenant_id AND id=NEW.operation_id;
 IF NOT FOUND OR op.kind<>'engagement' OR op.status<>'active' THEN RAISE EXCEPTION 'Accessible active engagement required'; END IF;
 IF NOT public.aegis_member_access(NEW.tenant_id,true) AND op.assigned_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Assigned officer required'; END IF;
 IF NEW.kind='attendance_out' AND NOT EXISTS(SELECT 1 FROM public.aegis_field_events WHERE tenant_id=NEW.tenant_id AND operation_id=NEW.operation_id AND actor=auth.uid() AND kind='attendance_in') THEN RAISE EXCEPTION 'Clock in before clock out'; END IF;
 IF NEW.kind IN ('checkpoint_observation','welfare_check') AND (NOT EXISTS(SELECT 1 FROM public.aegis_field_events WHERE tenant_id=NEW.tenant_id AND operation_id=NEW.operation_id AND actor=auth.uid() AND kind='attendance_in') OR EXISTS(SELECT 1 FROM public.aegis_field_events WHERE tenant_id=NEW.tenant_id AND operation_id=NEW.operation_id AND actor=auth.uid() AND kind='attendance_out')) THEN RAISE EXCEPTION 'Open attendance session required'; END IF;
 IF NEW.kind='checkpoint_observation' THEN
 SELECT * INTO cp FROM public.aegis_checkpoints WHERE tenant_id=NEW.tenant_id AND id=NEW.checkpoint_id;
 IF NOT FOUND OR cp.status<>'active' OR cp.site_id<>op.parent_id THEN RAISE EXCEPTION 'Active checkpoint at engagement site required'; END IF;
 END IF;
 NEW.actor:=auth.uid();NEW.recorded_at:=now();NEW.evidence_class:='operator_reported';RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_field_event() FROM PUBLIC,anon;
CREATE TRIGGER aegis_field_validate BEFORE INSERT ON public.aegis_field_events FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_field_event();
COMMIT;
