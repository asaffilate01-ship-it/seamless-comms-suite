-- Tenant-scoped maintenance entry point for an external scheduler. The caller
-- must hold a scoped service credential at the HTTP boundary and service_role
-- at the database boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.run_fleetora_maintenance(_tenant uuid,_product text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expired_proposals integer; expired_recommendations integer; evaluated_slas integer;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Platform service required';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.tenant_products
    WHERE tenant_id=_tenant AND product_key=_product AND status='active'
  ) THEN RAISE EXCEPTION 'Active tenant product required'; END IF;

  UPDATE public.routing_plan_proposals SET status='expired',updated_at=now()
  WHERE tenant_id=_tenant AND product_key=_product
    AND status IN ('review','approved') AND expires_at<=now();
  GET DIAGNOSTICS expired_proposals=ROW_COUNT;

  UPDATE public.operations_recommendations SET status='expired',updated_at=now()
  WHERE tenant_id=_tenant AND product_key=_product
    AND status IN ('review','approved') AND expires_at IS NOT NULL AND expires_at<=now();
  GET DIAGNOSTICS expired_recommendations=ROW_COUNT;

  SELECT public.evaluate_external_dispatch_slas(_tenant,_product) INTO evaluated_slas;
  RETURN jsonb_build_object(
    'tenantId',_tenant,'productKey',_product,
    'expiredRouteProposals',expired_proposals,
    'expiredRecommendations',expired_recommendations,
    'evaluatedSlaBreaches',evaluated_slas,
    'ranAt',now()
  );
END; $$;
REVOKE ALL ON FUNCTION public.run_fleetora_maintenance(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_fleetora_maintenance(uuid,text) TO service_role;

COMMIT;
