-- Only owners/admins may read the channel row (it contains access tokens / secrets)
DROP POLICY IF EXISTS "channels readable by members" ON public.whatsapp_channels;

CREATE POLICY "channels readable by owner/admin"
ON public.whatsapp_channels
FOR SELECT
TO authenticated
USING (has_tenant_role(tenant_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

-- Secret-free channel status for ordinary members
CREATE OR REPLACE VIEW public.whatsapp_channel_status
WITH (security_invoker = true)
AS
SELECT c.id, c.tenant_id, c.display_phone, c.status, c.updated_at
FROM public.whatsapp_channels c;

GRANT SELECT ON public.whatsapp_channel_status TO authenticated;
GRANT ALL ON public.whatsapp_channel_status TO service_role;