-- Runtime state for customer journeys, sales engagement, product-scoped RFM and feedback delivery.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_value_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK (event_kind IN ('purchase','refund','adjustment')),
  amount_minor bigint NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source_type text NOT NULL,
  source_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,tenant_product_id,source_type,source_ref,event_kind)
);
CREATE INDEX IF NOT EXISTS customer_value_events_person_idx
  ON public.customer_value_events (tenant_id,tenant_product_id,crm_person_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_rfm_product (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  recency_days integer,
  frequency integer NOT NULL DEFAULT 0 CHECK (frequency >= 0),
  monetary_minor bigint NOT NULL DEFAULT 0,
  r_score integer CHECK (r_score IS NULL OR r_score BETWEEN 1 AND 5),
  f_score integer CHECK (f_score IS NULL OR f_score BETWEEN 1 AND 5),
  m_score integer CHECK (m_score IS NULL OR m_score BETWEEN 1 AND 5),
  segments text[] NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,tenant_product_id,crm_person_id,currency)
);
CREATE INDEX IF NOT EXISTS customer_rfm_product_segment_idx
  ON public.customer_rfm_product (tenant_id,tenant_product_id,calculated_at DESC);

CREATE TABLE IF NOT EXISTS public.journey_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL REFERENCES public.journey_definitions(id) ON DELETE CASCADE,
  crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  subject_ref text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','waiting','paused','completed','cancelled','failed')),
  current_node_id text,
  last_outcome text,
  next_run_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (crm_person_id IS NOT NULL OR subject_ref IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS journey_enrolments_due_idx
  ON public.journey_enrolments (tenant_id,tenant_product_id,status,next_run_at);
CREATE INDEX IF NOT EXISTS journey_enrolments_person_idx
  ON public.journey_enrolments (tenant_id,tenant_product_id,crm_person_id,started_at DESC);

CREATE TABLE IF NOT EXISTS public.journey_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  enrolment_id uuid NOT NULL REFERENCES public.journey_enrolments(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_kind text NOT NULL,
  state text NOT NULL CHECK (state IN ('started','completed','waiting','skipped','failed')),
  outcome text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS journey_execution_log_idx
  ON public.journey_execution_log (tenant_id,enrolment_id,started_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_sequence_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.sales_sequences(id) ON DELETE CASCADE,
  crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  subject_ref text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','waiting','paused','completed','cancelled','failed')),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  next_run_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (crm_person_id IS NOT NULL OR subject_ref IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS sales_sequence_enrolments_due_idx
  ON public.sales_sequence_enrolments (tenant_id,tenant_product_id,status,next_run_at);

CREATE TABLE IF NOT EXISTS public.sales_sequence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  enrolment_id uuid NOT NULL REFERENCES public.sales_sequence_enrolments(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK (step_index >= 0),
  step_kind text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','sent','completed','skipped','failed')),
  provider_ref text,
  outcome text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_sequence_events_idx
  ON public.sales_sequence_events (tenant_id,enrolment_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  survey_id uuid NOT NULL REFERENCES public.feedback_surveys(id) ON DELETE CASCADE,
  crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  subject_ref text,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','web','app')),
  delivery_status text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued','sent','delivered','opened','responded','failed','cancelled')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  provider_ref text,
  sent_at timestamptz,
  delivered_at timestamptz,
  responded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (crm_person_id IS NOT NULL OR subject_ref IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS feedback_requests_lookup_idx
  ON public.feedback_requests (tenant_id,tenant_product_id,survey_id,delivery_status,created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_value_events','customer_rfm_product','journey_enrolments','journey_execution_log',
    'sales_sequence_enrolments','sales_sequence_events','feedback_requests'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','growth runtime tenant read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'growth runtime tenant read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','growth runtime tenant write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))',
      'growth runtime tenant write',t
    );
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journey_enrolments','sales_sequence_enrolments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_product_rfm(_tenant uuid,_tenant_product uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE affected integer := 0;
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Growth write access denied'; END IF;
  IF NOT public.has_module_entitlement(_tenant,_tenant_product,'journeys.core',now())
     AND NOT public.has_module_entitlement(_tenant,_tenant_product,'marketing.core',now()) THEN
    RAISE EXCEPTION 'Customer intelligence entitlement required';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.tenant_products
    WHERE id=_tenant_product AND tenant_id=_tenant AND status='active'
  ) THEN RAISE EXCEPTION 'Active tenant product required'; END IF;

  DELETE FROM public.customer_rfm_product
  WHERE tenant_id=_tenant AND tenant_product_id=_tenant_product;

  WITH base AS (
    SELECT
      e.crm_person_id,e.currency,
      GREATEST(0,(CURRENT_DATE - MAX(e.occurred_at)::date))::integer AS recency_days,
      COUNT(*) FILTER (WHERE e.event_kind='purchase')::integer AS frequency,
      COALESCE(SUM(CASE
        WHEN e.event_kind='purchase' THEN ABS(e.amount_minor)
        WHEN e.event_kind='refund' THEN -ABS(e.amount_minor)
        ELSE e.amount_minor
      END),0)::bigint AS monetary_minor
    FROM public.customer_value_events e
    WHERE e.tenant_id=_tenant AND e.tenant_product_id=_tenant_product
    GROUP BY e.crm_person_id,e.currency
  ), scored AS (
    SELECT
      b.*,
      (6-NTILE(5) OVER (ORDER BY b.recency_days ASC))::integer AS r_score,
      NTILE(5) OVER (ORDER BY b.frequency ASC)::integer AS f_score,
      NTILE(5) OVER (ORDER BY b.monetary_minor ASC)::integer AS m_score
    FROM base b
  )
  INSERT INTO public.customer_rfm_product(
    tenant_id,tenant_product_id,crm_person_id,currency,recency_days,frequency,monetary_minor,
    r_score,f_score,m_score,segments,calculated_at
  )
  SELECT
    _tenant,_tenant_product,s.crm_person_id,s.currency,s.recency_days,s.frequency,s.monetary_minor,
    s.r_score,s.f_score,s.m_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN s.r_score>=4 AND s.f_score>=4 AND s.m_score>=4 THEN 'Champions' END,
      CASE WHEN s.m_score>=4 THEN 'High value' END,
      CASE WHEN s.frequency=1 AND s.recency_days<=30 THEN 'New' END,
      CASE WHEN s.f_score>=4 THEN 'Loyal' END,
      CASE WHEN s.recency_days>90 AND s.frequency>=2 THEN 'At risk' END,
      CASE WHEN s.recency_days>180 THEN 'Dormant' END,
      CASE WHEN s.recency_days<=45 AND s.frequency>=2 THEN 'Likely to repurchase' END
    ],NULL),
    now()
  FROM scored s;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recalculate_product_rfm(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recalculate_product_rfm(uuid,uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.submit_public_feedback(
  _token_hash text,_score numeric,_comment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  req public.feedback_requests;
  survey public.feedback_surveys;
  response_id uuid;
  sentiment_value text;
BEGIN
  SELECT * INTO req
  FROM public.feedback_requests
  WHERE token_hash=_token_hash
  FOR UPDATE;

  IF NOT FOUND OR req.expires_at<=now() OR req.delivery_status IN ('responded','cancelled','failed') THEN
    RAISE EXCEPTION 'Feedback request is invalid or expired';
  END IF;

  SELECT * INTO survey FROM public.feedback_surveys WHERE id=req.survey_id;
  IF NOT FOUND OR survey.status<>'active' THEN
    RAISE EXCEPTION 'Feedback survey is unavailable';
  END IF;

  IF survey.survey_type='nps' AND (_score<0 OR _score>10) THEN
    RAISE EXCEPTION 'NPS score must be between 0 and 10';
  ELSIF survey.survey_type='csat' AND (_score<1 OR _score>5) THEN
    RAISE EXCEPTION 'CSAT score must be between 1 and 5';
  ELSIF survey.survey_type='ces' AND (_score<1 OR _score>7) THEN
    RAISE EXCEPTION 'CES score must be between 1 and 7';
  ELSIF survey.survey_type='custom' AND (_score<0 OR _score>10) THEN
    RAISE EXCEPTION 'Custom survey score must be between 0 and 10';
  END IF;

  sentiment_value:=CASE
    WHEN survey.survey_type='nps' AND _score>=9 THEN 'positive'
    WHEN survey.survey_type='nps' AND _score<=6 THEN 'negative'
    WHEN survey.survey_type='csat' AND _score>=4 THEN 'positive'
    WHEN survey.survey_type='csat' AND _score<=2 THEN 'negative'
    WHEN survey.survey_type='ces' AND _score>=5 THEN 'positive'
    WHEN survey.survey_type='ces' AND _score<=3 THEN 'negative'
    ELSE 'neutral'
  END;

  INSERT INTO public.feedback_responses(
    tenant_id,survey_id,crm_person_id,score,comment,sentiment,source_ref,metadata,received_at
  ) VALUES (
    req.tenant_id,req.survey_id,req.crm_person_id,_score,NULLIF(btrim(_comment),''),
    sentiment_value,'feedback-request:'||req.id::text,
    jsonb_build_object('feedbackRequestId',req.id,'tenantProductId',req.tenant_product_id),now()
  ) RETURNING id INTO response_id;

  UPDATE public.feedback_requests
  SET delivery_status='responded',responded_at=now()
  WHERE id=req.id;

  RETURN response_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_public_feedback(text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_feedback(text,numeric,text) TO anon,authenticated,service_role;

COMMIT;
