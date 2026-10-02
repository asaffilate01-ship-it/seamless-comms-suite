BEGIN;

CREATE OR REPLACE FUNCTION public.migration_bootstrap_dishbee_targets(
  _asset uuid,
  _luton_workspace text,
  _stalbans_workspace text,
  _mealdeck_workspace text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a public.portfolio_assets%rowtype;
  owner_org uuid;
  luton_tenant uuid;
  stalbans_tenant uuid;
  mealdeck_tenant uuid;
  luton_target uuid;
  stalbans_target uuid;
  mealdeck_target uuid;
BEGIN
  SELECT * INTO a
  FROM public.portfolio_assets
  WHERE id=_asset
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portfolio asset not found';
  END IF;

  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(
       a.tenant_id,
       auth.uid(),
       ARRAY['owner','admin']::public.app_role[]
     ) THEN
    RAISE EXCEPTION 'Migration factory access denied';
  END IF;

  IF nullif(btrim(_luton_workspace),'') IS NULL
     OR nullif(btrim(_stalbans_workspace),'') IS NULL
     OR nullif(btrim(_mealdeck_workspace),'') IS NULL THEN
    RAISE EXCEPTION 'All three Dishbee workspace IDs are required';
  END IF;

  IF _luton_workspace=_stalbans_workspace
     OR _luton_workspace=_mealdeck_workspace
     OR _stalbans_workspace=_mealdeck_workspace THEN
    RAISE EXCEPTION 'Dishbee workspace IDs must be unique';
  END IF;

  SELECT organisation_id INTO owner_org
  FROM public.tenants
  WHERE id=a.tenant_id;

  SELECT id INTO luton_tenant
  FROM public.tenants
  WHERE organisation_id=owner_org AND slug='cafe1-luton'
  LIMIT 1;

  SELECT id INTO stalbans_tenant
  FROM public.tenants
  WHERE organisation_id=owner_org AND slug='cafe1-st-albans'
  LIMIT 1;

  SELECT id INTO mealdeck_tenant
  FROM public.tenants
  WHERE organisation_id=owner_org AND slug='mealdeck'
  LIMIT 1;

  IF luton_tenant IS NULL THEN
    RAISE EXCEPTION 'Cafe 1 Luton Omniqora tenant not found in organisation';
  END IF;
  IF stalbans_tenant IS NULL THEN
    RAISE EXCEPTION 'Cafe 1 St Albans Omniqora tenant not found in organisation';
  END IF;
  IF mealdeck_tenant IS NULL THEN
    RAISE EXCEPTION 'MealDeck Omniqora tenant not found in organisation';
  END IF;

  UPDATE public.portfolio_assets
  SET
    target_mode='landlord',
    canonical_product_key='dishbee',
    updated_at=now()
  WHERE id=_asset;

  SELECT public.migration_map_target(
    _asset,luton_tenant,'dishbee',btrim(_luton_workspace),true
  ) INTO luton_target;

  SELECT public.migration_map_target(
    _asset,stalbans_tenant,'dishbee',btrim(_stalbans_workspace),true
  ) INTO stalbans_target;

  SELECT public.migration_map_target(
    _asset,mealdeck_tenant,'dishbee',btrim(_mealdeck_workspace),true
  ) INTO mealdeck_target;

  INSERT INTO public.portfolio_migration_events(
    tenant_id,asset_id,actor_user_id,event_type,from_stage,to_stage,details
  )
  VALUES(
    a.tenant_id,
    _asset,
    auth.uid(),
    'dishbee.targets.bootstrapped',
    a.migration_stage,
    a.migration_stage,
    jsonb_build_object(
      'cafe1Luton',jsonb_build_object(
        'targetTenantId',luton_tenant,
        'sourceWorkspaceId',btrim(_luton_workspace),
        'targetId',luton_target
      ),
      'cafe1StAlbans',jsonb_build_object(
        'targetTenantId',stalbans_tenant,
        'sourceWorkspaceId',btrim(_stalbans_workspace),
        'targetId',stalbans_target
      ),
      'mealDeck',jsonb_build_object(
        'targetTenantId',mealdeck_tenant,
        'sourceWorkspaceId',btrim(_mealdeck_workspace),
        'targetId',mealdeck_target
      )
    )
  );

  RETURN jsonb_build_object(
    'assetId',_asset,
    'productKey','dishbee',
    'targets',jsonb_build_array(
      jsonb_build_object(
        'name','Cafe 1 Luton',
        'targetTenantId',luton_tenant,
        'sourceWorkspaceId',btrim(_luton_workspace),
        'targetId',luton_target
      ),
      jsonb_build_object(
        'name','Cafe 1 St Albans',
        'targetTenantId',stalbans_tenant,
        'sourceWorkspaceId',btrim(_stalbans_workspace),
        'targetId',stalbans_target
      ),
      jsonb_build_object(
        'name','MealDeck',
        'targetTenantId',mealdeck_tenant,
        'sourceWorkspaceId',btrim(_mealdeck_workspace),
        'targetId',mealdeck_target
      )
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.migration_bootstrap_dishbee_targets(
  uuid,text,text,text
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.migration_bootstrap_dishbee_targets(
  uuid,text,text,text
) TO authenticated,service_role;

COMMIT;
