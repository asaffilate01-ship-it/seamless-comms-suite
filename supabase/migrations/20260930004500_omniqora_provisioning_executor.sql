-- Transactional execution for an approved SaaS Factory provisioning plan.
BEGIN;

ALTER TABLE public.platform_provisioning_runs
  ADD COLUMN IF NOT EXISTS tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.apply_platform_provisioning_run(_run uuid, _actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_provisioning_runs;
  s jsonb;
  tp uuid;
  step_kind text;
  step_payload jsonb;
  location_id uuid;
BEGIN
  SELECT * INTO r
  FROM public.platform_provisioning_runs
  WHERE id = _run
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'provisioning_run_not_found';
  END IF;
  IF r.state NOT IN ('approved','planned') THEN
    RAISE EXCEPTION 'provisioning_run_not_executable';
  END IF;

  UPDATE public.platform_provisioning_runs
  SET state='running', approved_by=_actor, started_at=COALESCE(started_at,now()), error=NULL, updated_at=now()
  WHERE id=_run;

  INSERT INTO public.tenant_products(
    tenant_id, product_key, region_key, plan_key, status, brand_key, settings, provisioned_at
  ) VALUES (
    r.tenant_id,
    r.product_key,
    r.region_key,
    NULLIF(r.plan->>'planKey',''),
    'provisioning',
    NULLIF(r.plan#>>'{brand,brandKey}',''),
    COALESCE(r.plan->'settings','{}'::jsonb),
    NULL
  )
  ON CONFLICT (tenant_id, product_key, (COALESCE(brand_key,'')))
  DO UPDATE SET
    region_key=EXCLUDED.region_key,
    plan_key=EXCLUDED.plan_key,
    status='provisioning',
    settings=public.tenant_products.settings || EXCLUDED.settings,
    updated_at=now()
  RETURNING id INTO tp;

  FOR s IN SELECT value FROM jsonb_array_elements(COALESCE(r.plan->'steps','[]'::jsonb))
  LOOP
    step_kind := s->>'kind';
    step_payload := s;

    IF step_kind = 'module' THEN
      INSERT INTO public.tenant_module_entitlements(
        tenant_id, tenant_product_id, module_key, enabled, source
      ) VALUES (r.tenant_id,tp,s->>'moduleKey',true,'provisioning')
      ON CONFLICT (tenant_id, (COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid)), module_key)
      DO UPDATE SET enabled=true, source='provisioning', updated_at=now();

    ELSIF step_kind = 'location' THEN
      INSERT INTO public.tenant_locations(
        tenant_id, tenant_product_id, location_key, name, locale, time_zone, country_code, currency
      ) VALUES (
        r.tenant_id, tp, s->>'key', s->>'name',
        COALESCE(NULLIF(s->>'locale',''), r.plan->>'locale'),
        COALESCE(NULLIF(s->>'timeZone',''), 'UTC'),
        COALESCE(NULLIF(s->>'countryCode',''), r.region_key),
        (SELECT currency FROM public.platform_region_packs WHERE region_key=r.region_key)
      )
      ON CONFLICT (tenant_id, location_key)
      DO UPDATE SET tenant_product_id=tp,name=EXCLUDED.name,locale=EXCLUDED.locale,time_zone=EXCLUDED.time_zone,
        country_code=EXCLUDED.country_code,currency=EXCLUDED.currency,status='active',updated_at=now()
      RETURNING id INTO location_id;

    ELSIF step_kind = 'domain' THEN
      INSERT INTO public.tenant_domains(
        tenant_id, tenant_product_id, hostname, purpose, is_primary
      ) VALUES (
        r.tenant_id,tp,lower(s->>'hostname'),s->>'purpose',COALESCE((s->>'primary')::boolean,false)
      )
      ON CONFLICT (hostname)
      DO UPDATE SET tenant_id=r.tenant_id,tenant_product_id=tp,purpose=EXCLUDED.purpose,is_primary=EXCLUDED.is_primary,updated_at=now();

    ELSIF step_kind = 'brand' THEN
      UPDATE public.tenant_products
      SET brand_key=COALESCE(NULLIF(s#>>'{brand,brandKey}',''),brand_key),
          settings=settings || jsonb_build_object('brand',COALESCE(s->'brand','{}'::jsonb)),
          updated_at=now()
      WHERE id=tp;

    ELSIF step_kind = 'tenant_product' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'unsupported_provisioning_step:%', step_kind;
    END IF;
  END LOOP;

  UPDATE public.tenant_products
  SET status='active', provisioned_at=COALESCE(provisioned_at,now()), updated_at=now()
  WHERE id=tp;

  UPDATE public.platform_provisioning_runs
  SET state='completed', tenant_product_id=tp, completed_at=now(), updated_at=now()
  WHERE id=_run;

  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(r.tenant_id,_actor,'platform.provisioning.completed','tenant_product',tp::text,
    jsonb_build_object('run_id',_run,'product_key',r.product_key,'region_key',r.region_key));

  RETURN tp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_platform_provisioning_run(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_platform_provisioning_run(uuid,uuid) TO service_role;

COMMIT;