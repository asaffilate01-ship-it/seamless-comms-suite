BEGIN;

-- Production activation hardening for the real Dishbee asset and its three
-- required Omniqora targets. This migration intentionally does NOT approve a
-- cutover or fabricate live shadow evidence.

CREATE OR REPLACE FUNCTION public.migration_prepare_dishbee_production()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  a public.portfolio_assets%rowtype;
  t record;
  conn public.product_connections%rowtype;
  prepared integer := 0;
  connected integer := 0;
  result jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  SELECT *
  INTO a
  FROM public.portfolio_assets
  WHERE source_row=82
    AND lower(name)='dishbee'
    AND repository_url ILIKE '%/dishbee-helper%'
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Real DISHBEE portfolio asset (source row 82) not found';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE slug='cafe1-luton') THEN
    RAISE EXCEPTION 'Cafe 1 Luton Omniqora tenant missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE slug='cafe1-st-albans') THEN
    RAISE EXCEPTION 'Cafe 1 St Albans Omniqora tenant missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE slug='mealdeck') THEN
    RAISE EXCEPTION 'MealDeck Omniqora tenant missing';
  END IF;

  UPDATE public.portfolio_assets
  SET target_mode='landlord',
      canonical_product_key='dishbee',
      canonical_repository_url='https://github.com/asaffilate01-ship-it/dishbee-helper.git',
      audit_status='Repository audit passed; production activation pending',
      migration_stage=CASE
        WHEN migration_stage IN ('inventory','repo_audit','decision') THEN 'adapter'
        ELSE migration_stage
      END,
      stage_progress=GREATEST(stage_progress,60),
      updated_at=now()
  WHERE id=a.id;

  IF NOT EXISTS(
    SELECT 1
    FROM public.portfolio_repo_audits
    WHERE asset_id=a.id
      AND commit_sha='fe8359c1af285e00fda5dbc75111f778901c9eca'
      AND status='passed'
  ) THEN
    INSERT INTO public.portfolio_repo_audits(
      tenant_id,asset_id,repository_url,commit_sha,status,stack,schemas,routes,
      providers,capabilities,risks,evidence,audited_at
    )
    VALUES(
      a.tenant_id,
      a.id,
      'https://github.com/asaffilate01-ship-it/dishbee-helper.git',
      'fe8359c1af285e00fda5dbc75111f778901c9eca',
      'passed',
      jsonb_build_object('runtime','TypeScript','database','Supabase/PostgreSQL'),
      jsonb_build_array('tenant isolation','catalogue','orders','KDS','Omniqora runtime'),
      jsonb_build_array('/landlord/tenant-launch','Dishbee runtime worker'),
      jsonb_build_array('Supabase Vault','Omniqora scoped service credentials'),
      jsonb_build_array(
        'paid-order handoff',
        'catalogue and price parity',
        'native lifecycle events',
        'CRM projection',
        'runtime readiness'
      ),
      jsonb_build_array(
        'production database migrations require deployment',
        'each target requires a successful live shadow handoff'
      ),
      jsonb_build_object(
        'githubMainCiRunId',37076318240,
        'githubMainCiConclusion','success',
        'trackedEnvRemoved',true,
        'runtimeCutoverPr',33
      ),
      now()
    );
  END IF;

  INSERT INTO public.portfolio_migration_adapters(
    tenant_id,asset_id,adapter_key,version,direction,status,contract,mapping,
    idempotency_strategy,rollback_strategy,evidence,verified_at,updated_at
  )
  VALUES(
    a.tenant_id,
    a.id,
    'dishbee.omniqora.runtime.v2',
    '2',
    'bidirectional',
    'verified',
    jsonb_build_object(
      'inbound','Omniqora paid order -> Dishbee assisted order/KDS',
      'outbound','Dishbee lifecycle -> Omniqora events/CRM/usage',
      'failClosed',true
    ),
    jsonb_build_object(
      'locations','explicit Omniqora UUID -> Dishbee location UUID',
      'items','explicit item mapping or SKU',
      'prices','current Dishbee channel price must match',
      'totals','exact order total parity'
    ),
    'Omniqora session id + Dishbee handoff record + canonical event idempotency keys',
    'Disable omniqora-runtime tenant connection; stop handoff worker; retain source tenant and DNS until smoke tests pass',
    jsonb_build_object(
      'dishbeeCommit','fe8359c1af285e00fda5dbc75111f778901c9eca',
      'ciRunId',37076318240
    ),
    now(),
    now()
  )
  ON CONFLICT(asset_id,adapter_key) DO UPDATE SET
    version=excluded.version,
    direction=excluded.direction,
    status='verified',
    contract=excluded.contract,
    mapping=excluded.mapping,
    idempotency_strategy=excluded.idempotency_strategy,
    rollback_strategy=excluded.rollback_strategy,
    evidence=excluded.evidence,
    verified_at=now(),
    updated_at=now();

  FOR t IN
    SELECT id,slug
    FROM public.tenants
    WHERE slug IN ('cafe1-luton','cafe1-st-albans','mealdeck')
    ORDER BY slug
  LOOP
    SELECT *
    INTO conn
    FROM public.product_connections
    WHERE tenant_id=t.id
      AND product_key='dishbee'
    ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC,id
    LIMIT 1;

    INSERT INTO public.portfolio_migration_targets(
      tenant_id,asset_id,target_tenant_id,target_product_key,source_workspace_id,
      product_connection_id,required,status,updated_at
    )
    VALUES(
      a.tenant_id,
      a.id,
      t.id,
      'dishbee',
      CASE WHEN conn.id IS NOT NULL AND conn.status='connected' THEN conn.external_tenant_id ELSE NULL END,
      CASE WHEN conn.id IS NOT NULL AND conn.status='connected' THEN conn.id ELSE NULL END,
      true,
      CASE WHEN conn.id IS NOT NULL AND conn.status='connected' THEN 'mapped' ELSE 'blocked' END,
      now()
    )
    ON CONFLICT(asset_id,target_tenant_id,target_product_key) DO UPDATE SET
      source_workspace_id=CASE
        WHEN conn.id IS NOT NULL AND conn.status='connected' THEN conn.external_tenant_id
        ELSE public.portfolio_migration_targets.source_workspace_id
      END,
      product_connection_id=CASE
        WHEN conn.id IS NOT NULL AND conn.status='connected' THEN conn.id
        ELSE public.portfolio_migration_targets.product_connection_id
      END,
      required=true,
      status=CASE
        WHEN conn.id IS NOT NULL AND conn.status='connected'
          AND public.portfolio_migration_targets.status<>'cutover'
          THEN 'mapped'
        WHEN conn.id IS NULL OR conn.status<>'connected' THEN 'blocked'
        ELSE public.portfolio_migration_targets.status
      END,
      updated_at=now();

    prepared := prepared + 1;
    IF conn.id IS NOT NULL AND conn.status='connected' THEN
      connected := connected + 1;
    END IF;
    conn := NULL;
  END LOOP;

  INSERT INTO public.portfolio_cutover_plans(
    asset_id,tenant_id,change_window,freeze_strategy,dns_strategy,
    communication_plan,rollback_strategy,rollback_thresholds,smoke_tests,updated_at
  )
  VALUES(
    a.id,
    a.tenant_id,
    'To be approved after all three live shadow handoffs pass',
    'Freeze legacy Cafe 1 writes immediately before final delta import; keep source databases intact through the rollback window',
    'No DNS switch until target smoke tests and order/KDS/payment checks pass',
    'Notify operations before freeze and after each target passes smoke tests',
    'Disable Omniqora runtime connection and restore routing to the unchanged source deployment if any required smoke/parity check fails',
    jsonb_build_object(
      'anyPaymentKdsFailure',true,
      'anyCrossTenantLeak',true,
      'anyOrderMoneyParityFailure',true
    ),
    jsonb_build_array(
      'Cafe 1 Luton paid order -> KDS',
      'Cafe 1 St Albans paid order -> KDS',
      'MealDeck multi-brand paid order -> KDS',
      'native Dishbee lifecycle event -> Omniqora',
      'negative cross-tenant RLS check'
    ),
    now()
  )
  ON CONFLICT(asset_id) DO UPDATE SET
    freeze_strategy=excluded.freeze_strategy,
    dns_strategy=excluded.dns_strategy,
    communication_plan=excluded.communication_plan,
    rollback_strategy=excluded.rollback_strategy,
    rollback_thresholds=excluded.rollback_thresholds,
    smoke_tests=excluded.smoke_tests,
    updated_at=now();

  result:=public.migration_evaluate_asset(a.id);

  RETURN jsonb_build_object(
    'assetId',a.id,
    'assetSourceRow',82,
    'targetsPrepared',prepared,
    'connectedTargets',connected,
    'approvalRequired',true,
    'evaluation',result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migration_prepare_dishbee_production() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_prepare_dishbee_production() TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.migration_refresh_target(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  t public.portfolio_migration_targets%rowtype;
  conn public.product_connections%rowtype;
  readiness jsonb;
  runtime_event public.platform_events%rowtype;
  blockers jsonb:='[]'::jsonb;
  new_status text;
BEGIN
  SELECT * INTO t
  FROM public.portfolio_migration_targets
  WHERE id=_target
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration target not found';
  END IF;

  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.is_tenant_member(t.tenant_id,auth.uid()) THEN
    RAISE EXCEPTION 'Migration target access denied';
  END IF;

  SELECT *
  INTO conn
  FROM public.product_connections
  WHERE tenant_id=t.target_tenant_id
    AND product_key=t.target_product_key
    AND (t.source_workspace_id IS NULL OR external_tenant_id=t.source_workspace_id)
  ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,id
  LIMIT 1;

  IF conn.id IS NULL OR conn.status<>'connected' THEN
    blockers:=blockers||jsonb_build_array('product_connection_not_connected');
  ELSE
    UPDATE public.portfolio_migration_targets
    SET product_connection_id=conn.id,
        source_workspace_id=COALESCE(source_workspace_id,conn.external_tenant_id)
    WHERE id=t.id;
  END IF;

  BEGIN
    readiness:=public.get_tenant_product_readiness(t.target_tenant_id,t.target_product_key);
  EXCEPTION WHEN OTHERS THEN
    readiness:=jsonb_build_object(
      'ready',false,
      'blockers',jsonb_build_array('tenant_product_readiness_unavailable')
    );
  END;

  IF NOT COALESCE((readiness->>'ready')::boolean,false) THEN
    blockers:=blockers||COALESCE(readiness->'blockers','[]'::jsonb);
  END IF;

  IF t.target_product_key='dishbee' THEN
    SELECT e.*
    INTO runtime_event
    FROM public.platform_events e
    WHERE e.tenant_id=t.target_tenant_id
      AND e.product_key='dishbee'
      AND e.event_type='dishbee.runtime.readiness'
      AND e.occurred_at>now()-interval '15 minutes'
      AND (
        t.source_workspace_id IS NULL
        OR e.payload->>'dishbeeTenantId'=t.source_workspace_id
      )
    ORDER BY e.occurred_at DESC
    LIMIT 1;

    IF runtime_event.id IS NULL THEN
      blockers:=blockers||jsonb_build_array('dishbee_runtime_readiness_missing_or_stale');
    ELSIF lower(COALESCE(runtime_event.payload->>'ready','false'))<>'true' THEN
      blockers:=blockers||jsonb_build_array('dishbee_runtime_not_ready');
      blockers:=blockers||COALESCE(runtime_event.payload->'blockers','[]'::jsonb);
    END IF;
  END IF;

  new_status:=CASE WHEN jsonb_array_length(blockers)=0 THEN 'ready' ELSE 'blocked' END;

  UPDATE public.portfolio_migration_targets
  SET status=new_status,updated_at=now()
  WHERE id=t.id;

  RETURN jsonb_build_object(
    'targetId',t.id,
    'ready',jsonb_array_length(blockers)=0,
    'blockers',blockers,
    'productReadiness',readiness,
    'runtimeReadinessEventId',runtime_event.id,
    'runtimeReadinessAt',runtime_event.occurred_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migration_refresh_target(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_refresh_target(uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.project_dishbee_runtime_event_to_migration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  target public.portfolio_migration_targets%rowtype;
  conn public.product_connections%rowtype;
BEGIN
  IF NEW.product_key<>'dishbee' THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type='dishbee.runtime.readiness' THEN
    SELECT *
    INTO conn
    FROM public.product_connections
    WHERE tenant_id=NEW.tenant_id
      AND product_key='dishbee'
      AND status='connected'
      AND external_tenant_id=NEW.payload->>'dishbeeTenantId'
    ORDER BY updated_at DESC,id
    LIMIT 1;

    IF conn.id IS NOT NULL THEN
      SELECT mt.*
      INTO target
      FROM public.portfolio_migration_targets mt
      JOIN public.portfolio_assets a ON a.id=mt.asset_id
      WHERE mt.target_tenant_id=NEW.tenant_id
        AND mt.target_product_key='dishbee'
        AND a.canonical_product_key='dishbee'
      ORDER BY mt.created_at
      LIMIT 1;

      IF target.id IS NOT NULL THEN
        UPDATE public.portfolio_migration_targets
        SET source_workspace_id=conn.external_tenant_id,
            product_connection_id=conn.id,
            status=CASE
              WHEN lower(COALESCE(NEW.payload->>'ready','false'))='true' THEN 'mapped'
              ELSE 'blocked'
            END,
            updated_at=now()
        WHERE id=target.id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.event_type='dishbee.order.handoff.accepted' THEN
    SELECT mt.*
    INTO target
    FROM public.portfolio_migration_targets mt
    JOIN public.portfolio_assets a ON a.id=mt.asset_id
    WHERE mt.target_tenant_id=NEW.tenant_id
      AND mt.target_product_key='dishbee'
      AND mt.required
      AND a.canonical_product_key='dishbee'
    ORDER BY mt.created_at
    LIMIT 1;

    IF target.id IS NOT NULL THEN
      INSERT INTO public.portfolio_shadow_checks(
        tenant_id,asset_id,target_id,check_key,check_type,status,
        source_value,target_value,tolerance,evidence,checked_at
      )
      VALUES(
        target.tenant_id,
        target.asset_id,
        target.id,
        'dishbee-order-handoff:'||NEW.id::text,
        'order_parity',
        'passed',
        jsonb_build_object(
          'omniqoraSessionId',NEW.payload->>'omniqoraSessionId',
          'totalMinor',NEW.payload->'totalMinor',
          'currency',NEW.payload->>'currency'
        ),
        jsonb_build_object(
          'dishbeeOrderId',NEW.payload->>'dishbeeOrderId',
          'acceptedEventId',NEW.id
        ),
        jsonb_build_object('requireExactMoneyParity',true),
        jsonb_build_object(
          'platformEventId',NEW.id,
          'eventType',NEW.event_type,
          'sourceService',NEW.source_service
        ),
        NEW.occurred_at
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_dishbee_runtime_event_to_migration
ON public.platform_events;

CREATE TRIGGER project_dishbee_runtime_event_to_migration
AFTER INSERT ON public.platform_events
FOR EACH ROW
WHEN (
  NEW.product_key='dishbee'
  AND NEW.event_type IN ('dishbee.runtime.readiness','dishbee.order.handoff.accepted')
)
EXECUTE FUNCTION public.project_dishbee_runtime_event_to_migration();


CREATE OR REPLACE FUNCTION public.migration_evaluate_asset(_asset uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  a public.portfolio_assets%rowtype;
  blockers jsonb:='[]'::jsonb;
  warnings jsonb:='[]'::jsonb;
  audit_ok boolean;
  adapter_ok boolean;
  plan_ok boolean;
  required_targets integer;
  ready_targets integer;
  failed_shadow integer;
  passed_shadow integer;
  passed_shadow_targets integer;
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
    SELECT 1 FROM public.portfolio_repo_audits
    WHERE asset_id=_asset AND status='passed'
  ) INTO audit_ok;

  IF NOT audit_ok THEN
    blockers:=blockers||jsonb_build_array('repo_audit_not_passed');
  END IF;

  IF a.target_mode='pending' OR a.canonical_product_key IS NULL THEN
    blockers:=blockers||jsonb_build_array('migration_decision_incomplete');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.portfolio_migration_adapters
    WHERE asset_id=_asset
      AND status='verified'
      AND rollback_strategy IS NOT NULL
  ) INTO adapter_ok;

  IF NOT adapter_ok THEN
    blockers:=blockers||jsonb_build_array('verified_adapter_missing');
  END IF;

  SELECT
    count(*) FILTER(WHERE required),
    count(*) FILTER(WHERE required AND status='ready')
  INTO required_targets,ready_targets
  FROM public.portfolio_migration_targets
  WHERE asset_id=_asset;

  IF required_targets=0 THEN
    blockers:=blockers||jsonb_build_array('required_targets_missing');
  ELSIF ready_targets<required_targets THEN
    blockers:=blockers||jsonb_build_array('required_targets_not_ready');
  END IF;

  SELECT
    count(*) FILTER(WHERE s.status='failed'),
    count(*) FILTER(WHERE s.status='passed'),
    count(DISTINCT s.target_id) FILTER(
      WHERE s.status='passed'
        AND s.check_type='order_parity'
        AND t.required
    )
  INTO failed_shadow,passed_shadow,passed_shadow_targets
  FROM public.portfolio_shadow_checks s
  LEFT JOIN public.portfolio_migration_targets t ON t.id=s.target_id
  WHERE s.asset_id=_asset
    AND s.checked_at>now()-interval '7 days';

  IF failed_shadow>0 THEN
    blockers:=blockers||jsonb_build_array('shadow_checks_failed');
  END IF;

  IF a.canonical_product_key='dishbee' THEN
    IF COALESCE(passed_shadow_targets,0)<required_targets THEN
      blockers:=blockers||jsonb_build_array('shadow_order_parity_missing_for_required_targets');
    END IF;
  ELSIF passed_shadow=0 THEN
    blockers:=blockers||jsonb_build_array('shadow_checks_missing');
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
    'passedShadowChecks',passed_shadow,
    'passedShadowTargets',COALESCE(passed_shadow_targets,0),
    'failedShadowChecks',failed_shadow
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migration_evaluate_asset(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_evaluate_asset(uuid) TO authenticated,service_role;

COMMIT;
