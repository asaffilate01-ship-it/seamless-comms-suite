-- Regulatory, Risk & Compliance Intelligence: host services and independent module access.
BEGIN;
-- Close the pre-existing arbitrary tenant self-enrolment policy.
DROP POLICY IF EXISTS "members insertable by self bootstrap" ON public.tenant_members;
CREATE POLICY "members invited by existing admin" ON public.tenant_members
FOR INSERT TO authenticated WITH CHECK (
  public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
REVOKE INSERT ON public.tenants FROM authenticated;
CREATE OR REPLACE FUNCTION public.create_my_tenant(_name text, _slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tenants;
BEGIN
  IF auth.uid() IS NULL OR _name IS NULL OR _slug IS NULL OR length(_name) NOT BETWEEN 1 AND 100
     OR _slug !~ '^[a-z0-9-]{1,80}$' THEN RAISE EXCEPTION 'Invalid tenant creation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  SELECT tenants.* INTO t FROM public.tenants JOIN public.tenant_members m ON m.tenant_id=tenants.id WHERE m.user_id=auth.uid() ORDER BY m.created_at, tenants.id LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug); END IF;
  INSERT INTO public.tenants(name, slug) VALUES (_name, _slug) RETURNING * INTO t;
  INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES(t.id,auth.uid(),'owner');
  RETURN jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug);
END; $$;
REVOKE ALL ON FUNCTION public.create_my_tenant(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_tenant(text,text) TO authenticated;

CREATE TABLE public.addon_entitlements (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 addon text NOT NULL CHECK(addon='rrci'),
 status text NOT NULL CHECK(status IN ('trial','active','suspended','cancelled')),
 valid_until timestamptz NOT NULL,
 billing_reference text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,addon)
);
CREATE TABLE public.rrci_workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 environment text NOT NULL CHECK(environment IN ('demo','pilot','production')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE public.rrci_members (
 workspace_id uuid NOT NULL REFERENCES public.rrci_workspaces(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('reader','editor','reviewer','admin')),
 PRIMARY KEY(workspace_id,user_id)
);
ALTER TABLE public.addon_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrci_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrci_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.addon_entitlements,public.rrci_workspaces,public.rrci_members FROM anon,authenticated;
GRANT ALL ON public.addon_entitlements,public.rrci_workspaces,public.rrci_members TO service_role;
GRANT SELECT ON public.addon_entitlements,public.rrci_workspaces,public.rrci_members TO authenticated;
CREATE POLICY "own entitlement" ON public.addon_entitlements FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.rrci_has_access(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.rrci_workspaces w
 JOIN public.rrci_members m ON m.workspace_id=w.id AND m.user_id=auth.uid()
 JOIN public.tenant_members tm ON tm.tenant_id=w.tenant_id AND tm.user_id=auth.uid()
 JOIN public.addon_entitlements e ON e.tenant_id=w.tenant_id AND e.addon='rrci'
 WHERE w.id=_workspace AND e.status IN ('trial','active') AND e.valid_until>now());
$$;
REVOKE ALL ON FUNCTION public.rrci_has_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rrci_has_access(uuid) TO authenticated;
CREATE POLICY "authorised module workspaces" ON public.rrci_workspaces FOR SELECT TO authenticated
 USING(public.rrci_has_access(id));
CREATE POLICY "own module membership" ON public.rrci_members FOR SELECT TO authenticated
 USING(user_id=auth.uid() AND public.rrci_has_access(workspace_id));

CREATE OR REPLACE FUNCTION public.get_rrci_access(_workspace uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'workspace', w.id, 'name', w.name, 'environment',w.environment,'tenant',w.tenant_id,
 'subject',auth.uid(),'role',m.role,'entitlement_until',extract(epoch FROM e.valid_until),
 'permissions',CASE m.role
 WHEN 'admin' THEN jsonb_build_array('read','write','admin','sync','approve','audit')
 WHEN 'editor' THEN jsonb_build_array('read','write')
 WHEN 'reviewer' THEN jsonb_build_array('read','approve','audit')
 ELSE jsonb_build_array('read') END)), '[]'::jsonb)
 FROM public.rrci_workspaces w
 JOIN public.rrci_members m ON m.workspace_id=w.id AND m.user_id=auth.uid()
 JOIN public.tenant_members tm ON tm.tenant_id=w.tenant_id AND tm.user_id=auth.uid()
 JOIN public.addon_entitlements e ON e.tenant_id=w.tenant_id AND e.addon='rrci'
 WHERE (_workspace IS NULL OR w.id=_workspace)
 AND e.status IN ('active','trial') AND e.valid_until>now();
$$;
REVOKE ALL ON FUNCTION public.get_rrci_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_rrci_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_rrci_workspace(_tenant uuid,_name text,_environment text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[])
 OR NOT EXISTS(SELECT 1 FROM public.addon_entitlements WHERE tenant_id=_tenant AND addon='rrci'
 AND status IN ('active','trial') AND valid_until>now()) THEN RAISE EXCEPTION 'Add-on access denied'; END IF;
 INSERT INTO public.rrci_workspaces(tenant_id,name,environment) VALUES(_tenant,_name,_environment) RETURNING id INTO result;
 INSERT INTO public.rrci_members VALUES(result,auth.uid(),'admin');
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_rrci_workspace(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_rrci_workspace(uuid,text,text) TO authenticated;
COMMIT;
