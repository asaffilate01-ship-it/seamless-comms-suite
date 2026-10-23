BEGIN;
CREATE TABLE public.aegis_post_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),site_id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1,title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),content text NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 15000),
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,site_id,version),UNIQUE(tenant_id,created_by,request_id),FOREIGN KEY(tenant_id,site_id) REFERENCES public.aegis_operations(tenant_id,id)
);
CREATE TABLE public.aegis_post_order_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,order_id uuid NOT NULL,actor uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,order_id,actor),FOREIGN KEY(tenant_id,order_id) REFERENCES public.aegis_post_orders(tenant_id,id)
);
CREATE INDEX aegis_post_orders_site ON public.aegis_post_orders(tenant_id,site_id,version DESC);
CREATE INDEX aegis_post_receipts_time ON public.aegis_post_order_receipts(tenant_id,recorded_at DESC);
ALTER TABLE public.aegis_post_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_post_order_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aegis_post_orders,public.aegis_post_order_receipts FROM anon,authenticated;
GRANT SELECT,INSERT ON public.aegis_post_orders,public.aegis_post_order_receipts TO authenticated;
CREATE POLICY aegis_post_orders_read ON public.aegis_post_orders FOR SELECT TO authenticated USING(public.aegis_site_resource_access(tenant_id,site_id));
CREATE POLICY aegis_post_orders_publish ON public.aegis_post_orders FOR INSERT TO authenticated WITH CHECK(public.aegis_member_access(tenant_id,true) AND created_by=auth.uid());
CREATE POLICY aegis_post_receipts_read ON public.aegis_post_order_receipts FOR SELECT TO authenticated USING((actor=auth.uid() OR public.aegis_member_access(tenant_id,true)) AND EXISTS(SELECT 1 FROM public.aegis_post_orders o WHERE o.tenant_id=aegis_post_order_receipts.tenant_id AND o.id=order_id));
CREATE POLICY aegis_post_receipts_create ON public.aegis_post_order_receipts FOR INSERT TO authenticated WITH CHECK(public.aegis_member_access(tenant_id) AND actor=auth.uid() AND EXISTS(SELECT 1 FROM public.aegis_post_orders o WHERE o.tenant_id=aegis_post_order_receipts.tenant_id AND o.id=order_id));
CREATE FUNCTION public.aegis_validate_post_order() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 -- Serialise publishers on the existing site row before allocating a version.
 PERFORM 1 FROM public.aegis_operations WHERE tenant_id=NEW.tenant_id AND id=NEW.site_id AND kind='site' AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Accessible active site required'; END IF;
 SELECT COALESCE(max(version),0)+1 INTO NEW.version FROM public.aegis_post_orders WHERE tenant_id=NEW.tenant_id AND site_id=NEW.site_id;
 NEW.created_by:=auth.uid();NEW.created_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_post_order() FROM PUBLIC,anon;
CREATE TRIGGER aegis_post_order_validate BEFORE INSERT ON public.aegis_post_orders FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_post_order();
CREATE FUNCTION public.aegis_validate_post_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source public.aegis_post_orders;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=NEW.tenant_id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','agent')) THEN RAISE EXCEPTION 'Officer authoring role required'; END IF;
 SELECT * INTO source FROM public.aegis_post_orders WHERE tenant_id=NEW.tenant_id AND id=NEW.order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Accessible post order required'; END IF;
 IF source.version<>(SELECT max(version) FROM public.aegis_post_orders WHERE tenant_id=NEW.tenant_id AND site_id=source.site_id) THEN RAISE EXCEPTION 'Superseded instructions; refresh before acknowledging'; END IF;
 NEW.actor:=auth.uid();NEW.recorded_at:=now();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aegis_validate_post_receipt() FROM PUBLIC,anon;
CREATE TRIGGER aegis_post_receipt_validate BEFORE INSERT ON public.aegis_post_order_receipts FOR EACH ROW EXECUTE FUNCTION public.aegis_validate_post_receipt();
CREATE VIEW public.aegis_post_orders_status WITH (security_invoker=true) AS SELECT o.*, NOT EXISTS(SELECT 1 FROM public.aegis_post_orders newer WHERE newer.tenant_id=o.tenant_id AND newer.site_id=o.site_id AND newer.version>o.version) AS is_current FROM public.aegis_post_orders o;
REVOKE ALL ON public.aegis_post_orders_status FROM anon,authenticated;
GRANT SELECT ON public.aegis_post_orders_status TO authenticated;
COMMIT;
