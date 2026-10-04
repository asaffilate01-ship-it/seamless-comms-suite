BEGIN;

-- Omniqora v4 shared engagement/runtime completion.
-- Consolidates recurring cross-product requirements from the portfolio:
-- contact-centre operations, call masking, multimodal analysis, mobile/push/location,
-- sales proposals/signatures, cross-sell and reviewed AI learning.

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.contact','Omniqora Contact','AI/human contact-centre sessions, supervisor takeover, callbacks, recordings, transcripts and SLA controls.','communications','omniqora',true,'automatic','active'),
('omniqora.media-intelligence','Media Intelligence','Review-gated image, PDF, audio and video analysis jobs with evidence and model traces.','ai','omniqora',true,'automatic','active'),
('omniqora.mobile','Mobile Runtime','Device registration, push endpoints and permissioned background-location event ingestion.','platform','omniqora',true,'automatic','active'),
('omniqora.sales-engagement','Sales Engagement','Prospect intelligence, proposals, approvals and signature workflow shared across products.','growth','omniqora',true,'automatic','active'),
('omniqora.decision-learning','Decision Learning','Outcome reviews, reviewed lessons and candidate-model evaluation without automatic rule changes.','ai','omniqora',true,'automatic','active')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.contact','omniqora.connect'),
('omniqora.contact','omniqora.crm'),
('omniqora.contact','omniqora.ai'),
('omniqora.media-intelligence','omniqora.ai'),
('omniqora.media-intelligence','omniqora.documents'),
('omniqora.mobile','omniqora.identity'),
('omniqora.sales-engagement','omniqora.crm'),
('omniqora.sales-engagement','omniqora.connect'),
('omniqora.sales-engagement','omniqora.documents'),
('omniqora.decision-learning','omniqora.ai-governance')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.contact_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN('voice','whatsapp','sms','email','video','webchat','other')),
 direction text NOT NULL CHECK(direction IN('inbound','outbound')),
 external_ref text,
 communication_identity_id uuid REFERENCES public.communication_identities(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 case_id uuid,
 subject_type text,
 subject_id text,
 ai_enabled boolean NOT NULL DEFAULT true,
 ai_profile text,
 language text,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN('queued','active_ai','active_human','on_hold','callback_pending','completed','abandoned','failed')),
 started_at timestamptz,
 answered_at timestamptz,
 ended_at timestamptz,
 sla_target_seconds integer CHECK(sla_target_seconds IS NULL OR sla_target_seconds>=0),
 resolution_code text,
 summary text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_sessions_queue_idx ON public.contact_sessions(tenant_id,status,priority,created_at);

CREATE TABLE IF NOT EXISTS public.contact_session_participants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.contact_sessions(id) ON DELETE CASCADE,
 participant_type text NOT NULL CHECK(participant_type IN('customer','ai','agent','supervisor','third_party')),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 external_ref text,
 joined_at timestamptz NOT NULL DEFAULT now(),
 left_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.contact_escalations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.contact_sessions(id) ON DELETE CASCADE,
 escalation_type text NOT NULL
   CHECK(escalation_type IN('warm_transfer','supervisor_takeover','failed_verification','complaint','priority','payment','safety','other')),
 reason text NOT NULL,
 requested_by text NOT NULL,
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'requested'
   CHECK(status IN('requested','accepted','declined','completed','cancelled')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz,
 completed_at timestamptz,
 outcome jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.contact_callbacks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 session_id uuid REFERENCES public.contact_sessions(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 channel text NOT NULL DEFAULT 'voice',
 destination text NOT NULL,
 scheduled_for timestamptz NOT NULL,
 timezone text,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 status text NOT NULL DEFAULT 'scheduled'
   CHECK(status IN('scheduled','queued','attempting','completed','failed','cancelled','no_answer')),
 attempts integer NOT NULL DEFAULT 0,
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_callbacks_due_idx ON public.contact_callbacks(tenant_id,status,scheduled_for);

CREATE TABLE IF NOT EXISTS public.contact_recordings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.contact_sessions(id) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_ref text,
 storage_ref text NOT NULL,
 mime_type text,
 duration_seconds integer CHECK(duration_seconds IS NULL OR duration_seconds>=0),
 consent_status text NOT NULL DEFAULT 'unknown'
   CHECK(consent_status IN('unknown','not_required','obtained','declined')),
 retention_until timestamptz,
 redaction_status text NOT NULL DEFAULT 'pending'
   CHECK(redaction_status IN('pending','processing','complete','failed','not_required')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_transcripts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.contact_sessions(id) ON DELETE CASCADE,
 recording_id uuid REFERENCES public.contact_recordings(id) ON DELETE SET NULL,
 language text,
 transcript_ref text,
 transcript_text text,
 summary text,
 sentiment text CHECK(sentiment IS NULL OR sentiment IN('positive','neutral','negative','mixed')),
 redaction_status text NOT NULL DEFAULT 'pending'
   CHECK(redaction_status IN('pending','processing','complete','failed','not_required')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.call_masking_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 subject_type text NOT NULL,
 subject_id text NOT NULL,
 party_a_ref text NOT NULL,
 party_b_ref text NOT NULL,
 masked_number text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('reserved','active','expired','released','failed')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 provider_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK(expires_at>starts_at)
);
CREATE INDEX IF NOT EXISTS call_masking_subject_idx ON public.call_masking_sessions(tenant_id,product_key,subject_type,subject_id,status);

CREATE TABLE IF NOT EXISTS public.media_analysis_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 media_type text NOT NULL CHECK(media_type IN('image','pdf','audio','video','scan','other')),
 storage_ref text NOT NULL,
 purpose text NOT NULL,
 provider_key text,
 model text,
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN('queued','processing','review','approved','rejected','failed')),
 extracted_text text,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 confidence numeric CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 error text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mobile_devices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 device_ref text NOT NULL,
 platform text NOT NULL CHECK(platform IN('ios','android','web','other')),
 app_version text,
 device_model text,
 locale text,
 timezone text,
 push_enabled boolean NOT NULL DEFAULT false,
 location_permission text NOT NULL DEFAULT 'unknown'
   CHECK(location_permission IN('unknown','denied','foreground','background')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive','revoked')),
 last_seen_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,device_ref)
);

CREATE TABLE IF NOT EXISTS public.mobile_push_endpoints(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.mobile_devices(id) ON DELETE CASCADE,
 provider text NOT NULL,
 token_ref text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','invalid','revoked')),
 last_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(device_id,provider,token_ref)
);

CREATE TABLE IF NOT EXISTS public.mobile_location_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.mobile_devices(id) ON DELETE CASCADE,
 subject_type text,
 subject_id text,
 latitude numeric NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude numeric NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy_m numeric CHECK(accuracy_m IS NULL OR accuracy_m>=0),
 heading numeric,
 speed_mps numeric,
 captured_at timestamptz NOT NULL,
 purpose text NOT NULL,
 retention_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mobile_location_subject_idx ON public.mobile_location_events(tenant_id,subject_type,subject_id,captured_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_prospect_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE CASCADE,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
 prospect_ref text NOT NULL,
 score numeric CHECK(score IS NULL OR score BETWEEN 0 AND 100),
 stage text NOT NULL DEFAULT 'prospect',
 intent_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
 fit_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
 risk_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
 next_best_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
 model_ref text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,prospect_ref)
);

CREATE TABLE IF NOT EXISTS public.sales_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 proposal_ref text NOT NULL,
 title text NOT NULL,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 total_minor bigint,
 terms jsonb NOT NULL DEFAULT '{}'::jsonb,
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','review','approved','sent','viewed','accepted','declined','expired','cancelled')),
 valid_until timestamptz,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,proposal_ref)
);

CREATE TABLE IF NOT EXISTS public.signature_envelopes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 proposal_id uuid REFERENCES public.sales_proposals(id) ON DELETE SET NULL,
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 provider_ref text,
 signers jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','sent','partially_signed','completed','declined','expired','voided','failed')),
 sent_at timestamptz,
 completed_at timestamptz,
 audit_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cross_sell_recommendations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 source_product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 target_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 reason text NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 score numeric CHECK(score IS NULL OR score BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'suggested' CHECK(status IN('suggested','reviewed','offered','accepted','dismissed','expired')),
 model_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_outcome_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 run_id uuid REFERENCES public.ai_agent_runs(id) ON DELETE SET NULL,
 use_case_id uuid REFERENCES public.ai_use_cases(id) ON DELETE SET NULL,
 decision_ref text,
 expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
 observed_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
 outcome_score numeric,
 review_summary text NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_reviewed_lessons(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case_id uuid REFERENCES public.ai_use_cases(id) ON DELETE SET NULL,
 outcome_review_id uuid NOT NULL REFERENCES public.ai_outcome_reviews(id) ON DELETE CASCADE,
 lesson_type text NOT NULL CHECK(lesson_type IN('prompt','routing','policy','tool','data','human_process','model_candidate','other')),
 title text NOT NULL,
 lesson text NOT NULL,
 proposed_change jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'candidate' CHECK(status IN('candidate','review','approved','rejected','implemented','retired')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_candidate_model_tests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case_id uuid REFERENCES public.ai_use_cases(id) ON DELETE SET NULL,
 candidate_provider text NOT NULL,
 candidate_model text NOT NULL,
 baseline_provider text,
 baseline_model text,
 evaluation_set_ref text NOT NULL,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 safety_results jsonb NOT NULL DEFAULT '{}'::jsonb,
 cost_results jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','running','review','approved','rejected','cancelled')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'contact_sessions','contact_session_participants','contact_escalations','contact_callbacks','contact_recordings',
  'contact_transcripts','call_masking_sessions','media_analysis_jobs','mobile_devices','mobile_push_endpoints',
  'mobile_location_events','sales_prospect_profiles','sales_proposals','signature_envelopes','cross_sell_recommendations',
  'ai_outcome_reviews','ai_reviewed_lessons','ai_candidate_model_tests'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','v4 shared read '||t,t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','v4 shared write '||t,t);
 END LOOP;
END $$;

COMMIT;
