BEGIN;

-- Omniqora shared commerce/growth/operations gaps promoted from the Onyn marketplace
-- and the earlier Jungleworks-style platform review. These are horizontal services:
-- Dishbee+, Dishbee One/Hive and future marketplace SaaS products consume them
-- through entitlements rather than re-implementing the same capability.

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata
) VALUES
('omniqora.promotions','Promotions & Offers','Channel-aware promotions, vouchers, bundles and redemption controls.','growth','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.referrals','Referrals','Referral programmes, attribution and reward qualification.','growth','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.memberships','Memberships','Consumer membership/subscription entitlements and recurring benefits.','commerce','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.order-scheduling','Scheduled & Recurring Orders','Scheduled, routine and recurring order definitions with release controls.','commerce','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.substitutions','Substitution Preferences','Customer substitution/refund/contact preferences for unavailable products.','commerce','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.vendor-capacity','Vendor Capacity & Rush Controls','Pause, prep-delay, capacity ceiling, auto-resume and availability controls by channel.','marketplace','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.commerce-risk','Commerce Risk & Disputes','Risk signals, disputes, chargebacks, evidence and recovery workflows.','risk','omniqora',true,'automatic','active','built_main','{}'::jsonb),
('omniqora.store-credit','Store Credit & Gift Value','Non-cash store credit, gift value and refund-credit ledger.','commerce','omniqora',true,'automatic','active','built_main',
 '{"notGeneralPurposeStoredValue":true,"cashTopupsDisabledByDefault":true}'::jsonb),
('omniqora.connector-runtime','Connector Runtime','Canonical field mapping, connector runs, delivery attempts, retries and reconciliation evidence.','integrations','omniqora',true,'automatic','active','built_main',
 '{"directFirst":true,"supportsMiddlewareBridge":true}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('omniqora.promotions','omniqora.marketplace',true),
('omniqora.referrals','omniqora.crm',true),
('omniqora.referrals','zoryn.rewards',false),
('omniqora.memberships','omniqora.payments',true),
('omniqora.order-scheduling','omniqora.order-orchestration',true),
('omniqora.substitutions','omniqora.order-orchestration',true),
('omniqora.vendor-capacity','omniqora.marketplace',true),
('omniqora.commerce-risk','omniqora.payments',true),
('omniqora.commerce-risk','omniqora.support',false),
('omniqora.store-credit','omniqora.payments',false),
('omniqora.connector-runtime','omniqora.integration-hub',true),
('omniqora.connector-runtime','omniqora.ops-assurance',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

CREATE TABLE IF NOT EXISTS public.commerce_promotions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  promotion_type text NOT NULL CHECK(promotion_type IN('percent','fixed','free_item','bundle','delivery_discount')),
  value_minor bigint NOT NULL DEFAULT 0 CHECK(value_minor>=0),
  min_spend_minor bigint NOT NULL DEFAULT 0 CHECK(min_spend_minor>=0),
  channels text[] NOT NULL DEFAULT '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer CHECK(max_redemptions IS NULL OR max_redemptions>0),
  per_customer_limit integer CHECK(per_customer_limit IS NULL OR per_customer_limit>0),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','expired','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_promotions_code_uq
  ON public.commerce_promotions(tenant_id,product_key,lower(code))
  WHERE code IS NOT NULL AND status<>'archived';

CREATE TABLE IF NOT EXISTS public.commerce_promotion_redemptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.commerce_promotions(id) ON DELETE CASCADE,
  order_ref text NOT NULL,
  customer_ref text,
  discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(promotion_id,order_ref)
);

CREATE TABLE IF NOT EXISTS public.referral_programmes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','archived')),
  referrer_reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  referee_reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualification_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.referral_programmes(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  referrer_ref text NOT NULL,
  referee_ref text,
  event_type text NOT NULL CHECK(event_type IN('issued','clicked','signed_up','qualified','rewarded','cancelled')),
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_event_source_uq
  ON public.referral_events(tenant_id,programme_id,event_type,source_ref)
  WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_memberships(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  plan_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('trial','active','past_due','paused','cancelled','expired')),
  provider text,
  provider_reference text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  renews_at timestamptz,
  ends_at timestamptz,
  benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,customer_ref,plan_key)
);

CREATE TABLE IF NOT EXISTS public.commerce_order_schedules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  schedule_type text NOT NULL CHECK(schedule_type IN('once','recurring')),
  recurrence_rule text,
  timezone text NOT NULL DEFAULT 'Europe/London',
  next_release_at timestamptz NOT NULL,
  order_template jsonb NOT NULL,
  payment_strategy text NOT NULL DEFAULT 'authorise_at_release'
    CHECK(payment_strategy IN('authorise_at_release','payment_link','provider_mandate')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','completed','cancelled','failed')),
  last_released_at timestamptz,
  last_order_ref text,
  release_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((schedule_type='once' AND recurrence_rule IS NULL) OR schedule_type='recurring')
);
CREATE INDEX IF NOT EXISTS commerce_order_schedules_due_idx
  ON public.commerce_order_schedules(status,next_release_at);

CREATE TABLE IF NOT EXISTS public.commerce_substitution_preferences(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  order_ref text NOT NULL,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  item_ref text,
  preference text NOT NULL CHECK(preference IN('best_match','contact_me','refund_item','no_substitution')),
  max_price_increase_minor bigint CHECK(max_price_increase_minor IS NULL OR max_price_increase_minor>=0),
  notes text,
  resolved_to_listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  resolution_status text NOT NULL DEFAULT 'pending' CHECK(resolution_status IN('pending','substituted','refunded','accepted','declined','not_needed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,order_ref,listing_id,item_ref)
);

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_runtime_controls(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  channel text NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  auto_resume_at timestamptz,
  prep_delay_minutes integer NOT NULL DEFAULT 0 CHECK(prep_delay_minutes BETWEEN 0 AND 240),
  max_open_orders integer CHECK(max_open_orders IS NULL OR max_open_orders>0),
  max_orders_per_15m integer CHECK(max_orders_per_15m IS NULL OR max_orders_per_15m>0),
  sold_out_listing_ids uuid[] NOT NULL DEFAULT '{}',
  status_message text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key,vendor_id,channel)
);

CREATE TABLE IF NOT EXISTS public.commerce_risk_signals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK(subject_type IN('order','payment','customer','vendor','driver','refund')),
  subject_ref text NOT NULL,
  signal_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK(severity IN('low','medium','high','critical')),
  score numeric,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewed','dismissed','confirmed','resolved')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS commerce_risk_signals_open_idx
  ON public.commerce_risk_signals(tenant_id,status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_disputes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  order_ref text,
  payment_ref text,
  customer_ref text,
  dispute_type text NOT NULL CHECK(dispute_type IN('order','payment','refund','chargeback','delivery','quality','other')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','investigating','awaiting_evidence','submitted','won','lost','resolved','closed')),
  amount_minor bigint CHECK(amount_minor IS NULL OR amount_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_reference text,
  due_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_credit_accounts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  credit_type text NOT NULL CHECK(credit_type IN('store_credit','gift_card','refund_credit','promotional_credit')),
  code_hash text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','expired','closed')),
  currency text NOT NULL DEFAULT 'GBP',
  balance_minor bigint NOT NULL DEFAULT 0 CHECK(balance_minor>=0),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_credit_code_uq
  ON public.commerce_credit_accounts(tenant_id,code_hash)
  WHERE code_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_credit_ledger(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.commerce_credit_accounts(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK(entry_type IN('issue','redeem','refund','adjust','expire','reverse')),
  amount_minor bigint NOT NULL,
  balance_after_minor bigint NOT NULL CHECK(balance_after_minor>=0),
  source_ref text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,source_ref)
);

-- Generic connector-runtime records. These complement provider_bindings and are
-- deliberately provider-neutral so direct APIs and Deliverect/Otter/UrbanPiper
-- bridges use the same mapping, retry and reconciliation model.
CREATE TABLE IF NOT EXISTS public.integration_connector_instances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  provider_key text NOT NULL REFERENCES public.integration_provider_catalogue(provider_key) ON DELETE RESTRICT,
  binding_id uuid REFERENCES public.provider_bindings(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  capability text NOT NULL,
  transport text NOT NULL CHECK(transport IN('direct','bridge','source','destination')),
  status text NOT NULL DEFAULT 'configured' CHECK(status IN('configured','testing','certifying','live','degraded','paused','blocked')),
  external_account_ref text,
  external_store_ref text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,provider_key,capability,brand_id,location_id,transport)
);

CREATE TABLE IF NOT EXISTS public.integration_field_mappings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES public.integration_connector_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  internal_ref text NOT NULL,
  external_ref text NOT NULL,
  mapping_kind text NOT NULL DEFAULT 'id' CHECK(mapping_kind IN('id','sku','plu','modifier','category','status','tax','payment','other')),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connector_id,entity_type,internal_ref,mapping_kind),
  UNIQUE(connector_id,entity_type,external_ref,mapping_kind)
);

CREATE TABLE IF NOT EXISTS public.integration_connector_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.integration_connector_instances(id) ON DELETE CASCADE,
  operation text NOT NULL,
  direction text NOT NULL CHECK(direction IN('inbound','outbound','reconcile')),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','succeeded','failed','retrying','dead')),
  attempt_count integer NOT NULL DEFAULT 0,
  request_ref text,
  response_ref text,
  payload_hash text,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connector_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS integration_connector_runs_queue_idx
  ON public.integration_connector_runs(status,available_at,created_at);

CREATE TABLE IF NOT EXISTS public.integration_reconciliation_findings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.integration_connector_instances(id) ON DELETE CASCADE,
  finding_type text NOT NULL,
  internal_ref text,
  external_ref text,
  severity text NOT NULL DEFAULT 'warning' CHECK(severity IN('info','warning','error','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged','resolved','ignored')),
  expected jsonb,
  actual jsonb,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commerce_promotions','commerce_promotion_redemptions','referral_programmes','referral_events',
    'commerce_memberships','commerce_order_schedules','commerce_substitution_preferences',
    'marketplace_vendor_runtime_controls','commerce_risk_signals','commerce_disputes',
    'commerce_credit_accounts','commerce_credit_ledger','integration_connector_instances',
    'integration_field_mappings','integration_connector_runs','integration_reconciliation_findings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
      'shared commerce tenant read',t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))',
      'shared commerce tenant write',t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.commerce_credit_apply(
  _account uuid,_type text,_amount bigint,_source text,_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.commerce_credit_accounts%rowtype;delta bigint;lid uuid;
BEGIN
  SELECT * INTO a FROM public.commerce_credit_accounts WHERE id=_account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account not found'; END IF;
  IF NOT public.can_write(a.tenant_id,auth.uid())
     AND NOT public.is_platform_admin(auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Credit account access denied';
  END IF;
  SELECT id INTO lid FROM public.commerce_credit_ledger WHERE account_id=_account AND source_ref=_source;
  IF lid IS NOT NULL THEN RETURN lid; END IF;
  delta:=CASE WHEN _type IN('issue','refund') THEN abs(_amount)
              WHEN _type IN('redeem','expire') THEN -abs(_amount)
              ELSE _amount END;
  IF a.balance_minor+delta<0 THEN RAISE EXCEPTION 'Insufficient credit balance'; END IF;
  UPDATE public.commerce_credit_accounts
  SET balance_minor=balance_minor+delta,updated_at=now()
  WHERE id=_account
  RETURNING * INTO a;
  INSERT INTO public.commerce_credit_ledger(
    tenant_id,account_id,entry_type,amount_minor,balance_after_minor,source_ref,reason
  ) VALUES(a.tenant_id,a.id,_type,delta,a.balance_minor,_source,_reason)
  RETURNING id INTO lid;
  RETURN lid;
END $$;
REVOKE ALL ON FUNCTION public.commerce_credit_apply(uuid,text,bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_credit_apply(uuid,text,bigint,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketplace_set_vendor_runtime_control(
  _tenant uuid,_product text,_vendor uuid,_channel text,_paused boolean,
  _pause_reason text,_auto_resume_at timestamptz,_prep_delay integer,
  _max_open_orders integer,_max_orders_15m integer,_sold_out uuid[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Vendor control access denied';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.marketplace_vendors
    WHERE id=_vendor AND tenant_id=_tenant AND product_key=_product
  ) THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  INSERT INTO public.marketplace_vendor_runtime_controls(
    tenant_id,product_key,vendor_id,channel,paused,pause_reason,auto_resume_at,
    prep_delay_minutes,max_open_orders,max_orders_per_15m,sold_out_listing_ids,updated_by,updated_at
  ) VALUES(
    _tenant,_product,_vendor,_channel,_paused,NULLIF(trim(_pause_reason),''),_auto_resume_at,
    greatest(coalesce(_prep_delay,0),0),_max_open_orders,_max_orders_15m,coalesce(_sold_out,'{}'),auth.uid(),now()
  )
  ON CONFLICT(tenant_id,product_key,vendor_id,channel) DO UPDATE SET
    paused=EXCLUDED.paused,pause_reason=EXCLUDED.pause_reason,auto_resume_at=EXCLUDED.auto_resume_at,
    prep_delay_minutes=EXCLUDED.prep_delay_minutes,max_open_orders=EXCLUDED.max_open_orders,
    max_orders_per_15m=EXCLUDED.max_orders_per_15m,sold_out_listing_ids=EXCLUDED.sold_out_listing_ids,
    updated_by=EXCLUDED.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.marketplace_set_vendor_runtime_control(uuid,text,uuid,text,boolean,text,timestamptz,integer,integer,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketplace_set_vendor_runtime_control(uuid,text,uuid,text,boolean,text,timestamptz,integer,integer,integer,uuid[]) TO authenticated,service_role;

-- Enable the reusable capabilities for Dishbee+ while keeping expensive/growth
-- functions optional. Buzz packages activate the same shared services under the
-- Dishbee Buzz brand.
INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-plus','omniqora.promotions',true,false),
('dishbee-plus','omniqora.referrals',true,false),
('dishbee-plus','omniqora.memberships',false,false),
('dishbee-plus','omniqora.order-scheduling',true,false),
('dishbee-plus','omniqora.substitutions',true,false),
('dishbee-plus','omniqora.vendor-capacity',true,true),
('dishbee-plus','omniqora.commerce-risk',true,false),
('dishbee-plus','omniqora.store-credit',true,false),
('dishbee-plus','omniqora.connector-runtime',true,true),
('dishbee-one','omniqora.promotions',false,false),
('dishbee-one','omniqora.order-scheduling',false,false),
('dishbee-one','omniqora.commerce-risk',false,false),
('dishbee-one','omniqora.connector-runtime',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('dishbee.buzz.growth','omniqora.promotions',false),
('dishbee.buzz.growth','omniqora.referrals',false),
('dishbee.buzz.pro','omniqora.commerce-risk',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

COMMIT;
