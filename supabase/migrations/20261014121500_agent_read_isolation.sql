-- Read isolation: a tenant driver can view only their linked records and jobs.
-- No direct client writes are enabled by these SELECT policies.
BEGIN;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY[
  'dispatch_agents','dispatch_vehicles','dispatch_jobs','dispatch_job_stops',
  'dispatch_agent_positions','dispatch_pod','tracking_snapshots','public_tracking_tokens'
 ] LOOP
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','dispatch tenant read',table_name);
 END LOOP;
END $$;
CREATE POLICY "dispatch agents own read" ON public.dispatch_agents FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR
  (user_id=auth.uid() AND status<>'suspended' AND public.is_tenant_member(tenant_id,auth.uid())));
CREATE POLICY "dispatch jobs own read" ON public.dispatch_jobs FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR
  (public.is_tenant_member(tenant_id,auth.uid()) AND EXISTS(
   SELECT 1 FROM public.dispatch_agents a WHERE a.id=assigned_agent_id
    AND a.tenant_id=tenant_id AND a.product_key=product_key
    AND a.user_id=auth.uid() AND a.status<>'suspended')));
CREATE POLICY "dispatch stops own read" ON public.dispatch_job_stops FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR EXISTS(
   SELECT 1 FROM public.dispatch_jobs j WHERE j.id=job_id AND j.tenant_id=tenant_id));
CREATE POLICY "dispatch vehicles own read" ON public.dispatch_vehicles FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR EXISTS(
   SELECT 1 FROM public.dispatch_jobs j WHERE j.assigned_vehicle_id=id
    AND j.tenant_id=tenant_id AND j.product_key=product_key));
CREATE POLICY "dispatch positions own read" ON public.dispatch_agent_positions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR EXISTS(
   SELECT 1 FROM public.dispatch_agents a WHERE a.id=agent_id AND a.tenant_id=tenant_id
    AND a.product_key=product_key AND a.user_id=auth.uid() AND a.status<>'suspended'));
CREATE POLICY "dispatch pod own read" ON public.dispatch_pod FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR EXISTS(
   SELECT 1 FROM public.dispatch_jobs j WHERE j.id=job_id AND j.tenant_id=tenant_id));
CREATE POLICY "dispatch tracking own read" ON public.tracking_snapshots FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]) OR (
   subject_type='dispatch_job' AND EXISTS(
    SELECT 1 FROM public.dispatch_jobs j WHERE j.id::text=subject_id AND j.tenant_id=tenant_id)));
CREATE POLICY "dispatch signed tokens admin read" ON public.public_tracking_tokens FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),
  ARRAY['owner','admin']::public.app_role[]));
COMMIT;
