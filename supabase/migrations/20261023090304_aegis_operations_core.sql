BEGIN;
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status,metadata)
VALUES('aegis-command','Aegis Command','Physical security operations suite','security','hosted','internal','{"tenant_provisioning_enabled":false,"provider_activation_verified":false}'::jsonb)
ON CONFLICT(product_key) DO NOTHING;

CREATE TABLE public.aegis_operations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 kind text NOT NULL CHECK(kind IN ('site','engagement','incident')),
 area text NOT NULL CHECK(area IN ('static-guarding','close-protection','access-control','mobile-patrol','event-security','control-room','retail','industrial','residential','journey','investigations','life-safety','workforce','commercial')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 status text NOT NULL,
 parent_id uuid,
 assigned_user_id uuid REFERENCES auth.users(id),
 details text NOT NULL DEFAULT '' CHECK(length(details)<=5000),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 request_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,created_by,request_id),
 FOREIGN KEY(tenant_id,parent_id) REFERENCES public.aegis_operations(tenant_id,id),
 FOREIGN KEY(tenant_id,assigned_user_id) REFERENCES public.tenant_members(tenant_id,user_id)
);
CREATE INDEX aegis_operations_tenant_kind ON public.aegis_operations(tenant_id,kind,updated_at DESC);
CREATE TABLE public.aegis_operation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 operation_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,operation_id) REFERENCES public.aegis_operations(tenant_id,id)
);
CREATE INDEX aegis_events_tenant_time ON public.aegis_operation_events(tenant_id,created_at DESC);
ALTER TABLE public.aegis_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_operation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_operations,public.aegis_operation_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.aegis_operations TO authenticated;
GRANT SELECT ON public.aegis_operation_events TO authenticated;

CREATE FUNCTION public.aegis_member_access(_tenant uuid,_admin boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.tenant_members m JOIN public.tenant_products p ON p.tenant_id=m.tenant_id
 WHERE m.tenant_id=_tenant AND m.user_id=auth.uid() AND p.product_key='aegis-command' AND p.status='active'
 AND (NOT _admin OR m.role::text IN ('owner','admin')))
$$;
REVOKE ALL ON FUNCTION public.aegis_member_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aegis_member_access(uuid,boolean) TO authenticated;
CREATE POLICY aegis_read ON public.aegis_operations FOR SELECT TO authenticated USING(
 public.aegis_member_access(tenant_id) AND
 (public.aegis_member_access(tenant_id,true) OR (area NOT IN ('close-protection','journey','investigations') AND (created_by=auth.uid() OR assigned_user_id=auth.uid()))));
CREATE POLICY aegis_create ON public.aegis_operations FOR INSERT TO authenticated WITH CHECK(
 public.aegis_member_access(tenant_id) AND created_by=auth.uid() AND
 (public.aegis_member_access(tenant_id,true) OR (kind='incident' AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=aegis_operations.tenant_id AND m.user_id=auth.uid() AND m.role::text='agent') AND area NOT IN ('close-protection','journey','investigations') AND assigned_user_id IS NULL)));
CREATE POLICY aegis_update ON public.aegis_operations FOR UPDATE TO authenticated
 USING(public.aegis_member_access(tenant_id,true)) WITH CHECK(public.aegis_member_access(tenant_id,true));
CREATE POLICY aegis_event_read ON public.aegis_operation_events FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.aegis_operations o WHERE o.tenant_id=aegis_operation_events.tenant_id AND o.id=operation_id));

CREATE FUNCTION public.aegis_validate_operation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.aegis_operations; allowed text[];
BEGIN
 allowed:=CASE NEW.kind WHEN 'site' THEN ARRAY['draft','active','archived'] WHEN 'engagement' THEN ARRAY['draft','scheduled','active','completed','cancelled'] ELSE ARRAY['open','review','resolved','closed'] END;
 IF NOT NEW.status=ANY(allowed) THEN RAISE EXCEPTION 'Invalid Aegis stage'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>allowed[1] OR NEW.revision<>1 THEN RAISE EXCEPTION 'New record must start at initial stage'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.kind<>OLD.kind OR NEW.area<>OLD.area OR NEW.created_by<>OLD.created_by OR NEW.request_id<>OLD.request_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN RAISE EXCEPTION 'Record identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision conflict'; END IF;
  IF NEW.status='cancelled' AND OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Completed engagement is terminal'; END IF;
  IF NEW.status<>OLD.status AND NEW.status<>'cancelled' AND array_position(allowed,NEW.status)<>array_position(allowed,OLD.status)+1 THEN RAISE EXCEPTION 'Invalid stage transition'; END IF;
 END IF;
 IF NEW.kind='site' AND NEW.parent_id IS NOT NULL THEN RAISE EXCEPTION 'Site cannot have parent'; END IF;
 IF NEW.kind<>'site' THEN
  IF NEW.parent_id IS NULL THEN RAISE EXCEPTION 'Scoped parent required'; END IF;
  SELECT * INTO p FROM public.aegis_operations WHERE tenant_id=NEW.tenant_id AND id=NEW.parent_id;
  IF NOT FOUND OR p.area<>NEW.area OR p.kind NOT IN ('site','engagement') THEN RAISE EXCEPTION 'Accessible same-area parent required'; END IF;
  IF NEW.kind='engagement' AND p.kind<>'site' THEN RAISE EXCEPTION 'Engagement requires site parent'; END IF;
 END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_operation() FROM PUBLIC,anon;
CREATE TRIGGER aegis_validate BEFORE INSERT OR UPDATE ON public.aegis_operations FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_operation();

-- Trigger-only definer: authenticated clients have no event INSERT permission.
-- Uses NEW rows admitted through RLS; it is not a general-purpose RPC.
CREATE SCHEMA IF NOT EXISTS aegis_private;
REVOKE ALL ON SCHEMA aegis_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION aegis_private.audit_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.aegis_member_access(NEW.tenant_id) THEN RAISE EXCEPTION 'Authenticated Aegis member required'; END IF;
 INSERT INTO public.aegis_operation_events(tenant_id,operation_id,actor,action,revision)
 VALUES(NEW.tenant_id,NEW.id,auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'updated:'||NEW.status END,NEW.revision);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aegis_private.audit_operation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aegis_audit AFTER INSERT OR UPDATE ON public.aegis_operations FOR EACH ROW EXECUTE FUNCTION aegis_private.audit_operation();
COMMIT;
