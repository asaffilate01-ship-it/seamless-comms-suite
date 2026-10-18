-- Forward-only lockdown for the historical pilot bootstrap.
-- The original function created active tenants, owner memberships, enabled
-- service blueprints and active locations BEFORE verified Dishbee imports.
-- Do not mutate older applied migrations: explicitly replace the legacy RPC.
-- Factory tenant activation remains behind separate real-DB readiness gates.
BEGIN;

CREATE OR REPLACE FUNCTION public.platform_bootstrap_dishbee_pilot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE='42501',
    MESSAGE='legacy_dishbee_pilot_disabled',
    DETAIL='Use an authenticated, read-only preview and the verified Dishbee landlord draft-tenant handover.';
END
$function$;

REVOKE ALL ON FUNCTION public.platform_bootstrap_dishbee_pilot()
  FROM PUBLIC, anon, authenticated, service_role;

-- Read-only diagnostics for a platform admin. This never inserts an
-- organisation, creates an active tenant, queues a job or contacts Dishbee.
CREATE OR REPLACE FUNCTION public.platform_preview_dishbee_pilot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_candidates jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='platform_admin_required';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'factorySlug', candidate.factory_slug,
        'dishbeeSlug', candidate.dishbee_slug,
        'factoryTenantId', t.id,
        'factoryTenantStatus', t.status,
        'organisationSlug', o.slug,
        'dishbeeBindingCount', (
          SELECT count(*)
          FROM public.product_connections pc
          WHERE pc.tenant_id=t.id
            AND pc.product_key='dishbee'
            AND nullif(pc.external_tenant_id,'') IS NOT NULL
        ),
        'safeToActivate', false
      ) ORDER BY candidate.factory_slug
    ),
    '[]'::jsonb
  )
  INTO v_candidates
  FROM (
    VALUES
      ('cafe1-st-albans','cafe-1-st-albans'),
      ('cafe1-luton','cafe-1-luton'),
      ('mealdeck','mealdeck')
  ) AS candidate(factory_slug,dishbee_slug)
  LEFT JOIN public.tenants t ON t.slug=candidate.factory_slug
  LEFT JOIN public.organisations o ON o.id=t.organisation_id;

  RETURN jsonb_build_object(
    'mode','read_only',
    'action','verify_source_import_ownership_rls_and_dishbee_binding',
    'createsTenants',false,
    'activatesProviders',false,
    'safeToActivate',false,
    'candidates',v_candidates
  );
END
$function$;

-- Defaults for SECURITY DEFINER are permissive unless explicitly revoked.
REVOKE ALL ON FUNCTION public.platform_preview_dishbee_pilot()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_preview_dishbee_pilot()
  TO authenticated;

COMMIT;
