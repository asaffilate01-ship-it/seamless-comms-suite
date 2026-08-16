CREATE OR REPLACE FUNCTION public.can_write(_tenant uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_tenant_role(_tenant, _user, ARRAY['owner'::app_role, 'admin'::app_role, 'agent'::app_role]);
$$;

DROP POLICY IF EXISTS "conv tenant write" ON public.conversations;
CREATE POLICY "conv tenant write" ON public.conversations
FOR ALL TO authenticated
USING (public.can_write(tenant_id, auth.uid()))
WITH CHECK (public.can_write(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "msg tenant write" ON public.messages;
CREATE POLICY "msg tenant write" ON public.messages
FOR ALL TO authenticated
USING (public.can_write(tenant_id, auth.uid()))
WITH CHECK (public.can_write(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "contacts tenant write" ON public.contacts;
CREATE POLICY "contacts tenant write" ON public.contacts
FOR ALL TO authenticated
USING (public.can_write(tenant_id, auth.uid()))
WITH CHECK (public.can_write(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "cases tenant write" ON public.cases;
CREATE POLICY "cases tenant write" ON public.cases
FOR ALL TO authenticated
USING (public.can_write(tenant_id, auth.uid()))
WITH CHECK (public.can_write(tenant_id, auth.uid()));