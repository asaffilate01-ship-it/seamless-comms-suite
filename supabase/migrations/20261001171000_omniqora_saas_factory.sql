-- Omniqora shared SaaS factory / control plane. This migration intentionally
-- follows the portfolio control-plane migration with a unique Supabase version.
-- Promotes tenant/product/add-on concepts into reusable platform infrastructure without
-- moving vertical product data into the Omniqora database.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,100}$'),
  country_code text NOT NULL DEFAULT 'GB' CHECK (country_code ~ '^[A-Z]{2}$'),
  billing_currency text NOT NULL DEFAULT 'GBP' CHECK (billing_currency ~ '^[A-Z]{3}$'),
  billing_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organisation_members (
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','billing','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.organisations (id, name, slug, country_code, billing_currency)
SELECT t.id, t.name, t.slug, t.country_code, t.currency
FROM public.tenants t
WHERE t.organisation_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.tenants SET organisation_id=id WHERE organisation_id IS NULL;
ALTER TABLE public.tenants ALTER COLUMN organisation_id SET NOT NULL;

INSERT INTO public.organisation_members (organisation_id,user_id,role)
SELECT DISTINCT t.organisation_id,m.user_id,
  CASE WHEN m.role IN ('owner','admin') THEN m.role::text ELSE 'member' END
FROM public.tenants t JOIN public.tenant_members m ON m.tenant_id=t.id
ON CONFLICT (organisation_id,user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_catalogue (
  product_key text PRIMARY KEY CHECK (product_key ~ '^[a-z0-9][a-z0-9.-]{1,80}$'),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'saas',
  deployment_mode text NOT NULL DEFAULT 'external' CHECK (deployment_mode IN ('hosted','external','hybrid')),
  default_base_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','beta','internal','retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_catalogue (
  service_key text PRIMARY KEY CHECK (service_key ~ '^[a-z0-9][a-z0-9.-]{1,100}$'),
  name text NOT NULL,
  description text,
  family text NOT NULL,
  owner_product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,
  billable boolean NOT NULL DEFAULT true,
  provisioning_mode text NOT NULL DEFAULT 'automatic' CHECK (provisioning_mode IN ('automatic','manual','external')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','beta','internal','retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_dependencies (
  service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
  depends_on_service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE RESTRICT,
  required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (service_key, depends_on_service_key),
  CHECK (service_key <> depends_on_service_key)
);

CREATE TABLE IF NOT EXISTS public.product_services (
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
  default_enabled boolean NOT NULL DEFAULT false,
  required boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (product_key, service_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_products (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','provisioning','active','suspended','failed','cancelled')),
  external_tenant_id text,
  base_url text,
  plan_key text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_services (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','provisioning','trial','active','suspended','failed','cancelled')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','blueprint','product-default','billing','migration','api')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  billing_reference text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, service_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_branding (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_name text,
  logo_url text,
  dark_logo_url text,
  favicon_url text,
  primary_colour text,
  secondary_colour text,
  font_family text,
  support_email text,
  support_phone text,
  terms_url text,
  privacy_url text,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_from_name text,
  email_from_address text,
  sms_sender text,
  whatsapp_sender text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  domain text NOT NULL,
  domain_type text NOT NULL DEFAULT 'custom' CHECK (domain_type IN ('platform','custom','subdomain')),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','failed')),
  ssl_status text NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending','active','failed')),
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain),
  UNIQUE (tenant_id, product_key, domain)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_primary_domain_per_product
  ON public.tenant_domains (tenant_id, COALESCE(product_key,'__all__'))
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS public.product_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  external_tenant_id text NOT NULL,
  base_url text,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','provisioning','connected','degraded','disabled','failed')),
  capabilities text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_key, external_tenant_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_blueprints (
  blueprint_key text PRIMARY KEY CHECK (blueprint_key ~ '^[a-z0-9][a-z0-9.-]{1,100}$'),
  name text NOT NULL,
  description text,
  country_code text,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blueprint_products (
  blueprint_key text NOT NULL REFERENCES public.tenant_blueprints(blueprint_key) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (blueprint_key, product_key)
);

CREATE TABLE IF NOT EXISTS public.blueprint_services (
  blueprint_key text NOT NULL REFERENCES public.tenant_blueprints(blueprint_key) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (blueprint_key, service_key)
);

CREATE TABLE IF NOT EXISTS public.provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('product','service','domain','branding','integration')),
  target_key text NOT NULL,
  action text NOT NULL DEFAULT 'provision' CHECK (action IN ('provision','update','suspend','resume','deprovision','verify')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','succeeded','failed','cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  requested_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS provisioning_jobs_queue_idx ON public.provisioning_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS tenant_services_status_idx ON public.tenant_services(tenant_id,status);
CREATE INDEX IF NOT EXISTS tenant_products_status_idx ON public.tenant_products(tenant_id,status);

CREATE TABLE IF NOT EXISTS public.provisioning_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.provisioning_jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shared catalogue.
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status) VALUES
('omniqora','Omniqora','Shared control plane, CRM, communications, AI and platform services.','platform','hosted','active'),
('dishbee','Dishbee','Food, ordering, EPOS, KDS and hospitality operations.','hospitality','external','active'),
('mealdeck','MealDeck','Multi-brand ordering and cloud-kitchen marketplace.','hospitality','external','active'),
('kindelo','Kindelo','Childminder agency and childcare operations.','childcare','external','active'),
('formationgenie','FormationGenie','Company formation and company-secretarial workflows.','business-services','external','active'),
('omniqora-accounts','Omniqora Accounts','Accountancy practice and bookkeeping platform.','accounting','external','active'),
('taxcenda','TaxCenda','Tax workflow and tax intelligence platform.','tax','external','active'),
('taxnuvia','TaxNuvia','Accountant marketplace and matching.','marketplace','external','active'),
('lawquo','Lawquo','Legal triage and legal-services marketplace.','marketplace','external','active'),
('sparesgrid','SparesGrid','Vehicle-parts marketplace and fulfilment.','automotive','external','active'),
('haccora','Haccora','Food safety and compliance operations.','compliance','external','active'),
('courier-connect','Courier Connect','Courier aggregation and delivery operations.','logistics','external','active'),
('all-road-aid','All-Road-Aid','Roadside recovery marketplace and dispatch.','automotive','external','active'),
('zivvo','Zivvo','UK vehicle marketplace.','automotive','external','active'),
('autohashi','Autohashi','JDM auction and vehicle import platform.','automotive','external','active'),
('fastremit','FastRemit','Remittance and cross-border payments platform.','fintech','external','active')
ON CONFLICT (product_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,deployment_mode=EXCLUDED.deployment_mode,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.identity','Identity & SSO','Shared identity, memberships, MFA/OTP/passkeys and SSO.','identity','omniqora',true,'automatic','active'),
('omniqora.crm','CRM & Customer 360','Shared contacts, organisations, activity and customer 360.','growth','omniqora',true,'automatic','active'),
('omniqora.ai','Omniqora AI','Tenant-aware AI capabilities and governed assistants.','ai','omniqora',true,'automatic','active'),
('omniqora.connect','Omniqora Connect','WhatsApp, SMS, email and communication orchestration.','communications','omniqora',true,'automatic','active'),
('omniqora.voice','Voice & AI Receptionist','Voice channels, call routing and AI receptionist.','communications','omniqora',true,'external','active'),
('omniqora.geo','Geo & Maps','Geocoding, zones, routing and map services.','operations','omniqora',true,'automatic','active'),
('omniqora.dispatch','Dispatch','Jobs, assignment, ETA and dispatch orchestration.','operations','omniqora',true,'automatic','active'),
('omniqora.fleet','Fleet','Drivers, vehicles, shifts, maintenance and utilisation.','operations','omniqora',true,'automatic','active'),
('omniqora.tracking','Customer Tracking','Signed live customer tracking pages and status updates.','operations','omniqora',true,'automatic','active'),
('omniqora.journeys','Customer Journeys','Visual trigger, condition, delay, branch and action automation.','growth','omniqora',true,'automatic','active'),
('omniqora.rfm','RFM & Segmentation','RFM, LTV, churn and behavioural segmentation.','growth','omniqora',true,'automatic','active'),
('omniqora.sales','Sales Engagement','Sequences, calls, tasks, lead scoring and pipeline movement.','growth','omniqora',true,'automatic','active'),
('omniqora.feedback','Feedback & NPS','NPS, CSAT, CES, review routing and recovery.','growth','omniqora',true,'automatic','active'),
('omniqora.analytics','Analytics','Cross-product reporting and central event analytics.','analytics','omniqora',true,'automatic','active'),
('omniqora.payments','Payments','Payment links, billing, settlements and payment-provider abstraction.','commerce','omniqora',true,'external','active'),
('omniqora.marketplace','Marketplace Core','Listings, providers, matching, enquiries and marketplace primitives.','marketplace','omniqora',true,'automatic','active'),
('omniqora.agent','Universal Agent App','Entitlement-driven field, driver and agent application.','operations','omniqora',true,'external','active'),
('omniqora.rrci','Risk & Compliance Intelligence','Regulatory, risk and compliance intelligence workspace.','compliance','omniqora',true,'automatic','active'),
('zoryn.rewards','Zoryn Rewards','Shared loyalty, rewards and customer incentives.','growth',NULL,true,'external','active'),
('dishbee.epos','Dishbee EPOS','Till and in-person order management.','hospitality','dishbee',true,'external','active'),
('dishbee.kds','Dishbee KDS','Kitchen display and production tickets.','hospitality','dishbee',true,'external','active'),
('dishbee.hive','Dishbee Hive','Multi-kitchen coordination and split operational routing.','hospitality','dishbee',true,'external','active'),
('dishbee.groups','Group Ordering','Private group rooms, split pay and host controls.','hospitality','dishbee',true,'external','active'),
('dishbee.assisted-ordering','Assisted Ordering','Phone/WhatsApp assisted order entry with payment links.','hospitality','dishbee',true,'external','active'),
('dishbee.delivery','Delivery Orchestration','Own-fleet and third-party delivery orchestration.','hospitality','dishbee',true,'external','active'),
('kindelo.agency','Kindelo Agency Core','Parent, childminder, booking and agency workflows.','childcare','kindelo',true,'external','active'),
('kindelo.compliance','Kindelo Compliance','Childminder compliance, evidence and regulatory workflows.','childcare','kindelo',true,'external','active'),
('formationgenie.secretarial','Company Secretarial','Companies House records, filings, deadlines and corporate changes.','business-services','formationgenie',true,'external','active'),
('accounts.bookkeeping-ai','Bookkeeping AI','Document ingestion, extraction, coding, exceptions and draft ledgers.','accounting','omniqora-accounts',true,'external','active')
ON CONFLICT (service_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.voice','omniqora.connect'),
('omniqora.dispatch','omniqora.geo'),
('omniqora.fleet','omniqora.dispatch'),
('omniqora.tracking','omniqora.geo'),
('omniqora.journeys','omniqora.connect'),
('omniqora.rfm','omniqora.crm'),
('omniqora.sales','omniqora.crm'),
('omniqora.feedback','omniqora.crm'),
('dishbee.assisted-ordering','omniqora.payments'),
('dishbee.assisted-ordering','omniqora.connect'),
('dishbee.delivery','omniqora.geo'),
('dishbee.delivery','omniqora.dispatch'),
('dishbee.groups','omniqora.payments')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('omniqora','omniqora.identity',true,true),
('omniqora','omniqora.crm',true,false),
('omniqora','omniqora.connect',true,false),
('dishbee','dishbee.kds',true,true),
('dishbee','dishbee.epos',true,false),
('dishbee','omniqora.payments',true,true),
('mealdeck','dishbee.kds',true,true),
('mealdeck','dishbee.hive',true,true),
('mealdeck','dishbee.groups',true,false),
('mealdeck','dishbee.assisted-ordering',true,false),
('mealdeck','dishbee.delivery',true,true),
('mealdeck','omniqora.crm',true,false),
('mealdeck','omniqora.connect',true,false),
('mealdeck','zoryn.rewards',true,false),
('kindelo','kindelo.agency',true,true),
('kindelo','kindelo.compliance',true,true),
('kindelo','omniqora.crm',true,false),
('kindelo','omniqora.connect',true,false),
('formationgenie','formationgenie.secretarial',true,true),
('formationgenie','omniqora.crm',true,false),
('omniqora-accounts','accounts.bookkeeping-ai',true,false),
('omniqora-accounts','omniqora.crm',true,false)
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category) VALUES
('restaurant-uk','Restaurant · UK','Dishbee restaurant with KDS, payments and optional EPOS/delivery.','GB','hospitality'),
('mealdeck-uk','MealDeck · UK','Multi-brand MealDeck venue with Hive, KDS, ordering, CRM, communications, payments and delivery.','GB','hospitality'),
('kindelo-uk','Kindelo Agency · UK','UK childminder agency workspace with CRM, communications and compliance.','GB','childcare'),
('kindelo-de','Kindelo Agency · Germany','German Kindelo agency workspace with CRM, communications and compliance.','DE','childcare'),
('accountancy-uk','Accountancy Practice · UK','Accountancy practice with CRM, communications and bookkeeping AI.','GB','accounting'),
('company-formation-uk','Company Formation · UK','FormationGenie with company secretarial, CRM and communications.','GB','business-services'),
('marketplace','Marketplace','Generic marketplace foundation with CRM, marketplace core, communications and analytics.',NULL,'marketplace'),
('courier-uk','Courier Operator · UK','Dispatch, fleet, tracking, communications and analytics.','GB','logistics'),
('roadside-uk','Roadside Recovery · UK','Marketplace, dispatch, fleet, tracking and communications.','GB','automotive')
ON CONFLICT (blueprint_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,category=EXCLUDED.category,status='active';

INSERT INTO public.blueprint_products(blueprint_key,product_key,required) VALUES
('restaurant-uk','dishbee',true),
('mealdeck-uk','dishbee',true),('mealdeck-uk','mealdeck',true),
('kindelo-uk','kindelo',true),('kindelo-de','kindelo',true),
('accountancy-uk','omniqora-accounts',true),
('company-formation-uk','formationgenie',true),
('marketplace','omniqora',true),
('courier-uk','courier-connect',true),
('roadside-uk','all-road-aid',true)
ON CONFLICT DO NOTHING;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required) VALUES
('restaurant-uk','dishbee.kds',true),('restaurant-uk','omniqora.payments',true),('restaurant-uk','dishbee.epos',false),('restaurant-uk','dishbee.delivery',false),
('mealdeck-uk','dishbee.kds',true),('mealdeck-uk','dishbee.hive',true),('mealdeck-uk','dishbee.groups',false),('mealdeck-uk','dishbee.assisted-ordering',false),('mealdeck-uk','dishbee.delivery',true),('mealdeck-uk','omniqora.crm',false),('mealdeck-uk','omniqora.connect',false),('mealdeck-uk','omniqora.analytics',false),('mealdeck-uk','zoryn.rewards',false),('mealdeck-uk','omniqora.payments',true),
('kindelo-uk','kindelo.agency',true),('kindelo-uk','kindelo.compliance',true),('kindelo-uk','omniqora.crm',false),('kindelo-uk','omniqora.connect',false),('kindelo-uk','omniqora.analytics',false),
('kindelo-de','kindelo.agency',true),('kindelo-de','kindelo.compliance',true),('kindelo-de','omniqora.crm',false),('kindelo-de','omniqora.connect',false),('kindelo-de','omniqora.analytics',false),
('accountancy-uk','accounts.bookkeeping-ai',false),('accountancy-uk','omniqora.crm',false),('accountancy-uk','omniqora.connect',false),('accountancy-uk','omniqora.analytics',false),
('company-formation-uk','formationgenie.secretarial',true),('company-formation-uk','omniqora.crm',false),('company-formation-uk','omniqora.connect',false),
('marketplace','omniqora.marketplace',true),('marketplace','omniqora.crm',false),('marketplace','omniqora.connect',false),('marketplace','omniqora.analytics',false),
('courier-uk','omniqora.geo',true),('courier-uk','omniqora.dispatch',true),('courier-uk','omniqora.fleet',false),('courier-uk','omniqora.tracking',false),('courier-uk','omniqora.connect',false),('courier-uk','omniqora.analytics',false),
('roadside-uk','omniqora.marketplace',true),('roadside-uk','omniqora.geo',true),('roadside-uk','omniqora.dispatch',true),('roadside-uk','omniqora.fleet',false),('roadside-uk','omniqora.tracking',true),('roadside-uk','omniqora.connect',false)
ON CONFLICT DO NOTHING;

-- Keep the previous RRCI entitlement usable while the generic catalogue becomes canonical.
INSERT INTO public.tenant_services(tenant_id,service_key,status,source,valid_until,billing_reference)
SELECT tenant_id,'omniqora.rrci',
  CASE status WHEN 'active' THEN 'active' WHEN 'trial' THEN 'trial' WHEN 'suspended' THEN 'suspended' ELSE 'cancelled' END,
  'migration',valid_until,billing_reference
FROM public.addon_entitlements
ON CONFLICT (tenant_id,service_key) DO UPDATE SET status=EXCLUDED.status,valid_until=EXCLUDED.valid_until,billing_reference=EXCLUDED.billing_reference,updated_at=now();

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_user);
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.has_tenant_entitlement(_tenant uuid,_service text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.tenant_services s
    WHERE s.tenant_id=_tenant AND s.service_key=_service
      AND s.status IN ('active','trial')
      AND (s.valid_until IS NULL OR s.valid_until>now())
  );
$$;
REVOKE ALL ON FUNCTION public.has_tenant_entitlement(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_entitlement(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.queue_provisioning(_tenant uuid,_kind text,_key text,_action text,_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; idem text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Provisioning access denied';
  END IF;
  idem := _tenant::text||':'||_kind||':'||_key||':'||_action||':'||floor(extract(epoch from now())/10)::text;
  INSERT INTO public.provisioning_jobs(tenant_id,target_kind,target_key,action,idempotency_key,payload,requested_by)
  VALUES(_tenant,_kind,_key,_action,idem,COALESCE(_payload,'{}'::jsonb),auth.uid())
  ON CONFLICT (idempotency_key) DO UPDATE SET payload=EXCLUDED.payload
  RETURNING id INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.queue_provisioning(uuid,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_provisioning(uuid,text,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.apply_service_with_dependencies(_tenant uuid,_service text,_source text DEFAULT 'manual')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dep record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.service_catalogue WHERE service_key=_service AND status IN ('active','beta','internal')) THEN
    RAISE EXCEPTION 'Unknown service';
  END IF;
  FOR dep IN SELECT depends_on_service_key FROM public.service_dependencies WHERE service_key=_service AND required LOOP
    INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
    VALUES(_tenant,dep.depends_on_service_key,'requested',_source)
    ON CONFLICT (tenant_id,service_key) DO UPDATE SET status=CASE WHEN public.tenant_services.status IN ('active','trial') THEN public.tenant_services.status ELSE 'requested' END,updated_at=now();
  END LOOP;
  INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
  VALUES(_tenant,_service,'requested',_source)
  ON CONFLICT (tenant_id,service_key) DO UPDATE SET status=CASE WHEN public.tenant_services.status IN ('active','trial') THEN public.tenant_services.status ELSE 'requested' END,source=EXCLUDED.source,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.apply_service_with_dependencies(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_service_with_dependencies(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_create_tenant(
  _organisation_id uuid,
  _organisation_name text,
  _tenant_name text,
  _slug text,
  _country_code text DEFAULT 'GB',
  _currency text DEFAULT 'GBP',
  _timezone text DEFAULT 'Europe/London',
  _blueprint_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; tenant_id uuid; p record; s record;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _tenant_name IS NULL OR length(_tenant_name) NOT BETWEEN 1 AND 160 OR _slug !~ '^[a-z0-9-]{1,100}$' THEN
    RAISE EXCEPTION 'Invalid tenant details';
  END IF;
  IF _organisation_id IS NULL THEN
    INSERT INTO public.organisations(name,slug,country_code,billing_currency)
    VALUES(COALESCE(NULLIF(_organisation_name,''),_tenant_name),_slug,_country_code,_currency)
    RETURNING id INTO org_id;
  ELSE
    SELECT id INTO org_id FROM public.organisations WHERE id=_organisation_id;
    IF org_id IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  END IF;

  INSERT INTO public.tenants(name,slug,organisation_id,country_code,currency,timezone,status)
  VALUES(_tenant_name,_slug,org_id,_country_code,_currency,_timezone,'active')
  RETURNING id INTO tenant_id;
  INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES(tenant_id,auth.uid(),'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.organisation_members(organisation_id,user_id,role) VALUES(org_id,auth.uid(),'owner') ON CONFLICT DO NOTHING;

  IF _blueprint_key IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.tenant_blueprints WHERE blueprint_key=_blueprint_key AND status='active') THEN RAISE EXCEPTION 'Blueprint not found'; END IF;
    FOR p IN SELECT product_key,config FROM public.blueprint_products WHERE blueprint_key=_blueprint_key LOOP
      INSERT INTO public.tenant_products(tenant_id,product_key,status,config)
      VALUES(tenant_id,p.product_key,'requested',p.config) ON CONFLICT DO NOTHING;
      PERFORM public.queue_provisioning(tenant_id,'product',p.product_key,'provision',p.config);
    END LOOP;
    FOR s IN SELECT service_key,config FROM public.blueprint_services WHERE blueprint_key=_blueprint_key LOOP
      PERFORM public.apply_service_with_dependencies(tenant_id,s.service_key,'blueprint');
    END LOOP;
    FOR s IN SELECT service_key,config FROM public.blueprint_services WHERE blueprint_key=_blueprint_key LOOP
      PERFORM public.queue_provisioning(tenant_id,'service',s.service_key,'provision',s.config);
    END LOOP;
  END IF;
  RETURN tenant_id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_create_tenant(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(uuid,text,text,text,text,text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_product(_tenant uuid,_product text,_enabled boolean,_config jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _enabled THEN
    INSERT INTO public.tenant_products(tenant_id,product_key,status,config)
    VALUES(_tenant,_product,'requested',COALESCE(_config,'{}'::jsonb))
    ON CONFLICT (tenant_id,product_key) DO UPDATE SET status='requested',config=EXCLUDED.config,updated_at=now();
    PERFORM public.queue_provisioning(_tenant,'product',_product,'provision',_config);
    INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
    SELECT _tenant,ps.service_key,'requested','product-default'
    FROM public.product_services ps WHERE ps.product_key=_product AND (ps.default_enabled OR ps.required)
    ON CONFLICT (tenant_id,service_key) DO NOTHING;
  ELSE
    UPDATE public.tenant_products SET status='cancelled',updated_at=now() WHERE tenant_id=_tenant AND product_key=_product;
    PERFORM public.queue_provisioning(_tenant,'product',_product,'deprovision','{}'::jsonb);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_tenant_product(uuid,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_product(uuid,text,boolean,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_service(_tenant uuid,_service text,_enabled boolean,_config jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dep record;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _enabled THEN
    PERFORM public.apply_service_with_dependencies(_tenant,_service,'manual');
    UPDATE public.tenant_services SET config=COALESCE(_config,'{}'::jsonb),updated_at=now() WHERE tenant_id=_tenant AND service_key=_service;
    PERFORM public.queue_provisioning(_tenant,'service',_service,'provision',_config);
    FOR dep IN SELECT depends_on_service_key FROM public.service_dependencies WHERE service_key=_service AND required LOOP
      PERFORM public.queue_provisioning(_tenant,'service',dep.depends_on_service_key,'provision','{}'::jsonb);
    END LOOP;
  ELSE
    IF EXISTS(
      SELECT 1 FROM public.service_dependencies d
      JOIN public.tenant_services s ON s.tenant_id=_tenant AND s.service_key=d.service_key AND s.status IN ('requested','provisioning','trial','active')
      WHERE d.depends_on_service_key=_service AND d.required
    ) THEN RAISE EXCEPTION 'Service is required by another enabled service'; END IF;
    UPDATE public.tenant_services SET status='cancelled',updated_at=now() WHERE tenant_id=_tenant AND service_key=_service;
    PERFORM public.queue_provisioning(_tenant,'service',_service,'deprovision','{}'::jsonb);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_tenant_service(uuid,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_service(uuid,text,boolean,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_set_branding(_tenant uuid,_branding jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Branding access denied';
  END IF;
  INSERT INTO public.tenant_branding(tenant_id,brand_name,logo_url,dark_logo_url,favicon_url,primary_colour,secondary_colour,font_family,support_email,support_phone,terms_url,privacy_url,socials,email_from_name,email_from_address,sms_sender,whatsapp_sender,metadata)
  VALUES(_tenant,_branding->>'brandName',_branding->>'logoUrl',_branding->>'darkLogoUrl',_branding->>'faviconUrl',_branding->>'primaryColour',_branding->>'secondaryColour',_branding->>'fontFamily',_branding->>'supportEmail',_branding->>'supportPhone',_branding->>'termsUrl',_branding->>'privacyUrl',COALESCE(_branding->'socials','{}'::jsonb),_branding->>'emailFromName',_branding->>'emailFromAddress',_branding->>'smsSender',_branding->>'whatsappSender',COALESCE(_branding->'metadata','{}'::jsonb))
  ON CONFLICT (tenant_id) DO UPDATE SET brand_name=EXCLUDED.brand_name,logo_url=EXCLUDED.logo_url,dark_logo_url=EXCLUDED.dark_logo_url,favicon_url=EXCLUDED.favicon_url,primary_colour=EXCLUDED.primary_colour,secondary_colour=EXCLUDED.secondary_colour,font_family=EXCLUDED.font_family,support_email=EXCLUDED.support_email,support_phone=EXCLUDED.support_phone,terms_url=EXCLUDED.terms_url,privacy_url=EXCLUDED.privacy_url,socials=EXCLUDED.socials,email_from_name=EXCLUDED.email_from_name,email_from_address=EXCLUDED.email_from_address,sms_sender=EXCLUDED.sms_sender,whatsapp_sender=EXCLUDED.whatsapp_sender,metadata=EXCLUDED.metadata,updated_at=now();
  PERFORM public.queue_provisioning(_tenant,'branding','default','update',_branding);
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_branding(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_branding(uuid,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_upsert_domain(_tenant uuid,_product text,_domain text,_primary boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Domain access denied';
  END IF;
  IF _domain !~ '^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN RAISE EXCEPTION 'Invalid domain'; END IF;
  IF _primary THEN UPDATE public.tenant_domains SET is_primary=false,updated_at=now() WHERE tenant_id=_tenant AND product_key IS NOT DISTINCT FROM _product; END IF;
  INSERT INTO public.tenant_domains(tenant_id,product_key,domain,is_primary)
  VALUES(_tenant,_product,lower(_domain),_primary)
  ON CONFLICT (domain) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,product_key=EXCLUDED.product_key,is_primary=EXCLUDED.is_primary,updated_at=now()
  RETURNING id INTO result;
  PERFORM public.queue_provisioning(_tenant,'domain',lower(_domain),'verify',jsonb_build_object('productKey',_product,'primary',_primary));
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_upsert_domain(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_upsert_domain(uuid,text,text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.is_organisation_member(_organisation uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organisation_members WHERE organisation_id=_organisation AND user_id=_user);
$$;
REVOKE ALL ON FUNCTION public.is_organisation_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_organisation_member(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_link_product(
  _tenant uuid,
  _product text,
  _external_tenant_id text,
  _base_url text DEFAULT NULL,
  _capabilities text[] DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF length(COALESCE(_external_tenant_id,''))<1 THEN RAISE EXCEPTION 'External tenant ID required'; END IF;
  INSERT INTO public.product_connections(tenant_id,product_key,external_tenant_id,base_url,status,capabilities)
  VALUES(_tenant,_product,_external_tenant_id,_base_url,'configured',COALESCE(_capabilities,'{}'))
  ON CONFLICT (tenant_id,product_key,external_tenant_id)
  DO UPDATE SET base_url=EXCLUDED.base_url,capabilities=EXCLUDED.capabilities,status='configured',updated_at=now()
  RETURNING id INTO result;
  INSERT INTO public.tenant_products(tenant_id,product_key,status,external_tenant_id,base_url)
  VALUES(_tenant,_product,'provisioning',_external_tenant_id,_base_url)
  ON CONFLICT (tenant_id,product_key) DO UPDATE SET external_tenant_id=EXCLUDED.external_tenant_id,base_url=EXCLUDED.base_url,status=CASE WHEN public.tenant_products.status='active' THEN 'active' ELSE 'provisioning' END,updated_at=now();
  PERFORM public.queue_provisioning(_tenant,'integration',_product||':'||_external_tenant_id,'verify',jsonb_build_object('productKey',_product,'externalTenantId',_external_tenant_id,'baseUrl',_base_url,'capabilities',_capabilities));
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_link_product(uuid,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_link_product(uuid,text,text,text,text[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_control_plane_catalogue()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT jsonb_build_object(
 'isPlatformAdmin',public.is_platform_admin(auth.uid()),
 'products',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.name),'[]'::jsonb) FROM public.product_catalogue p WHERE p.status IN ('active','beta')),
 'services',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.family,s.name),'[]'::jsonb) FROM public.service_catalogue s WHERE s.status IN ('active','beta')),
 'dependencies',(SELECT COALESCE(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.service_dependencies d),
 'blueprints',(SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.category,b.name),'[]'::jsonb) FROM public.tenant_blueprints b WHERE b.status='active')
);
$$;
REVOKE ALL ON FUNCTION public.get_control_plane_catalogue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_control_plane_catalogue() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_tenant_control_plane(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Tenant access denied'; END IF;
 RETURN jsonb_build_object(
  'tenant',(SELECT to_jsonb(t) FROM public.tenants t WHERE t.id=_tenant),
  'organisation',(SELECT to_jsonb(o) FROM public.organisations o JOIN public.tenants t ON t.organisation_id=o.id WHERE t.id=_tenant),
  'products',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.product_key),'[]'::jsonb) FROM public.tenant_products p WHERE p.tenant_id=_tenant),
  'services',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.service_key),'[]'::jsonb) FROM public.tenant_services s WHERE s.tenant_id=_tenant),
  'branding',(SELECT to_jsonb(b) FROM public.tenant_branding b WHERE b.tenant_id=_tenant),
  'domains',(SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.is_primary DESC,d.domain),'[]'::jsonb) FROM public.tenant_domains d WHERE d.tenant_id=_tenant),
  'connections',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.product_key,c.external_tenant_id),'[]'::jsonb) FROM public.product_connections c WHERE c.tenant_id=_tenant),
  'provisioning',(SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.created_at DESC),'[]'::jsonb) FROM (SELECT * FROM public.provisioning_jobs WHERE tenant_id=_tenant ORDER BY created_at DESC LIMIT 50) j)
 );
END; $$;
REVOKE ALL ON FUNCTION public.get_tenant_control_plane(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_control_plane(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_list_tenants()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.is_platform_admin(auth.uid()) THEN COALESCE(jsonb_agg(jsonb_build_object(
  'id',t.id,'name',t.name,'slug',t.slug,'status',t.status,'countryCode',t.country_code,'currency',t.currency,'timezone',t.timezone,
  'organisationId',o.id,'organisationName',o.name,
  'products',(SELECT count(*) FROM public.tenant_products tp WHERE tp.tenant_id=t.id AND tp.status NOT IN ('cancelled','failed')),
  'services',(SELECT count(*) FROM public.tenant_services ts WHERE ts.tenant_id=t.id AND ts.status NOT IN ('cancelled','failed'))
 ) ORDER BY t.created_at DESC),'[]'::jsonb) ELSE '[]'::jsonb END
 FROM public.tenants t JOIN public.organisations o ON o.id=t.organisation_id;
$$;
REVOKE ALL ON FUNCTION public.platform_list_tenants() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_list_tenants() TO authenticated,service_role;

-- Replace bootstrap so future self-created workspaces also get an organisation.
CREATE OR REPLACE FUNCTION public.create_my_tenant(_name text, _slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tenants; org_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _name IS NULL OR _slug IS NULL OR length(_name) NOT BETWEEN 1 AND 100
     OR _slug !~ '^[a-z0-9-]{1,80}$' THEN RAISE EXCEPTION 'Invalid tenant creation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  SELECT tenants.* INTO t FROM public.tenants JOIN public.tenant_members m ON m.tenant_id=tenants.id WHERE m.user_id=auth.uid() ORDER BY m.created_at, tenants.id LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug); END IF;
  INSERT INTO public.organisations(name,slug) VALUES(_name,_slug) RETURNING id INTO org_id;
  INSERT INTO public.tenants(name,slug,organisation_id) VALUES (_name, _slug,org_id) RETURNING * INTO t;
  INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES(t.id,auth.uid(),'owner');
  INSERT INTO public.organisation_members(organisation_id,user_id,role) VALUES(org_id,auth.uid(),'owner');
  RETURN jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug);
END; $$;
REVOKE ALL ON FUNCTION public.create_my_tenant(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_tenant(text,text) TO authenticated;

-- RLS: catalogues are readable, tenant configuration stays member-scoped; writes go through vetted RPCs.
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['platform_admins','organisations','organisation_members','product_catalogue','service_catalogue','service_dependencies','product_services','tenant_products','tenant_services','tenant_branding','tenant_domains','product_connections','tenant_blueprints','blueprint_products','blueprint_services','provisioning_jobs','provisioning_events'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
   EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',n);
   EXECUTE format('GRANT ALL ON public.%I TO service_role',n);
 END LOOP;
END $$;

GRANT SELECT ON public.product_catalogue,public.service_catalogue,public.service_dependencies,public.product_services,public.tenant_blueprints,public.blueprint_products,public.blueprint_services TO authenticated;
GRANT SELECT ON public.organisations,public.organisation_members,public.tenant_products,public.tenant_services,public.tenant_branding,public.tenant_domains,public.product_connections,public.provisioning_jobs,public.provisioning_events TO authenticated;

CREATE POLICY "catalogue products read" ON public.product_catalogue FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogue services read" ON public.service_catalogue FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogue dependencies read" ON public.service_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogue product services read" ON public.product_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogue blueprints read" ON public.tenant_blueprints FOR SELECT TO authenticated USING (status='active');
CREATE POLICY "catalogue blueprint products read" ON public.blueprint_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogue blueprint services read" ON public.blueprint_services FOR SELECT TO authenticated USING (true);

CREATE POLICY "organisation members read" ON public.organisations FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_organisation_member(id,auth.uid()));
CREATE POLICY "organisation membership read" ON public.organisation_members FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_organisation_member(organisation_id,auth.uid()));

CREATE POLICY "tenant products read" ON public.tenant_products FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "tenant services read" ON public.tenant_services FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "tenant branding read" ON public.tenant_branding FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "tenant domains read" ON public.tenant_domains FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "product connections read" ON public.product_connections FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "provisioning jobs read" ON public.provisioning_jobs FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "provisioning events read" ON public.provisioning_events FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

GRANT USAGE,SELECT ON SEQUENCE public.provisioning_events_id_seq TO service_role;

COMMIT;
