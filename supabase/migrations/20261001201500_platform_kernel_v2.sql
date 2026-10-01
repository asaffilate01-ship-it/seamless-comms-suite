-- Omniqora platform kernel v2, reconciled with the current SaaS Factory schema.
BEGIN;

ALTER TABLE public.tenant_products
  ADD COLUMN IF NOT EXISTS region_key text NOT NULL DEFAULT 'gb',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-GB',
  ADD COLUMN IF NOT EXISTS runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS launch_status text NOT NULL DEFAULT 'draft'
    CHECK (launch_status IN ('draft','configuring','blocked','ready','live'));

CREATE TABLE IF NOT EXISTS public.region_packs (
  region_key text PRIMARY KEY CHECK (region_key ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  timezones text[] NOT NULL DEFAULT '{}',
  supported_locales text[] NOT NULL DEFAULT '{}',
  data_region text NOT NULL DEFAULT 'eu',
  tax_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','preview','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.locale_packs (
  locale text PRIMARY KEY,
  language_code text NOT NULL,
  country_code text,
  rtl boolean NOT NULL DEFAULT false,
  date_format text,
  number_format text,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','preview','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.region_packs(region_key,name,country_code,currency,timezones,supported_locales,data_region,provider_preferences) VALUES
 ('gb','United Kingdom','GB','GBP',ARRAY['Europe/London'],ARRAY['en-GB'],'eu',jsonb_build_object('maps',ARRAY['google','mapbox'],'payments',ARRAY['adyen','stripe','sumup'])),
 ('de','Germany','DE','EUR',ARRAY['Europe/Berlin'],ARRAY['de-DE','en-GB'],'eu',jsonb_build_object('maps',ARRAY['google','mapbox'],'payments',ARRAY['adyen','stripe'])),
 ('ae','United Arab Emirates','AE','AED',ARRAY['Asia/Dubai'],ARRAY['en-AE','ar-AE'],'me',jsonb_build_object('maps',ARRAY['google'],'payments',ARRAY['adyen','stripe'])),
 ('us','United States','US','USD',ARRAY['America/New_York','America/Chicago','America/Denver','America/Los_Angeles'],ARRAY['en-US'],'us',jsonb_build_object('maps',ARRAY['google','mapbox'],'payments',ARRAY['stripe'])),
 ('pk','Pakistan','PK','PKR',ARRAY['Asia/Karachi'],ARRAY['en-PK','ur-PK'],'apac',jsonb_build_object('maps',ARRAY['google']))
ON CONFLICT(region_key) DO UPDATE SET
 name=EXCLUDED.name,country_code=EXCLUDED.country_code,currency=EXCLUDED.currency,
 timezones=EXCLUDED.timezones,supported_locales=EXCLUDED.supported_locales,
 data_region=EXCLUDED.data_region,provider_preferences=EXCLUDED.provider_preferences,updated_at=now();

INSERT INTO public.locale_packs(locale,language_code,country_code,rtl,date_format,number_format,terminology) VALUES
 ('en-GB','en','GB',false,'DD/MM/YYYY','en-GB','{}'),
 ('de-DE','de','DE',false,'DD.MM.YYYY','de-DE','{}'),
 ('en-AE','en','AE',false,'DD/MM/YYYY','en-AE','{}'),
 ('ar-AE','ar','AE',true,'DD/MM/YYYY','ar-AE','{}'),
 ('en-US','en','US',false,'MM/DD/YYYY','en-US','{}'),
 ('en-PK','en','PK',false,'DD/MM/YYYY','en-PK','{}'),
 ('ur-PK','ur','PK',true,'DD/MM/YYYY','ur-PK','{}')
ON CONFLICT(locale) DO UPDATE SET
 language_code=EXCLUDED.language_code,country_code=EXCLUDED.country_code,rtl=EXCLUDED.rtl,
 date_format=EXCLUDED.date_format,number_format=EXCLUDED.number_format,terminology=EXCLUDED.terminology,updated_at=now();

CREATE TABLE IF NOT EXISTS public.platform_service_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id text NOT NULL UNIQUE CHECK (key_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  secret_suffix text NOT NULL CHECK (length(secret_suffix) BETWEEN 4 AND 16),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_catalogue (
  provider_key text PRIMARY KEY CHECK (provider_key ~ '^[a-z0-9][a-z0-9.-]{2,100}$'),
  name text NOT NULL,
  provider_kind text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}',
  supported_countries text[] NOT NULL DEFAULT '{}',
  required_secret_names text[] NOT NULL DEFAULT '{}',
  public_config_names text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('active','preview','planned','retired')),
  implementation_status text NOT NULL DEFAULT 'catalogue_only'
    CHECK (implementation_status IN ('live_main','built_main','draft_branch','catalogue_only','external_product')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_provider_requirements (
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE RESTRICT,
  required boolean NOT NULL DEFAULT false,
  purpose text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(product_key,provider_key)
);

CREATE TABLE IF NOT EXISTS public.provider_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE RESTRICT,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development','staging','production')),
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','active','degraded','disabled','failed')),
  secret_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_bindings_scope_uq
ON public.provider_bindings(
 tenant_id,product_key,provider_key,environment,
 COALESCE(brand_id,'00000000-0000-0000-0000-000000000000'::uuid),
 COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE TABLE IF NOT EXISTS public.tenant_data_routes (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  routing_mode text NOT NULL DEFAULT 'shared' CHECK (routing_mode IN ('shared','regional','dedicated','external')),
  data_region text NOT NULL DEFAULT 'eu',
  connection_ref text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','degraded','disabled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key)
);

CREATE TABLE IF NOT EXISTS public.platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z0-9]+([._-][a-z0-9]+)+$'),
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version>0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_service text,
  subject_type text,
  subject_id text,
  correlation_id text,
  causation_id text,
  idempotency_key text NOT NULL,
  data_classification text NOT NULL DEFAULT 'internal'
    CHECK (data_classification IN ('public','internal','confidential','restricted')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE INDEX IF NOT EXISTS platform_events_scope_idx
 ON public.platform_events(tenant_id,product_key,occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_type_idx
 ON public.platform_events(event_type,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_event_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  name text NOT NULL,
  event_patterns text[] NOT NULL DEFAULT '{}',
  destination_kind text NOT NULL CHECK (destination_kind IN ('webhook','worker','projection')),
  destination_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.platform_events(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.platform_event_subscriptions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','succeeded','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS platform_event_delivery_queue_idx
 ON public.platform_event_deliveries(status,available_at,created_at);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  service_key text REFERENCES public.service_catalogue(service_key) ON DELETE SET NULL,
  metric_key text NOT NULL,
  quantity numeric(20,6) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'count',
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,metric_key,idempotency_key)
);
CREATE INDEX IF NOT EXISTS usage_events_scope_idx
 ON public.usage_events(tenant_id,product_key,occurred_at DESC);

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status
) VALUES
 ('identity.host','Host Identity Provider','identity',ARRAY['session','membership','password','magic_link'],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'active','live_main'),
 ('communications.meta-whatsapp','Meta WhatsApp Cloud API','communications',ARRAY['whatsapp.inbound','whatsapp.outbound','whatsapp.templates'],ARRAY[]::text[],ARRAY['access_token','app_secret','verify_token'],ARRAY['phone_number_id','waba_id'],'active','live_main'),
 ('communications.twilio','Twilio','communications',ARRAY['voice','sms','whatsapp','masked_calls'],ARRAY[]::text[],ARRAY['account_sid','auth_token'],ARRAY['messaging_service_sid','voice_number'],'preview','draft_branch'),
 ('communications.resend','Resend','communications',ARRAY['email','email.transactional'],ARRAY[]::text[],ARRAY['api_key'],ARRAY['sending_domain'],'planned','draft_branch'),
 ('payments.stripe','Stripe','payments',ARRAY['checkout','subscriptions','refunds','webhooks'],ARRAY[]::text[],ARRAY['secret_key','webhook_secret'],ARRAY['publishable_key'],'preview','draft_branch'),
 ('payments.adyen','Adyen','payments',ARRAY['checkout','splits','payouts','refunds'],ARRAY[]::text[],ARRAY['api_key','hmac_key'],ARRAY['merchant_account','client_key'],'preview','draft_branch'),
 ('payments.sumup','SumUp','payments',ARRAY['pos','checkout'],ARRAY['GB','DE'],ARRAY['access_token'],ARRAY['merchant_code'],'preview','draft_branch'),
 ('maps.google','Google Maps Platform','maps',ARRAY['geocode','reverse','routes','distance','places'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','draft_branch'),
 ('maps.mapbox','Mapbox','maps',ARRAY['geocode','routes','matrix','maps'],ARRAY[]::text[],ARRAY['access_token'],ARRAY[]::text[],'planned','draft_branch'),
 ('ai.openai','OpenAI','ai',ARRAY['generation','embeddings','speech','vision'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'preview','built_main'),
 ('ai.anthropic','Anthropic','ai',ARRAY['generation','vision'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'preview','built_main'),
 ('ai.gemini','Google Gemini','ai',ARRAY['generation','vision'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'preview','built_main'),
 ('registry.companies-house','Companies House','registry',ARRAY['company_lookup','filing_status','submissions'],ARRAY['GB'],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
 ('tax.hmrc','HMRC','tax',ARRAY['oauth','obligations','submissions','receipts'],ARRAY['GB'],ARRAY['client_id','client_secret'],ARRAY['redirect_uri'],'planned','catalogue_only'),
 ('banking.clearbank','ClearBank','banking',ARRAY['accounts','payments','beneficiaries','webhooks'],ARRAY['GB'],ARRAY['client_id','client_secret'],ARRAY['institution_id','webhook_url'],'planned','catalogue_only'),
 ('remittance.thunes','Thunes','remittance',ARRAY['quotes','transfers','beneficiaries','status','webhooks'],ARRAY[]::text[],ARRAY['api_key','api_secret'],ARRAY['base_url','callback_url'],'planned','catalogue_only'),
 ('telecom.gigs','Gigs','telecom',ARRAY['plans','subscriptions','sims','esims','usage','webhooks'],ARRAY['GB'],ARRAY['api_key','webhook_secret'],ARRAY['project_id'],'planned','built_main'),
 ('delivery.uber-direct','Uber Direct','delivery',ARRAY['quote','delivery','tracking','webhooks'],ARRAY['GB','DE'],ARRAY['client_id','client_secret'],ARRAY['customer_id'],'planned','catalogue_only'),
 ('delivery.stuart','Stuart','delivery',ARRAY['quote','delivery','tracking','webhooks'],ARRAY['GB'],ARRAY['client_id','client_secret'],ARRAY[]::text[],'planned','catalogue_only')
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,provider_kind=EXCLUDED.provider_kind,capabilities=EXCLUDED.capabilities,
 supported_countries=EXCLUDED.supported_countries,required_secret_names=EXCLUDED.required_secret_names,
 public_config_names=EXCLUDED.public_config_names,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose) VALUES
 ('dishbee','communications.meta-whatsapp',false,'WhatsApp ordering and support'),
 ('dishbee','communications.twilio',false,'Phone/SMS assisted ordering'),
 ('dishbee','payments.adyen',false,'Online and split payments'),
 ('dishbee','payments.sumup',false,'POS/payment links'),
 ('mealdeck','payments.adyen',true,'Split payments and settlement'),
 ('mealdeck','delivery.uber-direct',false,'Last-mile delivery'),
 ('mealdeck','delivery.stuart',false,'Last-mile delivery'),
 ('formationgenie','registry.companies-house',true,'UK company formation and company-secretarial filings'),
 ('fastremit','banking.clearbank',true,'UK banking/payment rail'),
 ('fastremit','remittance.thunes',true,'Cross-border payout rail')
ON CONFLICT(product_key,provider_key) DO UPDATE SET required=EXCLUDED.required,purpose=EXCLUDED.purpose;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_product_runtime(
  _tenant uuid,
  _product text,
  _region text,
  _locale text,
  _runtime_config jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
DECLARE rp public.region_packs%rowtype;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Tenant product runtime access denied';
  END IF;
  SELECT * INTO rp FROM public.region_packs WHERE region_key=_region AND status<>'retired';
  IF NOT FOUND THEN RAISE EXCEPTION 'Region pack not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.locale_packs WHERE locale=_locale AND status<>'retired') THEN
    RAISE EXCEPTION 'Locale pack not found';
  END IF;
  IF NOT (_locale = ANY(rp.supported_locales)) THEN
    RAISE EXCEPTION 'Locale is not supported by region pack';
  END IF;
  UPDATE public.tenant_products
  SET region_key=_region,locale=_locale,runtime_config=COALESCE(_runtime_config,'{}'::jsonb),
      launch_status='configuring',updated_at=now()
  WHERE tenant_id=_tenant AND product_key=_product;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant product not found'; END IF;
END; $;
REVOKE ALL ON FUNCTION public.platform_set_tenant_product_runtime(uuid,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_product_runtime(uuid,text,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_set_service_credential(
  _key_id text,
  _secret_hash text,
  _secret_suffix text,
  _scopes jsonb,
  _valid_days integer DEFAULT 365
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _key_id !~ '^[A-Za-z0-9_-]{8,80}$' OR _secret_hash !~ '^[a-f0-9]{64}$'
     OR length(_secret_suffix) NOT BETWEEN 4 AND 16 OR _valid_days NOT BETWEEN 1 AND 730 THEN
    RAISE EXCEPTION 'Invalid service credential material';
  END IF;
  INSERT INTO public.platform_service_credentials(key_id,secret_hash,secret_suffix,status,scopes,expires_at,created_by)
  VALUES(_key_id,_secret_hash,_secret_suffix,'active',COALESCE(_scopes,'[]'::jsonb),now()+make_interval(days=>_valid_days),auth.uid())
  ON CONFLICT(key_id) DO UPDATE SET
    secret_hash=EXCLUDED.secret_hash,secret_suffix=EXCLUDED.secret_suffix,status='active',
    scopes=EXCLUDED.scopes,expires_at=EXCLUDED.expires_at,updated_at=now()
  RETURNING id INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_service_credential(text,text,text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_service_credential(text,text,text,jsonb,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_upsert_provider_binding(
  _tenant uuid,
  _product text,
  _brand uuid,
  _location uuid,
  _provider text,
  _environment text,
  _secret_refs jsonb,
  _config jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Provider binding access denied';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.provider_catalogue WHERE provider_key=_provider AND status<>'retired') THEN
    RAISE EXCEPTION 'Unknown provider';
  END IF;
  IF _brand IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_brands WHERE id=_brand AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'Brand scope does not belong to tenant';
  END IF;
  IF _location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_locations WHERE id=_location AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'Location scope does not belong to tenant';
  END IF;
  UPDATE public.provider_bindings
  SET secret_refs=COALESCE(_secret_refs,'{}'::jsonb),
      config=COALESCE(_config,'{}'::jsonb),
      status='configured',
      updated_at=now()
  WHERE tenant_id=_tenant AND product_key=_product AND provider_key=_provider
    AND environment=_environment
    AND brand_id IS NOT DISTINCT FROM _brand
    AND location_id IS NOT DISTINCT FROM _location
  RETURNING id INTO result;

  IF result IS NULL THEN
    INSERT INTO public.provider_bindings(
      tenant_id,product_key,brand_id,location_id,provider_key,environment,status,secret_refs,config
    ) VALUES(
      _tenant,_product,_brand,_location,_provider,_environment,'configured',
      COALESCE(_secret_refs,'{}'::jsonb),COALESCE(_config,'{}'::jsonb)
    )
    RETURNING id INTO result;
  END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_upsert_provider_binding(uuid,text,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_upsert_provider_binding(uuid,text,uuid,uuid,text,text,jsonb,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_set_data_route(
  _tenant uuid,_product text,_mode text,_region text,_connection_ref text,_config jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  INSERT INTO public.tenant_data_routes(tenant_id,product_key,routing_mode,data_region,connection_ref,status,config)
  VALUES(_tenant,_product,_mode,_region,_connection_ref,'active',COALESCE(_config,'{}'::jsonb))
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET routing_mode=EXCLUDED.routing_mode,data_region=EXCLUDED.data_region,
    connection_ref=EXCLUDED.connection_ref,status='active',config=EXCLUDED.config,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_data_route(uuid,text,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_data_route(uuid,text,text,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_tenant_product_readiness(_tenant uuid,_product text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tp public.tenant_products%rowtype;
  p public.product_catalogue%rowtype;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  required_service record;
  required_provider record;
  connected boolean;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;

  SELECT * INTO tp FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product;
  IF NOT FOUND THEN RETURN jsonb_build_object('ready',false,'blockers',jsonb_build_array('tenant_product_missing'),'warnings',warnings); END IF;
  SELECT * INTO p FROM public.product_catalogue WHERE product_key=_product;

  IF tp.status IN ('failed','cancelled','suspended') THEN
    blockers := blockers || jsonb_build_array('tenant_product_'||tp.status);
  END IF;
  IF tp.region_key IS NULL OR NOT EXISTS(SELECT 1 FROM public.region_packs WHERE region_key=tp.region_key AND status<>'retired') THEN
    blockers := blockers || jsonb_build_array('region_pack_missing');
  END IF;
  IF tp.locale IS NULL OR NOT EXISTS(SELECT 1 FROM public.locale_packs WHERE locale=tp.locale AND status<>'retired') THEN
    blockers := blockers || jsonb_build_array('locale_pack_missing');
  END IF;

  FOR required_service IN
    SELECT ps.service_key
    FROM public.product_services ps
    WHERE ps.product_key=_product AND ps.required
  LOOP
    IF NOT public.has_tenant_entitlement(_tenant,required_service.service_key) THEN
      blockers := blockers || jsonb_build_array('service:'||required_service.service_key);
    END IF;
  END LOOP;

  FOR required_provider IN
    SELECT provider_key FROM public.product_provider_requirements
    WHERE product_key=_product AND required
  LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.provider_bindings b
      WHERE b.tenant_id=_tenant AND b.product_key=_product
        AND b.provider_key=required_provider.provider_key
        AND b.environment='production' AND b.status='active' AND b.last_verified_at IS NOT NULL
    ) THEN
      blockers := blockers || jsonb_build_array('provider:'||required_provider.provider_key);
    END IF;
  END LOOP;

  IF p.deployment_mode IN ('external','hybrid') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.product_connections c
      WHERE c.tenant_id=_tenant AND c.product_key=_product AND c.status='connected'
    ) INTO connected;
    IF NOT connected THEN blockers := blockers || jsonb_build_array('product_connection_missing'); END IF;
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.tenant_domains d
    WHERE d.tenant_id=_tenant AND (d.product_key=_product OR d.product_key IS NULL)
      AND d.verification_status='verified'
  ) THEN warnings := warnings || jsonb_build_array('verified_domain_missing'); END IF;

  RETURN jsonb_build_object(
    'ready',jsonb_array_length(blockers)=0,
    'blockers',blockers,
    'warnings',warnings,
    'regionKey',tp.region_key,
    'locale',tp.locale,
    'launchStatus',tp.launch_status
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_tenant_product_readiness(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_product_readiness(uuid,text) TO authenticated,service_role;

DO $$ DECLARE n text; BEGIN
  FOREACH n IN ARRAY ARRAY[
    'region_packs','locale_packs','platform_service_credentials','provider_catalogue',
    'product_provider_requirements','provider_bindings','tenant_data_routes',
    'platform_events','platform_event_subscriptions','platform_event_deliveries','usage_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',n);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',n);
  END LOOP;
END $$;

GRANT SELECT ON public.region_packs,public.locale_packs,public.provider_catalogue,public.product_provider_requirements TO authenticated;
GRANT SELECT ON public.provider_bindings,public.tenant_data_routes,public.platform_events,public.platform_event_subscriptions,public.platform_event_deliveries,public.usage_events TO authenticated;
GRANT INSERT ON public.platform_events,public.usage_events TO authenticated;

CREATE POLICY "region packs read" ON public.region_packs FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "locale packs read" ON public.locale_packs FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "provider catalogue read" ON public.provider_catalogue FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "provider requirements read" ON public.product_provider_requirements FOR SELECT TO authenticated USING(true);

CREATE POLICY "provider bindings tenant read" ON public.provider_bindings FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "data routes tenant read" ON public.tenant_data_routes FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "platform events tenant read" ON public.platform_events FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "platform events tenant insert" ON public.platform_events FOR INSERT TO authenticated
 WITH CHECK(public.can_write(tenant_id,auth.uid()));
CREATE POLICY "event subscriptions tenant read" ON public.platform_event_subscriptions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "event deliveries tenant read" ON public.platform_event_deliveries FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "usage tenant read" ON public.usage_events FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "usage tenant insert" ON public.usage_events FOR INSERT TO authenticated
 WITH CHECK(public.can_write(tenant_id,auth.uid()));

COMMIT;
