BEGIN;

CREATE OR REPLACE FUNCTION public.migration_refresh_target(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  t public.portfolio_migration_targets%rowtype;
  conn public.product_connections%rowtype;
  readiness jsonb;
  source_runtime jsonb;
  blockers jsonb := '[]'::jsonb;
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

  SELECT * INTO conn
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
    SET product_connection_id=conn.id
    WHERE id=t.id;
  END IF;

  BEGIN
    readiness:=public.get_tenant_product_readiness(
      t.target_tenant_id,
      t.target_product_key
    );
  EXCEPTION WHEN OTHERS THEN
    readiness:=jsonb_build_object(
      'ready',false,
      'blockers',jsonb_build_array('tenant_product_readiness_unavailable')
    );
  END;

  IF NOT COALESCE((readiness->>'ready')::boolean,false) THEN
    blockers:=blockers||COALESCE(readiness->'blockers','[]'::jsonb);
  END IF;

  -- Dishbee reports its own operational readiness from the authoritative source
  -- workspace. A connected product row is not enough to declare a live source ready.
  IF t.target_product_key='dishbee' THEN
    IF t.source_workspace_id IS NULL OR btrim(t.source_workspace_id)='' THEN
      blockers:=blockers||jsonb_build_array('source_workspace_id_missing');
    ELSE
      SELECT jsonb_build_object(
        'eventId',e.id,
        'occurredAt',e.occurred_at,
        'subjectId',e.subject_id,
        'ready',COALESCE((e.payload->>'ready')::boolean,false),
        'blockers',COALESCE(e.payload->'blockers','[]'::jsonb),
        'warnings',COALESCE(e.payload->'warnings','[]'::jsonb),
        'activeLocations',COALESCE((e.payload->>'activeLocations')::integer,0),
        'mappedLocations',COALESCE((e.payload->>'mappedLocations')::integer,0),
        'dishbeeTenantId',e.payload->>'dishbeeTenantId'
      )
      INTO source_runtime
      FROM public.platform_events e
      WHERE e.tenant_id=t.target_tenant_id
        AND e.product_key=t.target_product_key
        AND e.event_type='dishbee.runtime.readiness'
        AND e.occurred_at>=now()-interval '15 minutes'
        AND (
          e.subject_id=t.source_workspace_id
          OR e.payload->>'dishbeeTenantId'=t.source_workspace_id
        )
      ORDER BY e.occurred_at DESC,e.created_at DESC
      LIMIT 1;

      IF source_runtime IS NULL THEN
        blockers:=blockers||jsonb_build_array('source_runtime_readiness_missing');
      ELSIF NOT COALESCE((source_runtime->>'ready')::boolean,false) THEN
        blockers:=blockers||jsonb_build_array('source_runtime_not_ready');
      END IF;
    END IF;
  END IF;

  new_status:=CASE
    WHEN jsonb_array_length(blockers)=0 THEN 'ready'
    ELSE 'blocked'
  END;

  UPDATE public.portfolio_migration_targets
  SET
    status=new_status,
    config=COALESCE(config,'{}'::jsonb)||jsonb_build_object(
      'lastCheckedAt',now(),
      'lastProductReadiness',COALESCE(readiness,'{}'::jsonb),
      'lastSourceRuntime',COALESCE(source_runtime,'{}'::jsonb),
      'lastBlockers',blockers
    ),
    updated_at=now()
  WHERE id=t.id;

  RETURN jsonb_build_object(
    'targetId',t.id,
    'ready',jsonb_array_length(blockers)=0,
    'blockers',blockers,
    'productReadiness',readiness,
    'sourceRuntime',source_runtime
  );
END; $$;

REVOKE ALL ON FUNCTION public.migration_refresh_target(uuid)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_refresh_target(uuid)
TO authenticated,service_role;

COMMIT;
