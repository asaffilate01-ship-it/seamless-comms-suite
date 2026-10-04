BEGIN;

-- 40-day Omniqora reconciliation (24 Aug -> 3 Oct 2026).
-- Adds shared capabilities requested across earlier threads without replacing
-- vertical products or Dishbee-specific runtime/cutover work.

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.contact-centre','Omniqora Contact','AI-first multi-tenant contact centre: queues, voice, callbacks, warm transfer, masking and attribution.','communications','omniqora',true,'automatic','active','built_main'),
 ('omniqora.growth-lab','Growth Lab','Consent, experiments, attribution, referrals and service-recovery orchestration.','growth','omniqora',true,'automatic','active','built_main'),
 ('omniqora.billing','Billing & Metering','Plans, add-ons, subscriptions, usage rates, invoices and settlement routing.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.mobile-core','Mobile Core','Tenant-branded mobile profiles, devices, offline events and sync state for universal agent apps.','operations','omniqora',true,'automatic','active','built_main'),
 ('omniqora.fleet-ops','Fleet Operations Depth','Driver shifts, attendance, earnings, wallets, maintenance, behaviour, idle and geofence controls.','operations','omniqora',true,'automatic','active','built_main'),
 ('omniqora.decision-intelligence','Decision Intelligence','Evidence-preserving decisions, outcome review, lessons and champion/challenger model evaluation.','ai','omniqora',true,'automatic','active','built_main'),
 ('omniqora.advisory','Advisory Workspace','QITT-style diagnostics, adviser/client engagements, scenarios, meeting briefs and follow-ups.','advisory','omniqora',true,'automatic','active','built_main'),
 ('omniqora.tax-scenarios','Tax Scenario Engine','Versioned jurisdiction/tax scenario framework for reviewed deterministic calculations.','tax','omniqora',true,'automatic','active','built_main'),
 ('omniqora.localisation-runtime','Localisation Runtime','Approved translations, tenant overrides and region/locale runtime policy.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.embeds','Embedded Surfaces','White-label embedded widgets and tenant-controlled origin policies.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.agent-templates','Agent Template Catalogue','Reusable governed agent templates and industry packs.','ai','omniqora',true,'automatic','active','built_main'),
 ('omniqora.reporting','Scheduled Reporting','Evidence-linked scheduled reports and delivery runs.','analytics','omniqora',true,'automatic','active','built_main'),
 ('omniqora.telecom','Telecom Orchestration','Shared plan, line, SIM/eSIM, porting and usage orchestration over approved telecom providers.','telecom','omniqora',true,'external','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.contact-centre','omniqora.connect'),
 ('omniqora.contact-centre','omniqora.crm'),
 ('omniqora.contact-centre','omniqora.ai'),
 ('omniqora.growth-lab','omniqora.crm'),
 ('omniqora.growth-lab','omniqora.journeys'),
 ('omniqora.growth-lab','omniqora.analytics'),
 ('omniqora.billing','omniqora.analytics'),
 ('omniqora.mobile-core','omniqora.identity'),
 ('omniqora.mobile-core','omniqora.connect'),
 ('omniqora.fleet-ops','omniqora.dispatch'),
 ('omniqora.fleet-ops','omniqora.geo'),
 ('omniqora.decision-intelligence','omniqora.ai'),
 ('omniqora.decision-intelligence','omniqora.analytics'),
 ('omniqora.advisory','omniqora.decision-intelligence'),
 ('omniqora.tax-scenarios','omniqora.tax-intelligence'),
 ('omniqora.embeds','omniqora.identity'),
 ('omniqora.agent-templates','omniqora.ai'),
 ('omniqora.reporting','omniqora.analytics'),
 ('omniqora.telecom','omniqora.billing')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT 'omniqora',x.service_key,x.default_enabled,false
FROM (VALUES
 ('omniqora.contact-centre',false),
 ('omniqora.growth-lab',true),
 ('omniqora.billing',true),
 ('omniqora.mobile-core',true),
 ('omniqora.fleet-ops',false),
 ('omniqora.decision-intelligence',true),
 ('omniqora.advisory',false),
 ('omniqora.tax-scenarios',false),
 ('omniqora.localisation-runtime',true),
 ('omniqora.embeds',true),
 ('omniqora.agent-templates',true),
 ('omniqora.reporting',true),
 ('omniqora.telecom',false)
) AS x(service_key,default_enabled)
WHERE EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key='omniqora')
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=EXCLUDED.default_enabled;

-- Saudi Arabia was missing from the current v2 region seed despite the Aramco workstream.
INSERT INTO public.region_packs(
 region_key,name,country_code,currency,timezones,supported_locales,data_region,tax_config,legal_config,provider_preferences,status
) VALUES(
 'sa','Saudi Arabia','SA','SAR',ARRAY['Asia/Riyadh'],ARRAY['ar-SA','en-SA'],'me',
 '{}'::jsonb,
 jsonb_build_object('compliancePacks',ARRAY['sa-aramco-readiness']),
 jsonb_build_object('maps',ARRAY['google'],'payments',ARRAY['adyen','stripe']),
 'active'
)
ON CONFLICT(region_key) DO UPDATE SET
 name=EXCLUDED.name,country_code=EXCLUDED.country_code,currency=EXCLUDED.currency,
 timezones=EXCLUDED.timezones,supported_locales=EXCLUDED.supported_locales,
 data_region=EXCLUDED.data_region,tax_config=EXCLUDED.tax_config,legal_config=EXCLUDED.legal_config,
 provider_preferences=EXCLUDED.provider_preferences,status='active',updated_at=now();

INSERT INTO public.locale_packs(locale,language_code,country_code,rtl,date_format,number_format,terminology,status) VALUES
 ('ar-SA','ar','SA',true,'DD/MM/YYYY','ar-SA','{}'::jsonb,'active'),
 ('en-SA','en','SA',false,'DD/MM/YYYY','en-GB','{}'::jsonb,'active')
ON CONFLICT(locale) DO UPDATE SET
 language_code=EXCLUDED.language_code,country_code=EXCLUDED.country_code,rtl=EXCLUDED.rtl,
 date_format=EXCLUDED.date_format,number_format=EXCLUDED.number_format,status='active',updated_at=now();

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status,metadata
) VALUES
 ('communications.asterisk','Asterisk / SIP','communications',
  ARRAY['voice','sip','ivr','queues','transfers','warm_transfer','callbacks','recordings','cdr','webhooks','masked_calls'],
  ARRAY[]::text[],ARRAY['api_secret'],ARRAY['base_url','sip_domain','trunk_name'],'preview','built_main',
  '{"providerBoundary":"Operator-hosted Asterisk/SIP; tenant/provider credentials remain server-side."}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,provider_kind=EXCLUDED.provider_kind,capabilities=EXCLUDED.capabilities,
 supported_countries=EXCLUDED.supported_countries,required_secret_names=EXCLUDED.required_secret_names,
 public_config_names=EXCLUDED.public_config_names,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,metadata=EXCLUDED.metadata,updated_at=now();

-- ---------------------------------------------------------------------------
-- Omniqora Contact: AI-first contact-centre / receptionist / call tracking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_centres(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 ai_first boolean NOT NULL DEFAULT true,
 ai_resolution_target numeric NOT NULL DEFAULT 80 CHECK(ai_resolution_target BETWEEN 0 AND 100),
 ai_disclosure text,
 recording_policy text NOT NULL DEFAULT 'disabled' CHECK(recording_policy IN('disabled','notice_required','consent_required','provider_policy')),
 transcript_retention_days integer NOT NULL DEFAULT 30 CHECK(transcript_retention_days BETWEEN 0 AND 3650),
 business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
 escalation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,name)
);

CREATE TABLE IF NOT EXISTS public.contact_numbers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 centre_id uuid REFERENCES public.contact_centres(id) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 address text NOT NULL,
 channel text NOT NULL DEFAULT 'voice' CHECK(channel IN('voice','sms','whatsapp')),
 purpose text NOT NULL DEFAULT 'main' CHECK(purpose IN('main','department','tracking','campaign','support','sales','overflow','masking')),
 department text,
 attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('configured','active','degraded','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,channel,address)
);

CREATE TABLE IF NOT EXISTS public.contact_queues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 centre_id uuid NOT NULL REFERENCES public.contact_centres(id) ON DELETE CASCADE,
 name text NOT NULL,
 skills text[] NOT NULL DEFAULT '{}',
 language_codes text[] NOT NULL DEFAULT '{}',
 ai_first boolean NOT NULL DEFAULT true,
 max_wait_seconds integer NOT NULL DEFAULT 180 CHECK(max_wait_seconds BETWEEN 0 AND 7200),
 overflow_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 callback_enabled boolean NOT NULL DEFAULT true,
 same_agent_enabled boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(centre_id,name)
);

CREATE TABLE IF NOT EXISTS public.contact_agent_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text,
 extension text,
 skills text[] NOT NULL DEFAULT '{}',
 languages text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'offline' CHECK(status IN('offline','available','busy','break','wrap_up','suspended')),
 max_concurrency integer NOT NULL DEFAULT 1 CHECK(max_concurrency BETWEEN 1 AND 20),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,user_id)
);

CREATE TABLE IF NOT EXISTS public.contact_queue_members(
 queue_id uuid NOT NULL REFERENCES public.contact_queues(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.contact_agent_profiles(id) ON DELETE CASCADE,
 priority integer NOT NULL DEFAULT 100,
 PRIMARY KEY(queue_id,agent_id)
);

CREATE TABLE IF NOT EXISTS public.contact_interactions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 centre_id uuid REFERENCES public.contact_centres(id) ON DELETE SET NULL,
 queue_id uuid REFERENCES public.contact_queues(id) ON DELETE SET NULL,
 business_number_id uuid REFERENCES public.contact_numbers(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 external_ref text,
 direction text NOT NULL CHECK(direction IN('inbound','outbound')),
 channel text NOT NULL CHECK(channel IN('voice','whatsapp','sms','email','web_chat','social')),
 intent text,
 language_code text,
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','ai_active','queued','ringing','human_active','callback_pending','completed','failed','abandoned')),
 ai_handled boolean NOT NULL DEFAULT false,
 ai_resolved boolean NOT NULL DEFAULT false,
 assigned_agent_id uuid REFERENCES public.contact_agent_profiles(id) ON DELETE SET NULL,
 same_agent_requested boolean NOT NULL DEFAULT false,
 transferred boolean NOT NULL DEFAULT false,
 transfer_mode text CHECK(transfer_mode IS NULL OR transfer_mode IN('warm','cold','callback')),
 started_at timestamptz NOT NULL DEFAULT now(),
 queued_at timestamptz,
 answered_at timestamptz,
 ended_at timestamptz,
 disposition text,
 summary text,
 sentiment text,
 recording_ref text,
 transcript_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,external_ref)
);

CREATE TABLE IF NOT EXISTS public.contact_interaction_legs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 interaction_id uuid NOT NULL REFERENCES public.contact_interactions(id) ON DELETE CASCADE,
 leg_type text NOT NULL CHECK(leg_type IN('ai','queue','agent','transfer','callback','external')),
 actor_ref text,
 provider_ref text,
 started_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 outcome text,
 summary text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.contact_transcript_segments(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 interaction_id uuid NOT NULL REFERENCES public.contact_interactions(id) ON DELETE CASCADE,
 speaker text NOT NULL,
 text text NOT NULL,
 started_ms integer,
 ended_ms integer,
 confidence numeric CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_callbacks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 interaction_id uuid REFERENCES public.contact_interactions(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 queue_id uuid REFERENCES public.contact_queues(id) ON DELETE SET NULL,
 preferred_agent_id uuid REFERENCES public.contact_agent_profiles(id) ON DELETE SET NULL,
 due_at timestamptz NOT NULL,
 reason text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','assigned','calling','completed','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,
 last_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_agent_affinity(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.contact_agent_profiles(id) ON DELETE CASCADE,
 interaction_count integer NOT NULL DEFAULT 0,
 successful_count integer NOT NULL DEFAULT 0,
 last_interaction_at timestamptz,
 score numeric NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,product_key,person_id,agent_id)
);

CREATE TABLE IF NOT EXISTS public.contact_tracking_attribution(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 interaction_id uuid NOT NULL REFERENCES public.contact_interactions(id) ON DELETE CASCADE,
 source text,
 medium text,
 campaign text,
 keyword text,
 landing_page text,
 referrer text,
 spend_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_masking_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 proxy_number text NOT NULL,
 caller_hash text NOT NULL,
 recipient_hash text NOT NULL,
 context_type text,
 context_id text,
 recording_policy text NOT NULL DEFAULT 'disabled',
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','active','completed','expired','failed')),
 expires_at timestamptz NOT NULL,
 started_at timestamptz,
 ended_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_masking_numbers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 phone_e164 text NOT NULL CHECK(phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','reserved','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_key,phone_e164)
);

CREATE TABLE IF NOT EXISTS public.contact_masking_participants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.contact_masking_sessions(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 side text NOT NULL CHECK(side IN('caller','recipient')),
 phone_e164 text NOT NULL CHECK(phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,side)
);

-- ---------------------------------------------------------------------------
-- Growth Lab: consent, experiments, attribution, referrals and recovery.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.growth_consent_topics(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 topic_key text NOT NULL,
 name text NOT NULL,
 purpose text NOT NULL,
 channels text[] NOT NULL DEFAULT '{}',
 default_state text NOT NULL DEFAULT 'unknown' CHECK(default_state IN('unknown','granted','denied')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,product_key,topic_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_consent_topic_scope_uq
 ON public.growth_consent_topics(tenant_id,COALESCE(product_key,'__all__'),topic_key);

CREATE TABLE IF NOT EXISTS public.growth_consent_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
 topic_id uuid NOT NULL REFERENCES public.growth_consent_topics(id) ON DELETE CASCADE,
 channel text,
 state text NOT NULL CHECK(state IN('granted','denied','withdrawn')),
 legal_basis text,
 source text NOT NULL,
 evidence_ref text,
 effective_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_consent_effective_idx ON public.growth_consent_records(tenant_id,person_id,topic_id,effective_at DESC);

CREATE TABLE IF NOT EXISTS public.growth_experiments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 hypothesis text NOT NULL,
 experiment_type text NOT NULL DEFAULT 'abn' CHECK(experiment_type IN('abn','bandit','holdout')),
 subject_type text NOT NULL DEFAULT 'person',
 goal_event text NOT NULL,
 revenue_metric text,
 guardrails jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','completed','cancelled')),
 starts_at timestamptz,
 ends_at timestamptz,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_variants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 experiment_id uuid NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
 variant_key text NOT NULL,
 name text NOT NULL,
 weight_bps integer NOT NULL DEFAULT 5000 CHECK(weight_bps BETWEEN 1 AND 10000),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 UNIQUE(experiment_id,variant_key)
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 experiment_id uuid NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
 variant_id uuid NOT NULL REFERENCES public.growth_experiment_variants(id) ON DELETE RESTRICT,
 subject_ref text NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(experiment_id,subject_ref)
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 experiment_id uuid NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
 variant_id uuid REFERENCES public.growth_experiment_variants(id) ON DELETE SET NULL,
 subject_ref text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN('exposure','conversion','guardrail','revenue','cost')),
 event_key text NOT NULL,
 amount_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.growth_attribution_touches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 source_kind text NOT NULL CHECK(source_kind IN('campaign','journey','sales_sequence','contact','referral','partner','organic','direct','other')),
 source_ref text,
 channel text,
 touch_type text NOT NULL DEFAULT 'touch' CHECK(touch_type IN('impression','click','message','call','meeting','touch','conversion')),
 revenue_minor bigint,
 profit_minor bigint,
 cost_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS growth_attribution_person_idx ON public.growth_attribution_touches(tenant_id,person_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.growth_referral_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 referrer_reward jsonb NOT NULL DEFAULT '{}'::jsonb,
 referee_reward jsonb NOT NULL DEFAULT '{}'::jsonb,
 qualifying_event text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','retired')),
 starts_at timestamptz,
 ends_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.growth_referrals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.growth_referral_programmes(id) ON DELETE CASCADE,
 referral_code text NOT NULL,
 referrer_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 referee_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 referee_ref text,
 status text NOT NULL DEFAULT 'invited' CHECK(status IN('invited','opened','registered','qualified','rewarded','rejected','expired')),
 qualified_at timestamptz,
 rewarded_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,referral_code)
);

CREATE TABLE IF NOT EXISTS public.growth_recovery_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 feedback_response_id uuid REFERENCES public.feedback_responses(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 staff_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 issue text NOT NULL,
 severity text NOT NULL DEFAULT 'normal' CHECK(severity IN('low','normal','high','critical')),
 recovery_action jsonb NOT NULL DEFAULT '{}'::jsonb,
 goodwill_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','contacted','offered','accepted','resolved','closed')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_runtime_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 runtime_kind text NOT NULL CHECK(runtime_kind IN('journey','sales_sequence','feedback')),
 enrolment_ref uuid,
 definition_ref uuid,
 node_or_step text,
 state text NOT NULL,
 outcome text,
 provider_ref text,
 input jsonb NOT NULL DEFAULT '{}'::jsonb,
 output jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 survey_id uuid NOT NULL REFERENCES public.feedback_surveys(id) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 subject_type text,
 subject_id text,
 channel text NOT NULL DEFAULT 'email',
 token_hash text NOT NULL UNIQUE,
 delivery_status text NOT NULL DEFAULT 'queued' CHECK(delivery_status IN('queued','sent','delivered','opened','responded','expired','failed')),
 expires_at timestamptz NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Billing, metering, consolidated invoices and settlement routing.
-- Landlord/platform admin activates subscriptions; tenants do not self-provision.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_plan_catalogue(
 plan_key text PRIMARY KEY,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 billing_interval text NOT NULL CHECK(billing_interval IN('monthly','annual','usage','one_time')),
 price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0),
 trial_days integer CHECK(trial_days IS NULL OR trial_days BETWEEN 0 AND 365),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_plan_services(
 plan_key text NOT NULL REFERENCES public.billing_plan_catalogue(plan_key) ON DELETE CASCADE,
 service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 included boolean NOT NULL DEFAULT true,
 limits jsonb NOT NULL DEFAULT '{}'::jsonb,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(plan_key,service_key)
);

CREATE TABLE IF NOT EXISTS public.billing_addon_catalogue(
 addon_key text PRIMARY KEY,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 name text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 billing_interval text NOT NULL CHECK(billing_interval IN('monthly','annual','usage','one_time')),
 price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0),
 included_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 plan_key text NOT NULL REFERENCES public.billing_plan_catalogue(plan_key) ON DELETE RESTRICT,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 provider_subscription_ref text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('trialing','active','past_due','paused','cancelled','ended')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 current_period_start timestamptz,
 current_period_end timestamptz,
 trial_ends_at timestamptz,
 cancel_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_subscription_one_live_uq
 ON public.billing_subscriptions(tenant_id,product_key)
 WHERE status IN('trialing','active','past_due','paused');

CREATE TABLE IF NOT EXISTS public.billing_addon_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 addon_key text NOT NULL REFERENCES public.billing_addon_catalogue(addon_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','cancelled','ended')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz,
 provider_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_addon_one_live_uq
 ON public.billing_addon_subscriptions(tenant_id,product_key,addon_key)
 WHERE status IN('active','paused');

CREATE TABLE IF NOT EXISTS public.billing_meter_rates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_key text REFERENCES public.billing_plan_catalogue(plan_key) ON DELETE CASCADE,
 addon_key text REFERENCES public.billing_addon_catalogue(addon_key) ON DELETE CASCADE,
 service_key text NOT NULL REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 metric_key text NOT NULL,
 included_quantity numeric NOT NULL DEFAULT 0,
 unit_size numeric NOT NULL DEFAULT 1 CHECK(unit_size>0),
 unit_price_minor bigint NOT NULL DEFAULT 0 CHECK(unit_price_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','retired')),
 CHECK(plan_key IS NOT NULL OR addon_key IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.billing_invoice_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','issued','paid','void')),
 subtotal_minor bigint NOT NULL DEFAULT 0,
 tax_minor bigint NOT NULL DEFAULT 0,
 total_minor bigint NOT NULL DEFAULT 0,
 provider_invoice_ref text,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>period_start)
);

CREATE TABLE IF NOT EXISTS public.billing_invoice_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 invoice_id uuid NOT NULL REFERENCES public.billing_invoice_runs(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,
 service_key text REFERENCES public.service_catalogue(service_key) ON DELETE SET NULL,
 line_type text NOT NULL CHECK(line_type IN('subscription','addon','usage','credit','adjustment')),
 description text NOT NULL,
 quantity numeric NOT NULL DEFAULT 1,
 unit_minor bigint NOT NULL DEFAULT 0,
 amount_minor bigint NOT NULL,
 source_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.billing_settlement_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 source_product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 source_service_key text REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 beneficiary_ref text NOT NULL,
 rule_type text NOT NULL CHECK(rule_type IN('fixed','percent','residual')),
 amount_minor bigint,
 percent_bps integer CHECK(percent_bps IS NULL OR percent_bps BETWEEN 0 AND 10000),
 priority integer NOT NULL DEFAULT 100,
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.billing_settlement_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 invoice_line_id uuid REFERENCES public.billing_invoice_lines(id) ON DELETE SET NULL,
 rule_id uuid REFERENCES public.billing_settlement_rules(id) ON DELETE SET NULL,
 beneficiary_ref text NOT NULL,
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'calculated' CHECK(status IN('calculated','approved','payable','paid','reversed')),
 payout_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Mobile/Universal Agent and deeper fleet/driver operations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mobile_app_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 profile_key text NOT NULL,
 name text NOT NULL,
 capabilities text[] NOT NULL DEFAULT '{}',
 branding jsonb NOT NULL DEFAULT '{}'::jsonb,
 offline_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 location_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,profile_key)
);

CREATE TABLE IF NOT EXISTS public.mobile_devices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 app_profile_id uuid REFERENCES public.mobile_app_profiles(id) ON DELETE SET NULL,
 platform text NOT NULL CHECK(platform IN('ios','android','web','desktop')),
 device_ref text NOT NULL,
 push_provider text,
 push_token_ref text,
 biometric_capable boolean NOT NULL DEFAULT false,
 passkey_capable boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked','lost','retired')),
 last_seen_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,device_ref)
);

CREATE TABLE IF NOT EXISTS public.mobile_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.mobile_devices(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','background','offline','ended','revoked')),
 started_at timestamptz NOT NULL DEFAULT now(),
 last_sync_at timestamptz,
 ended_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mobile_offline_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 device_id uuid REFERENCES public.mobile_devices(id) ON DELETE SET NULL,
 client_event_id text NOT NULL,
 event_type text NOT NULL,
 subject_type text,
 subject_id text,
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','projected','rejected','duplicate')),
 projection_ref text,
 UNIQUE(tenant_id,product_key,client_event_id)
);

CREATE TABLE IF NOT EXISTS public.mobile_sync_state(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.mobile_devices(id) ON DELETE CASCADE,
 cursor text,
 last_pull_at timestamptz,
 last_push_at timestamptz,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,device_id)
);

CREATE TABLE IF NOT EXISTS public.dispatch_shifts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 planned_status text NOT NULL DEFAULT 'scheduled' CHECK(planned_status IN('scheduled','confirmed','cancelled','completed','no_show')),
 zone_ref text,
 capacity numeric,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK(ends_at>starts_at)
);

CREATE TABLE IF NOT EXISTS public.dispatch_attendance(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 shift_id uuid REFERENCES public.dispatch_shifts(id) ON DELETE SET NULL,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN('clock_in','clock_out','break_start','break_end','no_show','override')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 latitude double precision,
 longitude double precision,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_wallet_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 entry_type text NOT NULL CHECK(entry_type IN('earning','bonus','tip','adjustment','deduction','payout','reversal')),
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 source_ref text,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN('pending','posted','paid','reversed')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_earnings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
 base_minor bigint NOT NULL DEFAULT 0,
 distance_minor bigint NOT NULL DEFAULT 0,
 time_minor bigint NOT NULL DEFAULT 0,
 tip_minor bigint NOT NULL DEFAULT 0,
 bonus_minor bigint NOT NULL DEFAULT 0,
 deductions_minor bigint NOT NULL DEFAULT 0,
 total_minor bigint NOT NULL DEFAULT 0,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'calculated' CHECK(status IN('calculated','approved','posted','paid','reversed')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_vehicle_maintenance(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.dispatch_vehicles(id) ON DELETE CASCADE,
 maintenance_type text NOT NULL,
 due_at timestamptz,
 odometer_due numeric,
 status text NOT NULL DEFAULT 'due' CHECK(status IN('due','scheduled','in_progress','completed','waived','overdue')),
 cost_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_behaviour(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
 event_type text NOT NULL,
 severity text NOT NULL DEFAULT 'info' CHECK(severity IN('info','warning','high','critical')),
 score_delta numeric NOT NULL DEFAULT 0,
 latitude double precision,
 longitude double precision,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.dispatch_idle_periods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz,
 reason text,
 latitude double precision,
 longitude double precision,
 CHECK(ends_at IS NULL OR ends_at>=starts_at)
);

CREATE TABLE IF NOT EXISTS public.dispatch_geofences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 geofence_type text NOT NULL DEFAULT 'circle' CHECK(geofence_type IN('circle','polygon','zone')),
 geometry jsonb NOT NULL,
 purpose text,
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Decision intelligence and QITT-style advisory delivery.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.decision_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 case_key text NOT NULL,
 title text NOT NULL,
 question text NOT NULL,
 domain text NOT NULL,
 client_ref text,
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','analysis','review','approved','implemented','outcome_review','closed','cancelled')),
 assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,case_key)
);

CREATE TABLE IF NOT EXISTS public.decision_options(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 case_id uuid NOT NULL REFERENCES public.decision_cases(id) ON DELETE CASCADE,
 option_key text NOT NULL,
 name text NOT NULL,
 description text,
 pros jsonb NOT NULL DEFAULT '[]'::jsonb,
 cons jsonb NOT NULL DEFAULT '[]'::jsonb,
 assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 expected_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb,
 score numeric,
 model_ref text,
 status text NOT NULL DEFAULT 'candidate' CHECK(status IN('candidate','shortlisted','selected','rejected')),
 UNIQUE(case_id,option_key)
);

CREATE TABLE IF NOT EXISTS public.decision_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 case_id uuid NOT NULL REFERENCES public.decision_cases(id) ON DELETE CASCADE,
 option_id uuid REFERENCES public.decision_options(id) ON DELETE CASCADE,
 evidence_ref text NOT NULL,
 stance text NOT NULL DEFAULT 'context' CHECK(stance IN('supports','opposes','context','uncertain')),
 weight numeric NOT NULL DEFAULT 1,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.decision_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 case_id uuid NOT NULL REFERENCES public.decision_cases(id) ON DELETE CASCADE,
 selected_option_id uuid REFERENCES public.decision_options(id) ON DELETE SET NULL,
 rationale text NOT NULL,
 opposing_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 remaining_unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,
 expected_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb,
 decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 decided_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz,
 version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.decision_outcomes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 decision_id uuid NOT NULL REFERENCES public.decision_records(id) ON DELETE CASCADE,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 outcome jsonb NOT NULL,
 expected_vs_actual jsonb NOT NULL DEFAULT '{}'::jsonb,
 success_score numeric,
 failure_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
 reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.decision_lessons(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 domain text NOT NULL,
 lesson text NOT NULL,
 trigger_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
 source_outcome_id uuid REFERENCES public.decision_outcomes(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','rejected','retired')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.decision_model_candidates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 candidate_key text NOT NULL,
 domain text NOT NULL,
 provider_key text,
 model_id text NOT NULL,
 training_cutoff date NOT NULL,
 evaluation_start date NOT NULL,
 evaluation_end date NOT NULL,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'candidate' CHECK(status IN('candidate','challenger','champion','rejected','retired')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(evaluation_start>training_cutoff),
 CHECK(evaluation_end>=evaluation_start),
 UNIQUE(tenant_id,candidate_key)
);

CREATE TABLE IF NOT EXISTS public.decision_model_evaluations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 candidate_id uuid NOT NULL REFERENCES public.decision_model_candidates(id) ON DELETE CASCADE,
 dataset_ref text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 metrics jsonb NOT NULL,
 baseline_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 future_data_check text NOT NULL DEFAULT 'passed' CHECK(future_data_check IN('passed','failed','manual_review')),
 reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>=period_start)
);

CREATE TABLE IF NOT EXISTS public.advisory_templates(
 template_key text PRIMARY KEY,
 name text NOT NULL,
 framework text NOT NULL DEFAULT 'QITT-style',
 description text NOT NULL,
 sections jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','retired')),
 version integer NOT NULL DEFAULT 1,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.advisory_engagements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 template_key text REFERENCES public.advisory_templates(template_key) ON DELETE SET NULL,
 client_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 client_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 title text NOT NULL,
 adviser_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 delivery_team uuid[] NOT NULL DEFAULT '{}',
 branding jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'discovery' CHECK(status IN('discovery','analysis','scenario','review','delivery','complete','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisory_diagnostics(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.advisory_engagements(id) ON DELETE CASCADE,
 section_key text NOT NULL,
 question_key text NOT NULL,
 response jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 confidence numeric CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(engagement_id,section_key,question_key)
);

CREATE TABLE IF NOT EXISTS public.advisory_scenarios(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.advisory_engagements(id) ON DELETE CASCADE,
 decision_case_id uuid REFERENCES public.decision_cases(id) ON DELETE SET NULL,
 name text NOT NULL,
 assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 costs jsonb NOT NULL DEFAULT '{}'::jsonb,
 benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
 risks jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisory_meeting_briefs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.advisory_engagements(id) ON DELETE CASCADE,
 meeting_at timestamptz,
 title text NOT NULL,
 brief jsonb NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','used')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisory_followups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.advisory_engagements(id) ON DELETE CASCADE,
 channel text NOT NULL DEFAULT 'email' CHECK(channel IN('email','whatsapp','sms','task','document')),
 recipient_ref text,
 subject text,
 body text NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','sent','cancelled')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.advisory_templates(template_key,name,framework,description,sections,status,version) VALUES
 ('qitt-business-diagnostic','QITT-style Business Diagnostic','QITT-style',
  'Reusable evidence-led diagnostic for technology, information, teams, operating model, objectives, costs, dependencies, risks and target state.',
  '[{"key":"business","name":"Business and objectives"},{"key":"technology","name":"Technology and systems"},{"key":"information","name":"Information and data"},{"key":"teams","name":"People and organisation"},{"key":"process","name":"Process and operating model"},{"key":"costs","name":"Costs and recurring costs"},{"key":"risk","name":"Risks, controls and dependencies"},{"key":"target","name":"Target state and roadmap"}]'::jsonb,
  'active',1)
ON CONFLICT(template_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,sections=EXCLUDED.sections,status='active',version=EXCLUDED.version;

-- ---------------------------------------------------------------------------
-- Tax scenario framework. Rules are versioned/configured; no tax rate is
-- fabricated by this migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_rule_packs(
 pack_key text PRIMARY KEY,
 jurisdiction text NOT NULL,
 tax_type text NOT NULL,
 name text NOT NULL,
 version text NOT NULL,
 effective_from date,
 effective_until date,
 rules jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_ids uuid[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'framework' CHECK(status IN('draft','framework','review','active','retired')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from)
);

CREATE TABLE IF NOT EXISTS public.tax_relief_catalogue(
 relief_key text PRIMARY KEY,
 jurisdiction text NOT NULL,
 name text NOT NULL,
 relief_family text NOT NULL,
 source_ids uuid[] NOT NULL DEFAULT '{}',
 eligibility_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
 calculation_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'framework' CHECK(status IN('framework','review','active','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.tax_scenario_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 jurisdiction text NOT NULL,
 tax_type text NOT NULL,
 period_key text NOT NULL,
 pack_key text REFERENCES public.tax_rule_packs(pack_key) ON DELETE SET NULL,
 inputs jsonb NOT NULL,
 assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 missing_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','calculated','review','approved','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tax_rule_packs(pack_key,jurisdiction,tax_type,name,version,status,metadata) VALUES
 ('gb-core-framework','GB','multi','United Kingdom tax scenario framework','1','framework','{"requiresAuthoritySources":true,"ratesIncluded":false}'::jsonb),
 ('us-core-framework','US','multi','United States tax scenario framework','1','framework','{"requiresAuthoritySources":true,"ratesIncluded":false,"scope":"federal-plus-configurable-state"}'::jsonb),
 ('de-core-framework','DE','multi','Germany tax scenario framework','1','framework','{"requiresAuthoritySources":true,"ratesIncluded":false}'::jsonb)
ON CONFLICT(pack_key) DO NOTHING;

INSERT INTO public.tax_relief_catalogue(relief_key,jurisdiction,name,relief_family,status,metadata) VALUES
 ('gb-research-development','GB','Research & development relief framework','research_development','framework','{"ratesIncluded":false}'::jsonb),
 ('us-research-development','US','Research & development credit framework','research_development','framework','{"ratesIncluded":false}'::jsonb),
 ('de-research-development','DE','Research & development incentive framework','research_development','framework','{"ratesIncluded":false}'::jsonb)
ON CONFLICT(relief_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Localisation, white-label embeds, agent catalogue and scheduled reports.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_translation_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 service_key text REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 locale text NOT NULL REFERENCES public.locale_packs(locale) ON DELETE CASCADE,
 translation_key text NOT NULL,
 value text NOT NULL,
 status text NOT NULL DEFAULT 'approved' CHECK(status IN('draft','review','approved','retired')),
 source text NOT NULL DEFAULT 'human' CHECK(source IN('human','ai_draft','import','system')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_translation_scope_uq
 ON public.platform_translation_entries(COALESCE(product_key,'__all__'),COALESCE(service_key,'__all__'),locale,translation_key);

CREATE TABLE IF NOT EXISTS public.tenant_translation_overrides(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 locale text NOT NULL REFERENCES public.locale_packs(locale) ON DELETE CASCADE,
 translation_key text NOT NULL,
 value text NOT NULL,
 status text NOT NULL DEFAULT 'approved' CHECK(status IN('draft','review','approved','retired')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,locale,translation_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_translation_scope_uq
 ON public.tenant_translation_overrides(tenant_id,COALESCE(product_key,'__all__'),locale,translation_key);

CREATE TABLE IF NOT EXISTS public.embedded_surfaces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 surface_key text NOT NULL,
 surface_type text NOT NULL CHECK(surface_type IN('widget','portal','checkout','tracking','chat','knowledge','form','dashboard')),
 name text NOT NULL,
 allowed_origins text[] NOT NULL DEFAULT '{}',
 theme jsonb NOT NULL DEFAULT '{}'::jsonb,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,surface_key)
);

CREATE TABLE IF NOT EXISTS public.embedded_surface_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 surface_id uuid NOT NULL REFERENCES public.embedded_surfaces(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 token_suffix text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked','expired')),
 expires_at timestamptz,
 last_used_at timestamptz,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_agent_template_catalogue(
 template_key text PRIMARY KEY,
 family text NOT NULL,
 name text NOT NULL,
 purpose text NOT NULL,
 default_profile text NOT NULL,
 default_tools text[] NOT NULL DEFAULT '{}',
 data_classes text[] NOT NULL DEFAULT '{}',
 industry_pack text,
 human_review_required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.tenant_agent_templates(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 template_key text NOT NULL REFERENCES public.ai_agent_template_catalogue(template_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN('enabled','paused','disabled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,template_key)
);

INSERT INTO public.ai_agent_template_catalogue(template_key,family,name,purpose,default_profile,default_tools,industry_pack) VALUES
 ('contact-voice','customer_service','Voice Customer Service','Answer routine voice enquiries with evidence and escalate when needed.','operations',ARRAY['evidence.search','crm.read','task.propose'],NULL),
 ('contact-chat','customer_service','Chat Customer Service','Handle web/WhatsApp chat with evidence and human handover.','operations',ARRAY['evidence.search','crm.read','task.propose'],NULL),
 ('contact-triage','customer_service','Contact Triage','Classify intent, urgency and route to an allowed queue/action.','operations',ARRAY['crm.read','task.propose'],NULL),
 ('ai-receptionist','customer_service','AI Receptionist','Front-door reception, caller recognition and controlled action proposals.','operations',ARRAY['evidence.search','crm.read','task.propose'],NULL),
 ('callback-coordinator','customer_service','Callback Coordinator','Prepare and prioritise callbacks including same-agent preference.','operations',ARRAY['crm.read','task.propose'],NULL),
 ('sales-prospecting','sales','Sales Prospecting','Research and prioritise prospects with evidence.','product',ARRAY['crm.read','evidence.search','task.propose'],NULL),
 ('sales-qualification','sales','Sales Qualification','Qualify leads against explicit criteria and uncertainties.','product',ARRAY['crm.read','evidence.search','task.propose'],NULL),
 ('sales-followup','sales','Sales Follow-up','Draft reviewed follow-up actions across approved channels.','product',ARRAY['crm.read','task.propose'],NULL),
 ('proposal-drafter','sales','Proposal Drafter','Draft evidence-backed proposals/quotes for human review.','product',ARRAY['crm.read','documents.read','task.propose'],NULL),
 ('account-manager','sales','Account Manager','Summarise account health, next actions and cross-sell candidates.','product',ARRAY['crm.read','evidence.search','task.propose'],NULL),
 ('campaign-planner','marketing','Campaign Planner','Plan campaigns, audience, goals and measurement.','product',ARRAY['crm.read','analytics.read','task.propose'],NULL),
 ('content-assistant','marketing','Content Assistant','Draft controlled marketing content from approved evidence.','product',ARRAY['evidence.search','task.propose'],NULL),
 ('seo-assistant','marketing','SEO Assistant','Identify SEO content opportunities without publishing automatically.','product',ARRAY['evidence.search','analytics.read','task.propose'],NULL),
 ('review-recovery','marketing','Review Recovery','Triage negative feedback and propose recovery.','operations',ARRAY['crm.read','analytics.read','task.propose'],NULL),
 ('journey-optimizer','marketing','Journey Optimizer','Review journey outcomes and propose controlled improvements.','product',ARRAY['analytics.read','task.propose'],NULL),
 ('bookkeeping','finance','Bookkeeping Assistant','Propose classifications and exceptions for accounting review.','accounting',ARRAY['documents.read','accounting.propose'],NULL),
 ('reconciliation','finance','Reconciliation Assistant','Compare records and surface unmatched/contradictory items.','finance',ARRAY['evidence.search','finance.report','task.propose'],NULL),
 ('management-reporting','finance','Management Reporting','Prepare management reporting drafts from reviewed financial records.','finance',ARRAY['finance.report','evidence.search'],NULL),
 ('cashflow','finance','Cash-flow Analyst','Review cash-flow inputs and assumptions.','finance',ARRAY['finance.report','task.propose'],NULL),
 ('variance','finance','Variance Analyst','Explain budget/forecast/actual variances from deterministic reports.','finance',ARRAY['finance.report','evidence.search'],NULL),
 ('accounts-prep','finance','Accounts Preparation','Propose accounts-preparation adjustments for independent review.','accounting',ARRAY['accounting.propose','documents.read'],NULL),
 ('tax-research','finance','Tax Research','Research authority-backed tax positions and missing facts.','tax',ARRAY['evidence.search','tax.sources.read','tax.propose'],NULL),
 ('payroll-review','finance','Payroll Review','Review payroll inputs/exceptions without submitting payroll.','finance',ARRAY['records.read','task.propose'],NULL),
 ('operations-planner','operations','Operations Planner','Review operational demand, capacity and dependencies.','operations',ARRAY['analytics.read','task.propose'],NULL),
 ('rota-assistant','operations','Rota Assistant','Propose staffing/rota changes from explicit availability/capacity.','operations',ARRAY['records.read','task.propose'],NULL),
 ('inventory-assistant','operations','Inventory Assistant','Surface stock, expiry, waste and replenishment risks.','operations',ARRAY['analytics.read','task.propose'],NULL),
 ('supplier-assistant','operations','Supplier Assistant','Review suppliers, exceptions and operational dependencies.','operations',ARRAY['evidence.search','task.propose'],NULL),
 ('dispatch-assistant','operations','Dispatch Assistant','Propose dispatch/route actions within approved constraints.','operations',ARRAY['records.read','task.propose'],NULL),
 ('compliance-reviewer','compliance','Compliance Reviewer','Identify evidence/control gaps without certifying compliance.','compliance',ARRAY['evidence.search','compliance.report','task.propose'],NULL),
 ('procurement-readiness','compliance','Procurement Readiness','Review supplier/procurement evidence and readiness gaps.','compliance',ARRAY['evidence.search','task.propose'],NULL),
 ('audit-assistant','compliance','Audit Assistant','Prepare evidence-linked audit findings and unanswered questions.','discovery',ARRAY['evidence.search','records.read','task.propose'],NULL),
 ('m-and-a','transaction','M&A Specialist','Review transaction scope, diligence, costs, synergies and assumptions.','transaction',ARRAY['evidence.search','transaction.report','task.propose'],NULL),
 ('carve-out','transaction','Carve-out Specialist','Review separation, TSA, Day-1 and dependency evidence.','transaction',ARRAY['evidence.search','transaction.report','task.propose'],NULL),
 ('automotive','industry','Automotive Intelligence','Vehicle/auction/parts intelligence proposals with evidence.','technical',ARRAY['evidence.search','records.read','task.propose'],'automotive'),
 ('childcare','industry','Childcare Operations','Support parent/provider operations with compliance boundaries.','operations',ARRAY['records.read','task.propose'],'childcare'),
 ('marketplace','industry','Marketplace Operations','Review vendor/listing/matching/trust operations.','operations',ARRAY['records.read','analytics.read','task.propose'],'marketplace'),
 ('financial-adviser','advisory','Financial Adviser Assistant','Prepare portfolio observations, meeting briefs and follow-up drafts without personalised autonomous decisions.','finance',ARRAY['evidence.search','finance.report','task.propose'],'advisory'),
 ('decision-reviewer','advisory','Decision Reviewer','Compare assumptions, opposing evidence, outcomes, failure patterns and approved lessons.','discovery',ARRAY['evidence.search','records.read','task.propose'],'advisory')
ON CONFLICT(template_key) DO UPDATE SET
 family=EXCLUDED.family,name=EXCLUDED.name,purpose=EXCLUDED.purpose,
 default_profile=EXCLUDED.default_profile,default_tools=EXCLUDED.default_tools,
 industry_pack=EXCLUDED.industry_pack,status='active';

CREATE TABLE IF NOT EXISTS public.report_schedules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 report_key text NOT NULL,
 rrule text NOT NULL,
 timezone text NOT NULL DEFAULT 'Europe/London',
 recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
 parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
 approval_required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
 next_run_at timestamptz,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 schedule_id uuid REFERENCES public.report_schedules(id) ON DELETE SET NULL,
 report_key text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','review','approved','delivered','failed','cancelled')),
 input_version text,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 output_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 delivered_at timestamptz,
 error text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_sinks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text,
 sink_type text NOT NULL CHECK(sink_type IN('warehouse','lake','bi','webhook','file_export')),
 name text NOT NULL,
 mode text NOT NULL DEFAULT 'batch' CHECK(mode IN('batch','stream')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 cursor text,
 status text NOT NULL DEFAULT 'configured' CHECK(status IN('configured','active','degraded','paused','failed')),
 last_sync_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Telecom orchestration for Veyumo/Zoryn-style mobile add-ons.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telecom_plan_catalogue(
 plan_key text PRIMARY KEY,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 country_code text NOT NULL,
 name text NOT NULL,
 plan_type text NOT NULL DEFAULT 'mobile' CHECK(plan_type IN('mobile','data','voice','iot')),
 allowances jsonb NOT NULL DEFAULT '{}'::jsonb,
 recurring_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'preview' CHECK(status IN('preview','active','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.telecom_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 employer_ref text,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_line_ref text,
 msisdn text,
 plan_key text REFERENCES public.telecom_plan_catalogue(plan_key) ON DELETE SET NULL,
 line_type text NOT NULL DEFAULT 'consumer' CHECK(line_type IN('consumer','staff','business','data')),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','provisioning','active','suspended','porting','cancelled','failed')),
 activated_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telecom_sims(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 line_id uuid NOT NULL REFERENCES public.telecom_lines(id) ON DELETE CASCADE,
 sim_type text NOT NULL CHECK(sim_type IN('physical','esim')),
 external_sim_ref text,
 iccid_masked text,
 esim_activation_ref text,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','allocated','active','suspended','retired','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telecom_porting_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 line_id uuid REFERENCES public.telecom_lines(id) ON DELETE SET NULL,
 number_to_port text NOT NULL,
 losing_provider text,
 requested_date date,
 scheduled_date date,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','accepted','scheduled','completed','rejected','cancelled')),
 provider_ref text,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telecom_usage_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 line_id uuid NOT NULL REFERENCES public.telecom_lines(id) ON DELETE CASCADE,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 voice_seconds bigint NOT NULL DEFAULT 0,
 sms_count bigint NOT NULL DEFAULT 0,
 data_bytes bigint NOT NULL DEFAULT 0,
 roaming jsonb NOT NULL DEFAULT '{}'::jsonb,
 source_ref text,
 captured_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>period_start)
);

-- ---------------------------------------------------------------------------
-- Security/RLS.
-- ---------------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'contact_centres','contact_numbers','contact_queues','contact_agent_profiles','contact_queue_members',
  'contact_interactions','contact_interaction_legs','contact_transcript_segments','contact_callbacks',
  'contact_agent_affinity','contact_tracking_attribution','contact_masking_sessions',
  'growth_consent_topics','growth_consent_records','growth_experiments','growth_experiment_variants',
  'growth_experiment_assignments','growth_experiment_events','growth_attribution_touches',
  'growth_referral_programmes','growth_referrals','growth_recovery_cases','growth_runtime_events','feedback_requests',
  'billing_subscriptions','billing_addon_subscriptions','billing_invoice_runs','billing_invoice_lines',
  'billing_settlement_rules','billing_settlement_entries',
  'mobile_app_profiles','mobile_devices','mobile_sessions','mobile_offline_events','mobile_sync_state',
  'dispatch_shifts','dispatch_attendance','dispatch_agent_wallet_entries','dispatch_agent_earnings',
  'dispatch_vehicle_maintenance','dispatch_agent_behaviour','dispatch_idle_periods','dispatch_geofences',
  'decision_cases','decision_options','decision_evidence','decision_records','decision_outcomes','decision_lessons',
  'decision_model_candidates','decision_model_evaluations',
  'advisory_engagements','advisory_diagnostics','advisory_scenarios','advisory_meeting_briefs','advisory_followups',
  'tax_scenario_runs','tenant_translation_overrides','embedded_surfaces','embedded_surface_tokens',
  'tenant_agent_templates','report_schedules','report_runs','analytics_sinks',
  'telecom_lines','telecom_sims','telecom_porting_orders','telecom_usage_snapshots'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
   'reconcile tenant read '||t,t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
   'reconcile tenant write '||t,t);
 END LOOP;
END $$;

-- Highly sensitive phone mappings are service-role only.
ALTER TABLE public.contact_masking_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_masking_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_masking_numbers,public.contact_masking_participants FROM anon,authenticated;
GRANT ALL ON public.contact_masking_numbers,public.contact_masking_participants TO service_role;

-- Global catalogues: authenticated users can read active/reviewed records;
-- platform admins maintain them.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'billing_plan_catalogue','billing_plan_services','billing_addon_catalogue','billing_meter_rates',
  'advisory_templates','tax_rule_packs','tax_relief_catalogue','platform_translation_entries',
  'ai_agent_template_catalogue','telecom_plan_catalogue'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(true)',
   'reconcile catalogue read '||t,t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()))',
   'reconcile catalogue admin '||t,t);
 END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS contact_interactions_scope_idx ON public.contact_interactions(tenant_id,product_key,status,started_at DESC);
CREATE INDEX IF NOT EXISTS contact_callbacks_due_idx ON public.contact_callbacks(tenant_id,status,due_at);
CREATE INDEX IF NOT EXISTS contact_agent_status_idx ON public.contact_agent_profiles(tenant_id,product_key,status);
CREATE INDEX IF NOT EXISTS growth_experiment_status_idx ON public.growth_experiments(tenant_id,product_key,status);
CREATE INDEX IF NOT EXISTS billing_subscription_scope_idx ON public.billing_subscriptions(tenant_id,product_key,status);
CREATE INDEX IF NOT EXISTS mobile_offline_queue_idx ON public.mobile_offline_events(tenant_id,product_key,status,received_at);
CREATE INDEX IF NOT EXISTS dispatch_shift_agent_idx ON public.dispatch_shifts(tenant_id,agent_id,starts_at);
CREATE INDEX IF NOT EXISTS decision_case_status_idx ON public.decision_cases(tenant_id,domain,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS telecom_line_scope_idx ON public.telecom_lines(tenant_id,status,updated_at DESC);

-- ---------------------------------------------------------------------------
-- Deterministic helpers / control gates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contact_route_candidate(
 _tenant uuid,_product text,_queue uuid,_person uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE a record;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Contact-centre access denied';
 END IF;
 SELECT ap.id,ap.user_id,ap.display_name,ap.extension,
        CASE WHEN aff.agent_id IS NOT NULL THEN true ELSE false END AS preferred
 INTO a
 FROM public.contact_agent_profiles ap
 JOIN public.contact_queue_members qm ON qm.agent_id=ap.id AND qm.queue_id=_queue
 LEFT JOIN public.contact_agent_affinity aff
   ON aff.tenant_id=_tenant AND aff.product_key=_product AND aff.person_id=_person AND aff.agent_id=ap.id
 WHERE ap.tenant_id=_tenant AND ap.product_key=_product AND ap.status='available'
 ORDER BY CASE WHEN aff.agent_id IS NOT NULL THEN 0 ELSE 1 END,
          COALESCE(aff.score,0) DESC,qm.priority,ap.updated_at
 LIMIT 1;
 IF a.id IS NULL THEN RETURN jsonb_build_object('available',false); END IF;
 RETURN jsonb_build_object(
  'available',true,'agentId',a.id,'userId',a.user_id,'displayName',a.display_name,
  'extension',a.extension,'preferred',a.preferred
 );
END $$;
REVOKE ALL ON FUNCTION public.contact_route_candidate(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contact_route_candidate(uuid,text,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.contact_centre_metrics(
 _tenant uuid,_product text,_from timestamptz,_to timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE total_count integer;ai_resolved_count integer;abandoned_count integer;avg_wait numeric;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Contact-centre access denied';
 END IF;
 SELECT count(*)::integer,
        count(*) FILTER(WHERE ai_resolved)::integer,
        count(*) FILTER(WHERE status='abandoned')::integer,
        avg(EXTRACT(EPOCH FROM (answered_at-queued_at))) FILTER(WHERE answered_at IS NOT NULL AND queued_at IS NOT NULL)
 INTO total_count,ai_resolved_count,abandoned_count,avg_wait
 FROM public.contact_interactions
 WHERE tenant_id=_tenant AND product_key=_product AND started_at>=_from AND started_at<_to;
 RETURN jsonb_build_object(
  'total',total_count,'aiResolved',ai_resolved_count,
  'aiResolutionRate',CASE WHEN total_count=0 THEN 0 ELSE round(ai_resolved_count*100.0/total_count,2) END,
  'abandoned',abandoned_count,'averageWaitSeconds',COALESCE(round(avg_wait,2),0)
 );
END $$;
REVOKE ALL ON FUNCTION public.contact_centre_metrics(uuid,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contact_centre_metrics(uuid,text,timestamptz,timestamptz) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.growth_consent_allowed(
 _tenant uuid,_person uuid,_topic uuid,_channel text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT COALESCE((
  SELECT state='granted'
  FROM public.growth_consent_records
  WHERE tenant_id=_tenant AND person_id=_person AND topic_id=_topic
    AND (_channel IS NULL OR channel IS NULL OR channel=_channel)
    AND effective_at<=now() AND (expires_at IS NULL OR expires_at>now())
  ORDER BY effective_at DESC,created_at DESC
  LIMIT 1
 ),false)
$$;
REVOKE ALL ON FUNCTION public.growth_consent_allowed(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_consent_allowed(uuid,uuid,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.growth_assign_variant(
 _tenant uuid,_experiment uuid,_subject text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE existing uuid;total_weight integer;bucket bigint;cursor integer:=0;v record;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Growth access denied';
 END IF;
 SELECT variant_id INTO existing FROM public.growth_experiment_assignments
 WHERE experiment_id=_experiment AND subject_ref=_subject;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.growth_experiments WHERE id=_experiment AND tenant_id=_tenant AND status='active') THEN
  RAISE EXCEPTION 'Active experiment required';
 END IF;
 SELECT sum(weight_bps)::integer INTO total_weight FROM public.growth_experiment_variants
 WHERE experiment_id=_experiment AND active;
 IF COALESCE(total_weight,0)<=0 THEN RAISE EXCEPTION 'Experiment variants missing'; END IF;
 bucket:=(('x'||substr(md5(_experiment::text||':'||_subject),1,8))::bit(32)::bigint % total_weight);
 FOR v IN SELECT id,weight_bps FROM public.growth_experiment_variants
          WHERE experiment_id=_experiment AND active ORDER BY variant_key LOOP
  cursor:=cursor+v.weight_bps;
  IF bucket<cursor THEN
   INSERT INTO public.growth_experiment_assignments(tenant_id,experiment_id,variant_id,subject_ref)
   VALUES(_tenant,_experiment,v.id,_subject) RETURNING variant_id INTO existing;
   RETURN existing;
  END IF;
 END LOOP;
 RAISE EXCEPTION 'Variant assignment failed';
END $$;
REVOKE ALL ON FUNCTION public.growth_assign_variant(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_assign_variant(uuid,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.billing_activate_subscription(
 _tenant uuid,_product text,_plan text,_provider text DEFAULT NULL,_provider_ref text DEFAULT NULL,_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE sid uuid;svc record;
BEGIN
 IF _actor IS NULL OR NOT public.is_platform_admin(_actor) THEN
  RAISE EXCEPTION 'Platform administrator required';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.billing_plan_catalogue
  WHERE plan_key=_plan AND product_key=_product AND status='active'
 ) THEN RAISE EXCEPTION 'Active billing plan not found'; END IF;
 INSERT INTO public.billing_subscriptions(
  tenant_id,product_key,plan_key,provider_key,provider_subscription_ref,status,current_period_start
 ) VALUES(_tenant,_product,_plan,_provider,_provider_ref,'active',now())
 ON CONFLICT(tenant_id,product_key) WHERE status IN('trialing','active','past_due','paused')
 DO UPDATE SET plan_key=EXCLUDED.plan_key,provider_key=EXCLUDED.provider_key,
  provider_subscription_ref=EXCLUDED.provider_subscription_ref,status='active',updated_at=now()
 RETURNING id INTO sid;
 FOR svc IN SELECT * FROM public.billing_plan_services WHERE plan_key=_plan AND included LOOP
  INSERT INTO public.tenant_services(tenant_id,service_key,status,source,valid_from,config)
  VALUES(_tenant,svc.service_key,'active','billing',now(),jsonb_build_object('planKey',_plan,'limits',svc.limits,'config',svc.config))
  ON CONFLICT(tenant_id,service_key) DO UPDATE SET
   status='active',source='billing',config=EXCLUDED.config,updated_at=now();
 END LOOP;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.billing_activate_subscription(uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_activate_subscription(uuid,text,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.decision_promote_model_candidate(_candidate uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE c public.decision_model_candidates%rowtype;bad integer;evals integer;
BEGIN
 SELECT * INTO c FROM public.decision_model_candidates WHERE id=_candidate FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Model candidate not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(c.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Decision model approval denied';
 END IF;
 SELECT count(*) FILTER(WHERE future_data_check<>'passed'),count(*) INTO bad,evals
 FROM public.decision_model_evaluations WHERE candidate_id=_candidate;
 IF evals=0 OR bad>0 THEN RAISE EXCEPTION 'Clean out-of-sample evaluation required'; END IF;
 UPDATE public.decision_model_candidates
 SET status='challenger',approved_by=auth.uid(),approved_at=now()
 WHERE tenant_id=c.tenant_id AND domain=c.domain AND status='candidate' AND id=_candidate;
END $$;
REVOKE ALL ON FUNCTION public.decision_promote_model_candidate(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decision_promote_model_candidate(uuid) TO authenticated,service_role;

COMMIT;
