BEGIN;

CREATE OR REPLACE FUNCTION public.migration_evaluate_asset(_asset uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a public.portfolio_assets%rowtype;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  audit_ok boolean;
  adapter_ok boolean;
  plan_ok boolean;
  required_targets integer;
  ready_targets integer;
  shadow_ready_targets integer;
  failed_shadow integer;
  passed_shadow integer;
BEGIN
  SELECT * INTO a
  FROM public.portfolio_assets
  WHERE id=_asset;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portfolio asset not found';
  END IF;

  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.is_tenant_member(a.tenant_id,auth.uid()) THEN
    RAISE EXCEPTION 'Migration asset access denied';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.portfolio_repo_audits
    WHERE asset_id=_asset
      AND status='passed'
  ) INTO audit_ok;

  IF NOT audit_ok THEN
    blockers:=blockers||jsonb_build_array('repo_audit_not_passed');
  END IF;

  IF a.target_mode='pending' OR a.canonical_product_key IS NULL THEN
    blockers:=blockers||jsonb_build_array('migration_decision_incomplete');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.portfolio_migration_adapters
    WHERE asset_id=_asset
      AND status='verified'
      AND rollback_strategy IS NOT NULL
      AND btrim(rollback_strategy)<>''
  ) INTO adapter_ok;

  IF NOT adapter_ok THEN
    blockers:=blockers||jsonb_build_array('verified_adapter_missing');
  END IF;

  SELECT
    count(*) FILTER(WHERE required)::integer,
    count(*) FILTER(WHERE required AND status='ready')::integer
  INTO required_targets,ready_targets
  FROM public.portfolio_migration_targets
  WHERE asset_id=_asset;

  IF required_targets=0 THEN
    blockers:=blockers||jsonb_build_array('required_targets_missing');
  ELSIF ready_targets<required_targets THEN
    blockers:=blockers||jsonb_build_array('required_targets_not_ready');
  END IF;

  SELECT count(*)::integer
  INTO shadow_ready_targets
  FROM public.portfolio_migration_targets mt
  WHERE mt.asset_id=_asset
    AND mt.required
    AND EXISTS(
      SELECT 1
      FROM public.portfolio_shadow_checks s
      WHERE s.asset_id=_asset
        AND s.target_id=mt.id
        AND s.status='passed'
        AND s.checked_at>now()-interval '7 days'
    );

  SELECT
    count(*) FILTER(WHERE status='failed')::integer,
    count(*) FILTER(WHERE status='passed')::integer
  INTO failed_shadow,passed_shadow
  FROM public.portfolio_shadow_checks
  WHERE asset_id=_asset
    AND checked_at>now()-interval '7 days';

  IF failed_shadow>0 THEN
    blockers:=blockers||jsonb_build_array('shadow_checks_failed');
  END IF;

  IF required_targets>0 AND shadow_ready_targets<required_targets THEN
    blockers:=blockers||jsonb_build_array('required_target_shadow_checks_missing');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.portfolio_cutover_plans
    WHERE asset_id=_asset
      AND rollback_strategy<>''
      AND approved_at IS NOT NULL
  ) INTO plan_ok;

  IF NOT plan_ok THEN
    blockers:=blockers||jsonb_build_array('approved_cutover_plan_missing');
  END IF;

  IF a.live_url IS NULL THEN
    warnings:=warnings||jsonb_build_array('live_url_missing');
  END IF;

  RETURN jsonb_build_object(
    'assetId',_asset,
    'ready',jsonb_array_length(blockers)=0,
    'blockers',blockers,
    'warnings',warnings,
    'requiredTargets',required_targets,
    'readyTargets',ready_targets,
    'shadowReadyTargets',shadow_ready_targets,
    'passedShadowChecks',passed_shadow,
    'failedShadowChecks',failed_shadow
  );
END; $$;

REVOKE ALL ON FUNCTION public.migration_evaluate_asset(uuid)
FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.migration_evaluate_asset(uuid)
TO authenticated,service_role;

COMMIT;
