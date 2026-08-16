REVOKE EXECUTE ON FUNCTION public.can_write(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_write(uuid, uuid) TO authenticated, service_role;