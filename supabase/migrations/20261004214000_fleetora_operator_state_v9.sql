-- Read model for the Tenant Factory Fleetora operator controls. Mutation stays
-- in the existing narrow, audited RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_fleetora_operator_state(
  _tenant uuid,_product text DEFAULT 'fleetpulse-uae'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; is_admin boolean;
BEGIN
  is_admin := public.is_platform_admin(auth.uid());
  IF NOT is_admin AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;
  SELECT jsonb_build_object(
    'readiness',public.get_fleetora_migration_readiness(_tenant,_product),
    'featureAuthority',(
      SELECT jsonb_build_object(
        'authoritative',COALESCE((product.config->>'featureEntitlementsAuthoritative')::boolean,false),
        'entitlements',COALESCE(product.config->'featureEntitlements','[]'::jsonb)
      ) FROM public.tenant_products product
      WHERE product.tenant_id=_tenant AND product.product_key=_product
    ),
    'binding',(
      SELECT to_jsonb(binding) FROM public.landlord_instance_tenants binding
      WHERE binding.tenant_id=_tenant AND binding.variant_product_key=_product
    ),
    'landlords',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',instance.id,'instanceKey',instance.instance_key,'name',instance.name,
        'productKey',instance.product_key,'organisationId',instance.owner_organisation_id,
        'regionKey',instance.region_key,'status',instance.status,'branding',instance.branding
      ) ORDER BY instance.name)
      FROM public.landlord_instances instance
      WHERE instance.product_key='fleetora' AND (
        is_admin OR public.is_organisation_member(instance.owner_organisation_id,auth.uid())
      )
    ),'[]'::jsonb),
    'approvals',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',approval.id,'targetMode',approval.target_mode,'status',approval.status,
        'reason',approval.reason,'requestedAt',approval.requested_at,
        'reviewedAt',approval.reviewed_at,'reviewNote',approval.review_note
      ) ORDER BY approval.requested_at DESC)
      FROM public.fleetora_cutover_approvals approval
      WHERE approval.tenant_id=_tenant AND approval.product_key=_product
    ),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_fleetora_operator_state(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_fleetora_operator_state(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_fleetora_feature_authority(
  _tenant uuid,_product text,_entitlements text[],_authoritative boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed constant text[] := ARRAY[
  'advanced_scheduling','advanced_reporting','compliance_suite','wps_payroll',
  'white_label','custom_domain','audit','api_access','multi_branch'
]; result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _product<>'fleetpulse-uae' THEN RAISE EXCEPTION 'FleetPulse UAE product required'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(_entitlements,'{}'::text[])) value WHERE NOT value=ANY(allowed)) THEN
    RAISE EXCEPTION 'Unknown FleetPulse feature entitlement';
  END IF;
  UPDATE public.tenant_products SET config=COALESCE(config,'{}'::jsonb)||jsonb_build_object(
    'featureEntitlements',to_jsonb(ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(_entitlements,'{}'::text[])) value ORDER BY value)),
    'featureEntitlementsAuthoritative',_authoritative
  ),updated_at=now()
  WHERE tenant_id=_tenant AND product_key=_product
  RETURNING jsonb_build_object(
    'authoritative',(config->>'featureEntitlementsAuthoritative')::boolean,
    'entitlements',config->'featureEntitlements'
  ) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'FleetPulse tenant product not found'; END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_fleetora_feature_authority(uuid,text,text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_fleetora_feature_authority(uuid,text,text[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_fleetora_landlord_from_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.landlord_instances SET status='active',updated_at=now()
  WHERE id=NEW.landlord_instance_id AND status='draft';
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_activate_fleetora_landlord ON public.landlord_instance_tenants;
CREATE TRIGGER trg_activate_fleetora_landlord
AFTER INSERT OR UPDATE OF status ON public.landlord_instance_tenants
FOR EACH ROW EXECUTE FUNCTION public.activate_fleetora_landlord_from_binding();

COMMIT;
