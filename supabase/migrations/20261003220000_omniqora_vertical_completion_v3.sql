-- Complete shared non-Dishbee vertical foundations on the current Omniqora kernel.
BEGIN;

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.automotive','Automotive Intelligence','Shared vehicle identity, evidence, appraisal, valuation, JDM, fitment and compliance primitives.','automotive','omniqora',true,'automatic','active'),
('omniqora.childcare','Childcare Shared','Shared parent/provider profiles, matching, availability, evidence and compliance primitives.','childcare','omniqora',true,'automatic','active')
ON CONFLICT(service_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.automotive','omniqora.crm'),
('omniqora.automotive','omniqora.ai'),
('omniqora.automotive','omniqora.marketplace'),
('omniqora.childcare','omniqora.crm')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('zivvo','omniqora.automotive',true,true),
('autohashi','omniqora.automotive',true,true),
('sparesgrid','omniqora.automotive',true,true),
('kindelo','omniqora.childcare',true,true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.automotive_vehicles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 origin text NOT NULL CHECK(origin IN('uk','japan','other')),
 vrm text,vin text,chassis_number text,model_code text,
 make text NOT NULL,model text NOT NULL,derivative text,
 first_registration_date date,
 specification jsonb NOT NULL DEFAULT '{}'::jsonb,
 provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','sold','exported','scrapped','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(vrm IS NOT NULL OR vin IS NOT NULL OR chassis_number IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS automotive_vehicle_identity_idx ON public.automotive_vehicles(tenant_id,vin,vrm,chassis_number);

CREATE TABLE IF NOT EXISTS public.automotive_appraisals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','capture_requested','capturing','review','completed','expired','cancelled')),
 requested_items text[] NOT NULL DEFAULT '{}',require_fresh_capture boolean NOT NULL DEFAULT true,
 allow_library_upload boolean NOT NULL DEFAULT false,capture_geolocation boolean NOT NULL DEFAULT false CHECK(capture_geolocation=false),
 expires_at timestamptz,created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.automotive_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 appraisal_id uuid REFERENCES public.automotive_appraisals(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN('photo','video','document')),
 capture_item text NOT NULL,storage_ref text NOT NULL,sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),provider_timestamp timestamptz,
 mime_type text NOT NULL,bytes bigint NOT NULL CHECK(bytes>=0),source text NOT NULL,
 location_captured boolean NOT NULL DEFAULT false CHECK(location_captured=false),
 metadata_sanitised boolean NOT NULL DEFAULT true,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automotive_passport_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0),passport jsonb NOT NULL,source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
 generated_at timestamptz NOT NULL DEFAULT now(),generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 UNIQUE(tenant_id,vehicle_id,revision)
);

CREATE TABLE IF NOT EXISTS public.automotive_ai_findings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 appraisal_id uuid REFERENCES public.automotive_appraisals(id) ON DELETE SET NULL,
 finding_type text NOT NULL,summary text NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_ids uuid[] NOT NULL DEFAULT '{}',confidence numeric(5,4) CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 risk text NOT NULL DEFAULT 'review' CHECK(risk IN('low','review','high','specialist_review')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','accepted','rejected','superseded')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automotive_valuations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 valuation_type text NOT NULL CHECK(valuation_type IN('retail','trade','auction','insurance','landed_cost','max_bid')),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),amount_minor bigint NOT NULL,
 low_minor bigint,high_minor bigint,as_of timestamptz NOT NULL DEFAULT now(),source text NOT NULL,
 comparable_refs jsonb NOT NULL DEFAULT '[]'::jsonb,assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
 confidence numeric(5,4) CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automotive_auction_lots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid REFERENCES public.automotive_vehicles(id) ON DELETE SET NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_lot_id text NOT NULL,auction_house text,auction_at timestamptz,status text NOT NULL DEFAULT 'open',
 grade text,odometer_km integer,starting_price_minor bigint,current_price_minor bigint,currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 auction_sheet jsonb NOT NULL DEFAULT '{}'::jsonb,images jsonb NOT NULL DEFAULT '[]'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,provider_key,external_lot_id)
);

CREATE TABLE IF NOT EXISTS public.automotive_bid_models(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 destination_country text NOT NULL,fx_rate numeric,fx_source text,fx_as_of timestamptz,
 purchase_cost_minor bigint NOT NULL DEFAULT 0,auction_fees_minor bigint NOT NULL DEFAULT 0,inland_transport_minor bigint NOT NULL DEFAULT 0,
 freight_minor bigint NOT NULL DEFAULT 0,insurance_minor bigint NOT NULL DEFAULT 0,duty_minor bigint NOT NULL DEFAULT 0,tax_minor bigint NOT NULL DEFAULT 0,
 registration_minor bigint NOT NULL DEFAULT 0,other_minor bigint NOT NULL DEFAULT 0,target_margin_minor bigint NOT NULL DEFAULT 0,
 target_retail_minor bigint,max_bid_minor bigint,currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','expired')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automotive_parts_fitment(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 part_ref text NOT NULL,vehicle_id uuid REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 make text,model text,model_code text,year_from integer,year_to integer,engine_code text,
 fitment_status text NOT NULL DEFAULT 'unverified' CHECK(fitment_status IN('unverified','compatible','incompatible','conditional')),
 conditions jsonb NOT NULL DEFAULT '{}'::jsonb,source_refs text[] NOT NULL DEFAULT '{}',reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automotive_compliance_checks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.automotive_vehicles(id) ON DELETE CASCADE,
 jurisdiction text NOT NULL,check_type text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','pass','warning','fail','not_applicable')),
 findings jsonb NOT NULL DEFAULT '[]'::jsonb,evidence_refs text[] NOT NULL DEFAULT '{}',checked_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.childcare_parent_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
 household_ref text,requirements jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,person_id)
);

CREATE TABLE IF NOT EXISTS public.childcare_children(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 parent_profile_id uuid NOT NULL REFERENCES public.childcare_parent_profiles(id) ON DELETE CASCADE,
 child_ref text NOT NULL,date_of_birth date,care_needs jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,child_ref)
);

CREATE TABLE IF NOT EXISTS public.childcare_provider_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
 provider_ref text NOT NULL,provider_type text NOT NULL DEFAULT 'childminder',
 regulator_ref text,service_area jsonb NOT NULL DEFAULT '{}'::jsonb,capacity integer CHECK(capacity IS NULL OR capacity>=0),
 age_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,services jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'onboarding' CHECK(status IN('onboarding','active','suspended','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,provider_ref)
);

CREATE TABLE IF NOT EXISTS public.childcare_provider_availability(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 provider_id uuid NOT NULL REFERENCES public.childcare_provider_profiles(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,available_places integer NOT NULL DEFAULT 1 CHECK(available_places>=0),
 recurrence jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'available' CHECK(status IN('available','held','unavailable')),
 CHECK(ends_at>starts_at)
);

CREATE TABLE IF NOT EXISTS public.childcare_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 child_id uuid NOT NULL REFERENCES public.childcare_children(id) ON DELETE CASCADE,
 provider_id uuid NOT NULL REFERENCES public.childcare_provider_profiles(id) ON DELETE CASCADE,
 score numeric(7,4),reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'suggested' CHECK(status IN('suggested','contacted','visit','offered','accepted','declined','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(child_id,provider_id)
);

CREATE TABLE IF NOT EXISTS public.childcare_compliance_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_id uuid NOT NULL REFERENCES public.childcare_provider_profiles(id) ON DELETE CASCADE,
 requirement_key text NOT NULL,title text NOT NULL,status text NOT NULL DEFAULT 'missing' CHECK(status IN('missing','requested','received','verified','expired','rejected','not_required')),
 evidence_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,issued_at date,expires_at date,
 checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,checked_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(provider_id,requirement_key)
);

CREATE TABLE IF NOT EXISTS public.company_secretarial_officers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 entity_id uuid NOT NULL REFERENCES public.company_secretarial_entities(id) ON DELETE CASCADE,
 officer_type text NOT NULL CHECK(officer_type IN('director','secretary','psc','member','shareholder')),
 person_ref text NOT NULL,name text NOT NULL,appointed_on date,ceased_on date,
 verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN('unverified','pending','verified','failed','expired')),
 verification_ref text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_secretarial_filings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 entity_id uuid NOT NULL REFERENCES public.company_secretarial_entities(id) ON DELETE CASCADE,
 filing_type text NOT NULL,period_end date,due_at timestamptz,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','submitted','accepted','rejected','cancelled')),
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 provider_ref text,payload jsonb NOT NULL DEFAULT '{}'::jsonb,evidence_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 submitted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
 'automotive_vehicles','automotive_appraisals','automotive_evidence','automotive_passport_snapshots','automotive_ai_findings',
 'automotive_valuations','automotive_auction_lots','automotive_bid_models','automotive_parts_fitment','automotive_compliance_checks',
 'childcare_parent_profiles','childcare_children','childcare_provider_profiles','childcare_provider_availability','childcare_matches',
 'childcare_compliance_records','company_secretarial_officers','company_secretarial_filings'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','v3 vertical read '||t,t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','v3 vertical write '||t,t);
 END LOOP;
END $$;

UPDATE public.vertical_package_catalogue SET implementation_status='built_main',
 required_services=ARRAY['omniqora.crm','omniqora.ai','omniqora.marketplace','omniqora.automotive'],
 capabilities=ARRAY['vehicle_identity','passport','verified_media','appraisal','valuation','jdm_auction','landed_cost','max_bid','parts_fitment','compliance'],
 updated_at=now()
WHERE package_key='automotive.shared';

UPDATE public.vertical_package_catalogue SET implementation_status='built_main',
 required_services=ARRAY['omniqora.crm','omniqora.childcare','omniqora.documents','omniqora.automation'],
 capabilities=ARRAY['parents','children','providers','availability','matching','compliance'],
 updated_at=now()
WHERE package_key='kindelo.childcare';

COMMIT;
