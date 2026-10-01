-- Close remaining reusable Omniqora/Jungleworks platform gaps:
-- richer Customer 360 intelligence, universal Agent runtime, marketplace commercials,
-- and launch-readiness state for the SaaS Factory.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_intelligence_profiles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  lifetime_value_minor bigint NOT NULL DEFAULT 0,
  average_order_value_minor bigint NOT NULL DEFAULT 0,
  purchases_count integer NOT NULL DEFAULT 0 CHECK (purchases_count >= 0),
  refunds_count integer NOT NULL DEFAULT 0 CHECK (refunds_count >= 0),
  days_since_purchase integer,
  engagement_score numeric(8,2) NOT NULL DEFAULT 0,
  churn_score numeric(8,2) CHECK (churn_score IS NULL OR churn_score BETWEEN 0 AND 100),
  repurchase_score numeric(8,2) CHECK (repurchase_score IS NULL OR repurchase_score BETWEEN 0 AND 100),
  discount_sensitivity numeric(8,2) CHECK (discount_sensitivity IS NULL OR discount_sensitivity BETWEEN 0 AND 100),
  profit_contribution_minor bigint,
  preferred_channel text CHECK (preferred_channel IS NULL OR preferred_channel IN ('email','sms','whatsapp','voice','push','web','app')),
  preferred_product_refs text[] NOT NULL DEFAULT '{}',
  segments text[] NOT NULL DEFAULT '{}',
  model_version text,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,tenant_product_id,crm_person_id,currency)
);
CREATE INDEX IF NOT EXISTS customer_intelligence_segments_idx
  ON public.customer_intelligence_profiles (tenant_id,tenant_product_id,calculated_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_app_capability_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  profile_key text NOT NULL,
  name text NOT NULL,
  job_types text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  navigation jsonb NOT NULL DEFAULT '[]'::jsonb,
  offline_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_product_id,profile_key)
);

CREATE TABLE IF NOT EXISTS public.agent_app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  capability_profile_id uuid REFERENCES public.agent_app_capability_profiles(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.mobile_devices(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'online' CHECK (state IN ('online','offline','background','signed_out','revoked')),
  last_sync_at timestamptz,
  last_position_at timestamptz,
  app_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_app_sessions_agent_idx
  ON public.agent_app_sessions (tenant_id,agent_id,state,started_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_app_job_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.agent_app_sessions(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'accept','reject','arrive_pickup','collect','depart_pickup','arrive_service',
    'start_service','pause','resume','arrive_dropoff','complete','fail','cancel_request',
    'message','call_mask','pod','note'
  )),
  client_event_id text NOT NULL,
  client_occurred_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,client_event_id)
);
CREATE INDEX IF NOT EXISTS agent_app_job_actions_job_idx
  ON public.agent_app_job_actions (tenant_id,job_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_commercial_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  commission_rate_bps integer NOT NULL DEFAULT 0 CHECK (commission_rate_bps BETWEEN 0 AND 10000),
  commission_fixed_minor bigint NOT NULL DEFAULT 0 CHECK (commission_fixed_minor >= 0),
  payout_delay_days integer NOT NULL DEFAULT 0 CHECK (payout_delay_days BETWEEN 0 AND 180),
  reserve_rate_bps integer NOT NULL DEFAULT 0 CHECK (reserve_rate_bps BETWEEN 0 AND 10000),
  tax_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  settlement_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS marketplace_vendor_commercial_active_idx
  ON public.marketplace_vendor_commercial_profiles (tenant_id,tenant_product_id,vendor_id,active,effective_from DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  commission_id uuid REFERENCES public.marketplace_commissions(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('sale','commission','fee','refund','reserve','reserve_release','adjustment','payout')),
  amount_minor bigint NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','processing','settled','reversed','failed')),
  available_at timestamptz,
  provider_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_payout_ledger_vendor_idx
  ON public.marketplace_payout_ledger (tenant_id,tenant_product_id,vendor_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.saas_factory_launch_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'identity','branding','domain','localisation','entitlements','payments','communications',
    'marketplace','mobile','compliance','data','security','observability','migration'
  )),
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','warning','fail','not_applicable')),
  detail text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_product_id,check_key)
);
CREATE INDEX IF NOT EXISTS saas_factory_launch_checks_status_idx
  ON public.saas_factory_launch_checks (tenant_id,tenant_product_id,required,status,category);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_intelligence_profiles','agent_app_capability_profiles','agent_app_sessions',
    'agent_app_job_actions','marketplace_vendor_commercial_profiles','marketplace_payout_ledger',
    'saas_factory_launch_checks'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','gap closure tenant read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'gap closure tenant read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','gap closure tenant write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))',
      'gap closure tenant write',t
    );
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_app_capability_profiles','marketplace_vendor_commercial_profiles','saas_factory_launch_checks'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_customer_intelligence(
  _tenant uuid,_tenant_product uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE affected integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_write(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Customer intelligence write access denied';
  END IF;
  IF NOT public.has_module_entitlement(_tenant,_tenant_product,'crm.core',now()) THEN
    RAISE EXCEPTION 'CRM entitlement required';
  END IF;

  DELETE FROM public.customer_intelligence_profiles
   WHERE tenant_id=_tenant AND tenant_product_id=_tenant_product;

  WITH value_base AS (
    SELECT
      e.crm_person_id,e.currency,
      COUNT(*) FILTER (WHERE e.event_kind='purchase')::integer purchases_count,
      COUNT(*) FILTER (WHERE e.event_kind='refund')::integer refunds_count,
      COALESCE(SUM(CASE WHEN e.event_kind='purchase' THEN ABS(e.amount_minor)
                        WHEN e.event_kind='refund' THEN -ABS(e.amount_minor)
                        ELSE e.amount_minor END),0)::bigint lifetime_value_minor,
      COALESCE(AVG(ABS(e.amount_minor)) FILTER (WHERE e.event_kind='purchase'),0)::bigint average_order_value_minor,
      GREATEST(0,(CURRENT_DATE-MAX(e.occurred_at) FILTER (WHERE e.event_kind='purchase')::date))::integer days_since_purchase
    FROM public.customer_value_events e
    WHERE e.tenant_id=_tenant AND e.tenant_product_id=_tenant_product
    GROUP BY e.crm_person_id,e.currency
  ), activity_base AS (
    SELECT person_id,COUNT(*)::numeric AS activities_90d,
      MAX(occurred_at) AS last_activity_at
    FROM public.crm_activities
    WHERE tenant_id=_tenant AND person_id IS NOT NULL
      AND occurred_at>=now()-interval '90 days'
    GROUP BY person_id
  ), channel_base AS (
    SELECT person_id,
      (ARRAY_AGG(activity_type ORDER BY cnt DESC,activity_type))[1] AS preferred_channel
    FROM (
      SELECT person_id,activity_type,COUNT(*) cnt
      FROM public.crm_activities
      WHERE tenant_id=_tenant AND person_id IS NOT NULL
        AND activity_type IN ('email','sms','whatsapp','call')
        AND occurred_at>=now()-interval '180 days'
      GROUP BY person_id,activity_type
    ) x GROUP BY person_id
  )
  INSERT INTO public.customer_intelligence_profiles(
    tenant_id,tenant_product_id,crm_person_id,currency,lifetime_value_minor,
    average_order_value_minor,purchases_count,refunds_count,days_since_purchase,
    engagement_score,churn_score,repurchase_score,preferred_channel,segments,model_version,explanation
  )
  SELECT
    _tenant,_tenant_product,v.crm_person_id,v.currency,v.lifetime_value_minor,
    v.average_order_value_minor,v.purchases_count,v.refunds_count,v.days_since_purchase,
    LEAST(100,COALESCE(a.activities_90d,0)*5)::numeric(8,2),
    LEAST(100,GREATEST(0,COALESCE(v.days_since_purchase,365)-30)/3)::numeric(8,2),
    LEAST(100,GREATEST(0,100-COALESCE(v.days_since_purchase,365)/2)+LEAST(v.purchases_count*5,25))::numeric(8,2),
    CASE c.preferred_channel WHEN 'call' THEN 'voice' ELSE c.preferred_channel END,
    COALESCE(r.segments,'{}'::text[]),
    'deterministic-v1',
    jsonb_build_object(
      'basis','transaction + 90d CRM activity',
      'lastActivityAt',a.last_activity_at,
      'rfm',jsonb_build_object('r',r.r_score,'f',r.f_score,'m',r.m_score)
    )
  FROM value_base v
  LEFT JOIN activity_base a ON a.person_id=v.crm_person_id
  LEFT JOIN channel_base c ON c.person_id=v.crm_person_id
  LEFT JOIN public.customer_rfm_product r
    ON r.tenant_id=_tenant AND r.tenant_product_id=_tenant_product
   AND r.crm_person_id=v.crm_person_id AND r.currency=v.currency;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_customer_intelligence(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_customer_intelligence(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.saas_factory_ready(_tenant_product uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.tenant_products tp
    WHERE tp.id=_tenant_product AND tp.status='active'
  )
  AND NOT EXISTS(
    SELECT 1 FROM public.saas_factory_launch_checks c
    WHERE c.tenant_product_id=_tenant_product
      AND c.required
      AND c.status NOT IN ('pass','not_applicable')
  );
$$;
GRANT EXECUTE ON FUNCTION public.saas_factory_ready(uuid) TO authenticated,service_role;

COMMIT;
