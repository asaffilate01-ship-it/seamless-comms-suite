BEGIN;

-- Shared commerce retention/risk primitives recovered from the Dishbee+/Onyn donor.
-- These are product-neutral and are intended to replace duplicated vertical tables
-- progressively, not force immediate destructive migrations.

CREATE TABLE IF NOT EXISTS public.commerce_order_schedules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  schedule_kind text NOT NULL DEFAULT 'one_off' CHECK(schedule_kind IN('one_off','recurring')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','completed','cancelled','failed')),
  recurrence_rule text,
  timezone text NOT NULL DEFAULT 'Europe/London',
  next_run_at timestamptz NOT NULL,
  end_at timestamptz,
  basket_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  fulfilment_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method_ref text,
  idempotency_key text NOT NULL,
  last_order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  last_run_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE INDEX IF NOT EXISTS commerce_order_schedules_due_idx
  ON public.commerce_order_schedules(status,next_run_at);

CREATE TABLE IF NOT EXISTS public.commerce_substitution_preferences(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  preference text NOT NULL CHECK(preference IN('best_match','contact_me','refund','specific')),
  preferred_listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  max_price_delta_minor bigint CHECK(max_price_delta_minor IS NULL OR max_price_delta_minor>=0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,listing_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_customer_favourites(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  favourite_type text NOT NULL CHECK(favourite_type IN('vendor','listing','order')),
  favourite_ref text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key,customer_ref,favourite_type,favourite_ref)
);

CREATE TABLE IF NOT EXISTS public.commerce_referral_programmes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','retired')),
  advocate_reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  friend_reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualification_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  fraud_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_referral_codes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.commerce_referral_programmes(id) ON DELETE CASCADE,
  advocate_customer_ref text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','expired','revoked')),
  expires_at timestamptz,
  uses integer NOT NULL DEFAULT 0 CHECK(uses>=0),
  max_uses integer CHECK(max_uses IS NULL OR max_uses>0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(programme_id,code)
);

CREATE TABLE IF NOT EXISTS public.commerce_referral_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.commerce_referral_programmes(id) ON DELETE CASCADE,
  code_id uuid REFERENCES public.commerce_referral_codes(id) ON DELETE SET NULL,
  advocate_customer_ref text,
  referred_customer_ref text,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK(event_type IN('opened','signed_up','qualified','rewarded','reversed','blocked')),
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.commerce_membership_plans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  plan_key text NOT NULL,
  name text NOT NULL,
  monthly_amount_minor bigint NOT NULL DEFAULT 0 CHECK(monthly_amount_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,plan_key)
);

CREATE TABLE IF NOT EXISTS public.commerce_memberships(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.commerce_membership_plans(id) ON DELETE RESTRICT,
  customer_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('trial','active','past_due','paused','cancelled','expired')),
  provider_subscription_ref text,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id,customer_ref)
);

CREATE TABLE IF NOT EXISTS public.commerce_value_programmes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  name text NOT NULL,
  programme_type text NOT NULL CHECK(programme_type IN('gift_card','wallet','meal_allowance','corporate','refund_credit','prepaid_tab')),
  currency text NOT NULL DEFAULT 'GBP',
  transferable boolean NOT NULL DEFAULT false,
  expiry_days integer CHECK(expiry_days IS NULL OR expiry_days>0),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_value_accounts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.commerce_value_programmes(id) ON DELETE CASCADE,
  customer_ref text,
  company_ref text,
  public_ref text NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0 CHECK(balance_minor>=0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended','expired','closed')),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,public_ref)
);

CREATE TABLE IF NOT EXISTS public.commerce_value_ledger(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.commerce_value_accounts(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK(entry_type IN('issue','topup','redeem','refund','adjustment','expire','transfer_in','transfer_out','reverse')),
  amount_minor bigint NOT NULL,
  balance_after_minor bigint NOT NULL CHECK(balance_after_minor>=0),
  source_ref text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,source_ref)
);

CREATE TABLE IF NOT EXISTS public.commerce_disputes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  customer_ref text,
  vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
  dispute_type text NOT NULL CHECK(dispute_type IN('missing_item','wrong_item','quality','late','non_delivery','payment','refund','safety','other')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','triage','awaiting_customer','awaiting_vendor','review','resolved','rejected','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
  claimed_amount_minor bigint CHECK(claimed_amount_minor IS NULL OR claimed_amount_minor>=0),
  resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS commerce_disputes_queue_idx
  ON public.commerce_disputes(tenant_id,status,priority,created_at);

CREATE TABLE IF NOT EXISTS public.commerce_risk_signals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK(subject_type IN('customer','order','vendor','driver','payment','referral','device')),
  subject_ref text NOT NULL,
  signal_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK(severity IN('low','medium','high','critical')),
  risk_score numeric CHECK(risk_score IS NULL OR (risk_score>=0 AND risk_score<=100)),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewing','cleared','confirmed','actioned','expired')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_risk_open_idx
  ON public.commerce_risk_signals(tenant_id,status,severity,created_at);

CREATE TABLE IF NOT EXISTS public.commerce_vendor_capacity(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  location_ref text,
  state text NOT NULL DEFAULT 'normal' CHECK(state IN('normal','busy','throttled','paused','offline')),
  prep_delay_minutes integer NOT NULL DEFAULT 0 CHECK(prep_delay_minutes>=0),
  order_interval_seconds integer NOT NULL DEFAULT 0 CHECK(order_interval_seconds>=0),
  max_active_orders integer CHECK(max_active_orders IS NULL OR max_active_orders>0),
  auto_resume_at timestamptz,
  reason text,
  source text NOT NULL DEFAULT 'manual' CHECK(source IN('manual','system','provider')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key,vendor_id,location_ref)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commerce_order_schedules','commerce_substitution_preferences','commerce_customer_favourites',
    'commerce_referral_programmes','commerce_referral_codes','commerce_referral_events',
    'commerce_membership_plans','commerce_memberships','commerce_value_programmes',
    'commerce_value_accounts','commerce_value_ledger','commerce_disputes',
    'commerce_risk_signals','commerce_vendor_capacity'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
      'commerce expansion read '||t,t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))',
      'commerce expansion write '||t,t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.commerce_schedule_order(
  _tenant uuid,_product text,_customer text,_kind text,_next_run timestamptz,
  _timezone text,_recurrence text,_basket jsonb,_fulfilment jsonb,_payment_ref text,_idempotency text,
  _end_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Commerce schedule access denied';
  END IF;
  IF _kind NOT IN('one_off','recurring') THEN RAISE EXCEPTION 'Invalid schedule kind'; END IF;
  IF _kind='recurring' AND NULLIF(trim(_recurrence),'') IS NULL THEN RAISE EXCEPTION 'Recurrence rule required'; END IF;
  IF jsonb_typeof(_basket)<>'array' OR jsonb_array_length(_basket)<1 THEN RAISE EXCEPTION 'Basket required'; END IF;
  INSERT INTO public.commerce_order_schedules(
    tenant_id,product_key,customer_ref,schedule_kind,recurrence_rule,timezone,next_run_at,end_at,
    basket_snapshot,fulfilment_snapshot,payment_method_ref,idempotency_key
  ) VALUES(
    _tenant,_product,_customer,_kind,NULLIF(trim(_recurrence),''),COALESCE(NULLIF(trim(_timezone),''),'Europe/London'),
    _next_run,_end_at,_basket,COALESCE(_fulfilment,'{}'::jsonb),NULLIF(trim(_payment_ref),''),_idempotency
  )
  ON CONFLICT(tenant_id,product_key,idempotency_key) DO UPDATE SET
    next_run_at=EXCLUDED.next_run_at,end_at=EXCLUDED.end_at,basket_snapshot=EXCLUDED.basket_snapshot,
    fulfilment_snapshot=EXCLUDED.fulfilment_snapshot,payment_method_ref=EXCLUDED.payment_method_ref,updated_at=now()
  RETURNING id INTO rid;
  RETURN rid;
END $$;

REVOKE ALL ON FUNCTION public.commerce_schedule_order(uuid,text,text,text,timestamptz,text,text,jsonb,jsonb,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_schedule_order(uuid,text,text,text,timestamptz,text,text,jsonb,jsonb,text,text,timestamptz) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.commerce_value_adjust(
  _tenant uuid,_account uuid,_type text,_amount bigint,_source text,_order uuid DEFAULT NULL,_reason text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.commerce_value_accounts%rowtype;delta bigint;new_balance bigint;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
     AND NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Stored value access denied';
  END IF;
  SELECT * INTO a FROM public.commerce_value_accounts WHERE id=_account AND tenant_id=_tenant FOR UPDATE;
  IF NOT FOUND OR a.status<>'active' THEN RAISE EXCEPTION 'Stored value account unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.commerce_value_ledger WHERE tenant_id=_tenant AND source_ref=_source) THEN
    SELECT balance_after_minor INTO new_balance FROM public.commerce_value_ledger WHERE tenant_id=_tenant AND source_ref=_source;
    RETURN new_balance;
  END IF;
  delta:=CASE WHEN _type IN('redeem','expire','transfer_out') THEN -abs(_amount) ELSE _amount END;
  new_balance:=a.balance_minor+delta;
  IF new_balance<0 THEN RAISE EXCEPTION 'Insufficient stored value balance'; END IF;
  UPDATE public.commerce_value_accounts SET balance_minor=new_balance,updated_at=now() WHERE id=a.id;
  INSERT INTO public.commerce_value_ledger(
    tenant_id,account_id,order_id,entry_type,amount_minor,balance_after_minor,source_ref,reason
  ) VALUES(_tenant,a.id,_order,_type,delta,new_balance,_source,_reason);
  RETURN new_balance;
END $$;

REVOKE ALL ON FUNCTION public.commerce_value_adjust(uuid,uuid,text,bigint,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_value_adjust(uuid,uuid,text,bigint,text,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.server_record_commerce_risk_signal(
  _tenant uuid,_product text,_subject_type text,_subject_ref text,_signal_type text,
  _severity text,_risk_score numeric,_evidence jsonb,_source_ref text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  INSERT INTO public.commerce_risk_signals(
    tenant_id,product_key,subject_type,subject_ref,signal_type,severity,risk_score,evidence,source_ref
  ) VALUES(
    _tenant,_product,_subject_type,_subject_ref,_signal_type,_severity,_risk_score,
    COALESCE(_evidence,'{}'::jsonb),NULLIF(trim(_source_ref),'')
  ) RETURNING id INTO rid;
  RETURN rid;
END $$;

REVOKE ALL ON FUNCTION public.server_record_commerce_risk_signal(uuid,text,text,text,text,text,numeric,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_record_commerce_risk_signal(uuid,text,text,text,text,text,numeric,jsonb,text) TO service_role;

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
('omniqora.commerce-retention','Commerce Retention','Scheduled/routine ordering, favourites, substitutions, referrals and memberships.','commerce','omniqora',true,'automatic','active','built_main'),
('omniqora.stored-value','Stored Value','Gift cards, wallets, meal allowances, corporate value, refund credit and prepaid tabs.','commerce','omniqora',true,'automatic','active','built_main'),
('omniqora.commerce-risk','Commerce Risk & Disputes','Marketplace disputes, triage, risk signals and decision evidence.','commerce','omniqora',true,'automatic','active','built_main'),
('omniqora.vendor-capacity','Vendor Capacity','Marketplace merchant busy, throttle, pause, prep-delay and auto-resume controls.','commerce','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('omniqora.commerce-retention','omniqora.marketplace',true),
('omniqora.commerce-retention','omniqora.crm',false),
('omniqora.stored-value','omniqora.payments',true),
('omniqora.commerce-risk','omniqora.marketplace',true),
('omniqora.commerce-risk','omniqora.support',false),
('omniqora.vendor-capacity','omniqora.marketplace',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-plus','omniqora.commerce-retention',true,false),
('dishbee-plus','omniqora.stored-value',true,false),
('dishbee-plus','omniqora.commerce-risk',true,false),
('dishbee-plus','omniqora.vendor-capacity',true,false),
('dishbee-one','omniqora.stored-value',false,false),
('dishbee-one','omniqora.commerce-risk',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

COMMIT;
