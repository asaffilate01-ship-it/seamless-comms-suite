-- Shared bookings, loyalty, automation and schema-driven forms engines.
BEGIN;

INSERT INTO public.platform_products(product_key,name,kind,industry,status) VALUES
 ('zoryn-rewards','Zoryn Rewards','vertical_landlord','loyalty_rewards','migration_candidate')
ON CONFLICT(product_key) DO UPDATE SET
 name=EXCLUDED.name,kind=EXCLUDED.kind,industry=EXCLUDED.industry,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.platform_modules(module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities) VALUES
 ('bookings.core','Omniqora Bookings & Scheduling','bookings','1.0.0-preview','preview','hybrid',
  ARRAY['crm.core','platform.events','platform.audit'],
  ARRAY['services','resources','availability','holds','appointments','capacity','reminders','waitlist']),
 ('loyalty.core','Omniqora Loyalty & Rewards','loyalty','1.0.0-preview','preview','hybrid',
  ARRAY['crm.core','platform.events','platform.audit'],
  ARRAY['programmes','accounts','ledger','tiers','rewards','vouchers','referrals','personalisation']),
 ('automation.core','Omniqora Automation','automation','1.0.0-preview','preview','hybrid',
  ARRAY['platform.events','platform.audit'],
  ARRAY['builder','event_triggers','conditions','ai_decisions','actions','delays','approvals','schedules','runs']),
 ('forms.core','Omniqora Forms','forms','1.0.0-preview','preview','hybrid',
  ARRAY['platform.tenant','documents.core','platform.audit'],
  ARRAY['builder','versions','conditional','files','signatures','submissions','review','localisation'])
ON CONFLICT(module_key) DO UPDATE SET
 name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
 ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities,updated_at=now();

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default) VALUES
 ('zoryn-rewards','crm.core',true),('zoryn-rewards','loyalty.core',true),('zoryn-rewards','connect.core',true),
 ('zoryn-rewards','marketing.core',true),('zoryn-rewards','journeys.core',true),
 ('zoryn-rewards','analytics.core',true),('zoryn-rewards','intelligence.core',true)
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=EXCLUDED.enabled_by_default;

CREATE TABLE IF NOT EXISTS public.booking_services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 external_ref text,
 name text NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes>0),
 buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_before_minutes>=0),
 buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_after_minutes>=0),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity>0),
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 price_minor bigint CHECK(price_minor IS NULL OR price_minor>=0),
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_services_external_uq
 ON public.booking_services(tenant_id,tenant_product_id,external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_resources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 external_ref text,
 name text NOT NULL,
 resource_kind text NOT NULL CHECK(resource_kind IN ('person','room','table','vehicle','equipment','capacity_pool','virtual')),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity>0),
 skills text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_resources_external_uq
 ON public.booking_resources(tenant_id,tenant_product_id,external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_resource_services(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 resource_id uuid NOT NULL REFERENCES public.booking_resources(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
 PRIMARY KEY(resource_id,service_id)
);

CREATE TABLE IF NOT EXISTS public.booking_availability_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 resource_id uuid NOT NULL REFERENCES public.booking_resources(id) ON DELETE CASCADE,
 weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 start_time time NOT NULL,
 end_time time NOT NULL,
 timezone text NOT NULL,
 valid_from date,
 valid_until date,
 capacity integer CHECK(capacity IS NULL OR capacity>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_time>start_time)
);
CREATE INDEX IF NOT EXISTS booking_availability_resource_idx ON public.booking_availability_rules(resource_id,weekday);

CREATE TABLE IF NOT EXISTS public.bookings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE RESTRICT,
 resource_id uuid REFERENCES public.booking_resources(id) ON DELETE SET NULL,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 customer_ref text,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 timezone text NOT NULL,
 party_size integer NOT NULL DEFAULT 1 CHECK(party_size>0),
 status text NOT NULL DEFAULT 'hold' CHECK(status IN ('hold','confirmed','checked_in','completed','cancelled','no_show','expired')),
 channel text NOT NULL CHECK(channel IN ('web','app','whatsapp','phone','staff','marketplace','api')),
 source_ref text,
 idempotency_key text NOT NULL,
 hold_expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS bookings_resource_time_idx ON public.bookings(tenant_id,resource_id,starts_at,ends_at,status);
CREATE INDEX IF NOT EXISTS bookings_service_time_idx ON public.bookings(tenant_id,service_id,starts_at,ends_at,status);

CREATE TABLE IF NOT EXISTS public.loyalty_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 name text NOT NULL,
 loyalty_currency text NOT NULL CHECK(loyalty_currency IN ('points','stamps','credit')),
 earn_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
 expiry_days integer CHECK(expiry_days IS NULL OR expiry_days>0),
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.loyalty_programmes(id) ON DELETE CASCADE,
 customer_ref text NOT NULL,
 tier_key text,
 balance numeric NOT NULL DEFAULT 0,
 lifetime_earned numeric NOT NULL DEFAULT 0 CHECK(lifetime_earned>=0),
 lifetime_redeemed numeric NOT NULL DEFAULT 0 CHECK(lifetime_redeemed>=0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(programme_id,customer_ref)
);
CREATE INDEX IF NOT EXISTS loyalty_accounts_customer_idx ON public.loyalty_accounts(tenant_id,customer_ref);

CREATE TABLE IF NOT EXISTS public.loyalty_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.loyalty_programmes(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
 entry_type text NOT NULL CHECK(entry_type IN ('earn','redeem','adjust','expire','reverse')),
 quantity numeric NOT NULL,
 balance_after numeric NOT NULL,
 source_ref text NOT NULL,
 reason text,
 occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_ref)
);
CREATE INDEX IF NOT EXISTS loyalty_ledger_account_idx ON public.loyalty_ledger(account_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.loyalty_rewards(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.loyalty_programmes(id) ON DELETE CASCADE,
 name text NOT NULL,
 reward_type text NOT NULL CHECK(reward_type IN ('discount','credit','free_item','voucher','perk')),
 cost numeric NOT NULL CHECK(cost>=0),
 value jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_workflows(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 name text NOT NULL,
 description text,
 trigger_event text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','archived')),
 active_version integer,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_workflows_trigger_idx ON public.automation_workflows(tenant_id,status,trigger_event);

CREATE TABLE IF NOT EXISTS public.automation_workflow_versions(
 workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
 edges jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workflow_id,version)
);

CREATE TABLE IF NOT EXISTS public.automation_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
 workflow_version integer NOT NULL,
 event_id text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting','approval','completed','failed','cancelled')),
 current_node_id text,
 context jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_queue_idx ON public.automation_runs(status,created_at);

CREATE TABLE IF NOT EXISTS public.form_definitions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
 form_key text NOT NULL,
 name text NOT NULL,
 active_version integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS form_definitions_scope_uq
 ON public.form_definitions(COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(product_key,''),form_key);

CREATE TABLE IF NOT EXISTS public.form_versions(
 definition_id uuid NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
 tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
 locale_keys text[] NOT NULL DEFAULT '{}',
 fields jsonb NOT NULL DEFAULT '[]'::jsonb,
 sections jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(definition_id,version)
);

CREATE TABLE IF NOT EXISTS public.form_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 definition_id uuid NOT NULL REFERENCES public.form_definitions(id) ON DELETE RESTRICT,
 form_version integer NOT NULL,
 subject_type text,
 subject_id text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','review','accepted','rejected')),
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 submitted_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_submissions_subject_idx ON public.form_submissions(tenant_id,subject_type,subject_id,created_at DESC);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'booking_services','booking_resources','booking_resource_services','booking_availability_rules','bookings',
  'loyalty_programmes','loyalty_accounts','loyalty_ledger','loyalty_rewards',
  'automation_workflows','automation_workflow_versions','automation_runs','form_submissions'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','shared module read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','shared module read',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','shared module write',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))','shared module write',t);
 END LOOP;
END $$;

ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.form_definitions,public.form_versions TO authenticated;
GRANT ALL ON public.form_definitions,public.form_versions TO service_role;
DROP POLICY IF EXISTS "form definitions read" ON public.form_definitions;
CREATE POLICY "form definitions read" ON public.form_definitions FOR SELECT TO authenticated
 USING(tenant_id IS NULL OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "form definitions tenant write" ON public.form_definitions;
CREATE POLICY "form definitions tenant write" ON public.form_definitions FOR ALL TO authenticated
 USING(tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "form versions read" ON public.form_versions;
CREATE POLICY "form versions read" ON public.form_versions FOR SELECT TO authenticated
 USING(tenant_id IS NULL OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "form versions tenant write" ON public.form_versions;
CREATE POLICY "form versions tenant write" ON public.form_versions FOR ALL TO authenticated
 USING(tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'booking_services','booking_resources','booking_availability_rules','bookings',
  'loyalty_programmes','loyalty_accounts','loyalty_rewards',
  'automation_workflows','automation_runs','form_definitions','form_submissions'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_booking_slot(
 _tenant uuid,_tenant_product uuid,_service uuid,_resource uuid,_location uuid,_customer_ref text,
 _starts_at timestamptz,_ends_at timestamptz,_timezone text,_party_size integer,_channel text,
 _idempotency_key text,_status text DEFAULT 'hold',_hold_expires_at timestamptz DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE booking_id uuid; svc public.booking_services; res public.booking_resources; max_capacity integer; used_capacity integer;
BEGIN
 SELECT id INTO booking_id FROM public.bookings WHERE tenant_id=_tenant AND idempotency_key=_idempotency_key;
 IF booking_id IS NOT NULL THEN RETURN booking_id; END IF;
 IF _ends_at<=_starts_at OR _party_size<=0 OR _status NOT IN ('hold','confirmed') THEN RAISE EXCEPTION 'invalid_booking_request'; END IF;
 SELECT * INTO svc FROM public.booking_services WHERE id=_service AND tenant_id=_tenant AND tenant_product_id=_tenant_product AND active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'booking_service_not_found'; END IF;
 IF _resource IS NOT NULL THEN
  SELECT * INTO res FROM public.booking_resources WHERE id=_resource AND tenant_id=_tenant AND tenant_product_id=_tenant_product AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_resource_not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_resource::text,0));
  max_capacity:=res.capacity;
  SELECT COALESCE(sum(party_size),0)::integer INTO used_capacity FROM public.bookings
   WHERE tenant_id=_tenant AND resource_id=_resource
    AND status IN ('hold','confirmed','checked_in')
    AND (status<>'hold' OR hold_expires_at IS NULL OR hold_expires_at>now())
    AND starts_at<_ends_at AND ends_at>_starts_at;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended(_service::text,0));
  max_capacity:=svc.capacity;
  SELECT COALESCE(sum(party_size),0)::integer INTO used_capacity FROM public.bookings
   WHERE tenant_id=_tenant AND service_id=_service AND resource_id IS NULL
    AND status IN ('hold','confirmed','checked_in')
    AND (status<>'hold' OR hold_expires_at IS NULL OR hold_expires_at>now())
    AND starts_at<_ends_at AND ends_at>_starts_at;
 END IF;
 IF used_capacity+_party_size>max_capacity THEN RAISE EXCEPTION 'booking_capacity_unavailable'; END IF;
 INSERT INTO public.bookings(
  tenant_id,tenant_product_id,service_id,resource_id,location_id,customer_ref,starts_at,ends_at,timezone,
  party_size,status,channel,idempotency_key,hold_expires_at,metadata
 ) VALUES(
  _tenant,_tenant_product,_service,_resource,_location,_customer_ref,_starts_at,_ends_at,_timezone,
  _party_size,_status,_channel,_idempotency_key,_hold_expires_at,COALESCE(_metadata,'{}'::jsonb)
 ) RETURNING id INTO booking_id;
 RETURN booking_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_booking_slot(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,integer,text,text,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_slot(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,integer,text,text,text,timestamptz,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_loyalty_entry(
 _tenant uuid,_programme uuid,_customer_ref text,_entry_type text,_quantity numeric,_source_ref text,
 _reason text DEFAULT NULL,_occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE acc public.loyalty_accounts; ledger_id uuid; delta numeric;
BEGIN
 IF _quantity<=0 AND _entry_type<>'adjust' THEN RAISE EXCEPTION 'invalid_loyalty_quantity'; END IF;
 SELECT id INTO ledger_id FROM public.loyalty_ledger WHERE tenant_id=_tenant AND source_ref=_source_ref;
 IF ledger_id IS NOT NULL THEN RETURN ledger_id; END IF;
 SELECT * INTO acc FROM public.loyalty_accounts WHERE tenant_id=_tenant AND programme_id=_programme AND customer_ref=_customer_ref FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.loyalty_accounts(tenant_id,programme_id,customer_ref) VALUES(_tenant,_programme,_customer_ref)
  RETURNING * INTO acc;
  PERFORM pg_advisory_xact_lock(hashtextextended(acc.id::text,0));
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended(acc.id::text,0));
  SELECT * INTO acc FROM public.loyalty_accounts WHERE id=acc.id FOR UPDATE;
 END IF;
 delta:=CASE
  WHEN _entry_type='earn' THEN abs(_quantity)
  WHEN _entry_type IN ('redeem','expire') THEN -abs(_quantity)
  WHEN _entry_type='adjust' THEN _quantity
  WHEN _entry_type='reverse' THEN _quantity
  ELSE 0
 END;
 IF acc.balance+delta<0 THEN RAISE EXCEPTION 'insufficient_loyalty_balance'; END IF;
 UPDATE public.loyalty_accounts SET
  balance=balance+delta,
  lifetime_earned=lifetime_earned+CASE WHEN delta>0 AND _entry_type='earn' THEN delta ELSE 0 END,
  lifetime_redeemed=lifetime_redeemed+CASE WHEN delta<0 AND _entry_type='redeem' THEN abs(delta) ELSE 0 END,
  updated_at=now()
 WHERE id=acc.id RETURNING * INTO acc;
 INSERT INTO public.loyalty_ledger(tenant_id,programme_id,account_id,entry_type,quantity,balance_after,source_ref,reason,occurred_at)
 VALUES(_tenant,_programme,acc.id,_entry_type,delta,acc.balance,_source_ref,_reason,_occurred_at)
 RETURNING id INTO ledger_id;
 RETURN ledger_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_loyalty_entry(uuid,uuid,text,text,numeric,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loyalty_entry(uuid,uuid,text,text,numeric,text,text,timestamptz) TO service_role;

COMMIT;
