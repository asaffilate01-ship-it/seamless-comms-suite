BEGIN;

-- Long-range Omniqora consolidation from the August/September design threads.
-- Extends current CRM/Growth/Connect/Analytics/Vertical engines; no Dishbee-specific runtime.

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.sales-engagement','Sales Engagement','Prospect lists, scoring, callbacks, meetings, proposals, signatures and onboarding handoff.','growth','omniqora',true,'automatic','active','built_main'),
 ('omniqora.contact-centre','AI Contact Centre','Carrier-independent queues, routing, calls, callbacks, knowledge context and human escalation controls.','communications','omniqora',true,'automatic','active','built_main'),
 ('omniqora.agent-library','Agent Library','Reusable bounded agent templates, schedules, approvals and autonomy policy defaults.','ai','omniqora',true,'automatic','active','built_main'),
 ('omniqora.attribution','Marketing Attribution','Cross-channel touchpoints, conversions and evidence-linked attribution models.','growth','omniqora',true,'automatic','active','built_main'),
 ('omniqora.company-memory','Company Memory','Evidence-linked organisational facts, relationship intelligence and research/enrichment records.','ai','omniqora',true,'automatic','active','built_main'),
 ('omniqora.bi','Analytics & BI','Metric catalogue, semantic datasets, dashboard definitions and governed export jobs.','analytics','omniqora',true,'automatic','active','built_main'),
 ('omniqora.education','Education Intelligence','Student/Cohort/Course 360, intervention signals, placements and education evidence.','education','omniqora',true,'automatic','active','built_main'),
 ('omniqora.food-safety','Food Safety Intelligence','Reusable food-safety controls, evidence and country packs for Haccora-style deployments.','compliance','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.sales-engagement','omniqora.crm'),
 ('omniqora.sales-engagement','omniqora.connect'),
 ('omniqora.sales-engagement','omniqora.journeys'),
 ('omniqora.contact-centre','omniqora.connect'),
 ('omniqora.contact-centre','omniqora.crm'),
 ('omniqora.contact-centre','omniqora.ai'),
 ('omniqora.agent-library','omniqora.ai'),
 ('omniqora.agent-library','omniqora.automation'),
 ('omniqora.attribution','omniqora.campaigns'),
 ('omniqora.attribution','omniqora.analytics'),
 ('omniqora.company-memory','omniqora.crm'),
 ('omniqora.company-memory','omniqora.ai'),
 ('omniqora.bi','omniqora.analytics'),
 ('omniqora.education','omniqora.crm'),
 ('omniqora.education','omniqora.documents'),
 ('omniqora.education','omniqora.ai'),
 ('omniqora.food-safety','omniqora.documents'),
 ('omniqora.food-safety','omniqora.ai')
ON CONFLICT DO NOTHING;

-- Sales / prospect engine.
CREATE TABLE IF NOT EXISTS public.sales_prospect_lists(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 description text,
 source_type text NOT NULL DEFAULT 'manual'
  CHECK(source_type IN('manual','import','segment','enrichment','campaign','event','api')),
 criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','archived')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_prospect_members(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 list_id uuid NOT NULL REFERENCES public.sales_prospect_lists(id) ON DELETE CASCADE,
 lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE CASCADE,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
 fit_score numeric CHECK(fit_score IS NULL OR (fit_score>=0 AND fit_score<=100)),
 intent_score numeric CHECK(intent_score IS NULL OR (intent_score>=0 AND intent_score<=100)),
 engagement_score numeric CHECK(engagement_score IS NULL OR (engagement_score>=0 AND engagement_score<=100)),
 total_score numeric CHECK(total_score IS NULL OR (total_score>=0 AND total_score<=100)),
 score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','contacted','qualified','disqualified','converted','suppressed')),
 next_action_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(lead_id IS NOT NULL OR person_id IS NOT NULL OR company_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.sales_callbacks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
 scheduled_for timestamptz NOT NULL,
 channel text NOT NULL DEFAULT 'voice' CHECK(channel IN('voice','whatsapp','sms','email','video')),
 reason text,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','attempted','completed','cancelled','missed')),
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_meetings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
 title text NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 meeting_type text NOT NULL DEFAULT 'sales' CHECK(meeting_type IN('sales','discovery','demo','review','onboarding','renewal','other')),
 location_ref text,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','completed','cancelled','no_show')),
 attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
 notes text,
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at)
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
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 amount_minor bigint NOT NULL DEFAULT 0,
 valid_until timestamptz,
 version integer NOT NULL DEFAULT 1,
 content jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','sent','viewed','accepted','declined','expired','cancelled')),
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,proposal_ref,version)
);
CREATE TABLE IF NOT EXISTS public.sales_proposal_signatures(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 proposal_id uuid NOT NULL REFERENCES public.sales_proposals(id) ON DELETE CASCADE,
 signer_ref text NOT NULL,
 signer_name text NOT NULL,
 signature_provider text,
 signature_ref text,
 signed_at timestamptz,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','viewed','signed','declined','expired','void')),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_onboarding_handoffs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
 proposal_id uuid REFERENCES public.sales_proposals(id) ON DELETE SET NULL,
 target_product_key text,
 target_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
 handoff_type text NOT NULL DEFAULT 'customer_onboarding',
 checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','in_progress','complete','cancelled','failed')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contact-centre / AI receptionist engine.
CREATE TABLE IF NOT EXISTS public.contact_centre_queues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 queue_key text NOT NULL,
 name text NOT NULL,
 channels text[] NOT NULL DEFAULT ARRAY['voice']::text[],
 priority integer NOT NULL DEFAULT 100,
 ai_first boolean NOT NULL DEFAULT true,
 human_overflow boolean NOT NULL DEFAULT true,
 max_wait_seconds integer,
 business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
 knowledge_collection_ref text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
 UNIQUE(tenant_id,queue_key)
);
CREATE TABLE IF NOT EXISTS public.contact_centre_routing_policies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 queue_id uuid REFERENCES public.contact_centre_queues(id) ON DELETE CASCADE,
 name text NOT NULL,
 conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
 route_order jsonb NOT NULL DEFAULT '[]'::jsonb,
 autonomy_level text NOT NULL DEFAULT 'assist' CHECK(autonomy_level IN('observe','assist','bounded_auto')),
 escalation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.contact_centre_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 queue_id uuid REFERENCES public.contact_centre_queues(id) ON DELETE SET NULL,
 channel text NOT NULL CHECK(channel IN('voice','whatsapp','web_chat','sms','email','video')),
 external_session_ref text,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
 direction text NOT NULL CHECK(direction IN('inbound','outbound')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','ai_handling','human_handling','callback_pending','completed','abandoned','failed')),
 ai_handled boolean NOT NULL DEFAULT false,
 human_escalated boolean NOT NULL DEFAULT false,
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 intent text,
 summary text,
 transcript_ref text,
 started_at timestamptz NOT NULL DEFAULT now(),
 answered_at timestamptz,
 ended_at timestamptz,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.contact_centre_callbacks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 session_id uuid REFERENCES public.contact_centre_sessions(id) ON DELETE SET NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 queue_id uuid REFERENCES public.contact_centre_queues(id) ON DELETE SET NULL,
 requested_for timestamptz NOT NULL,
 phone_e164 text,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 reason text,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','scheduled','attempted','completed','cancelled','failed')),
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reusable bounded agent template library.
CREATE TABLE IF NOT EXISTS public.agent_template_catalogue(
 template_key text PRIMARY KEY,
 name text NOT NULL,
 family text NOT NULL,
 description text NOT NULL,
 default_profile text NOT NULL,
 default_tools text[] NOT NULL DEFAULT '{}',
 default_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
 default_autonomy text NOT NULL DEFAULT 'assist' CHECK(default_autonomy IN('observe','assist','bounded_auto')),
 approval_required boolean NOT NULL DEFAULT true,
 output_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.tenant_agent_templates(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 template_key text NOT NULL REFERENCES public.agent_template_catalogue(template_key) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 autonomy text NOT NULL DEFAULT 'assist' CHECK(autonomy IN('observe','assist','bounded_auto')),
 schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,template_key)
);

-- Attribution, memory and enrichment.
CREATE TABLE IF NOT EXISTS public.marketing_attribution_touchpoints(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
 campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
 channel text NOT NULL,
 source text,
 medium text,
 campaign_ref text,
 content_ref text,
 term_ref text,
 landing_ref text,
 external_ref text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.marketing_attribution_conversions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
 opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
 conversion_type text NOT NULL,
 conversion_ref text,
 value_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 attribution_model text NOT NULL DEFAULT 'last_touch'
  CHECK(attribution_model IN('first_touch','last_touch','linear','position_based','time_decay','custom')),
 attributed_touchpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS public.company_memory_facts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 subject_type text NOT NULL,
 subject_ref text NOT NULL,
 fact_key text NOT NULL,
 fact_value jsonb NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 confidence numeric CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
 valid_from timestamptz,
 valid_until timestamptz,
 status text NOT NULL DEFAULT 'reviewed' CHECK(status IN('proposed','reviewed','superseded','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.relationship_intelligence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE CASCADE,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
 relationship_type text NOT NULL DEFAULT 'customer',
 health_score numeric CHECK(health_score IS NULL OR (health_score>=0 AND health_score<=100)),
 engagement_score numeric CHECK(engagement_score IS NULL OR (engagement_score>=0 AND engagement_score<=100)),
 opportunity_score numeric CHECK(opportunity_score IS NULL OR (opportunity_score>=0 AND opportunity_score<=100)),
 risk_score numeric CHECK(risk_score IS NULL OR (risk_score>=0 AND risk_score<=100)),
 last_meaningful_contact_at timestamptz,
 next_best_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','watch','at_risk','inactive')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(person_id IS NOT NULL OR company_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.research_enrichment_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 subject_type text NOT NULL,
 subject_ref text NOT NULL,
 requested_fields text[] NOT NULL DEFAULT '{}',
 provider_key text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','review','complete','failed','cancelled')),
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 error text,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- BI/semantic layer.
CREATE TABLE IF NOT EXISTS public.analytics_metric_definitions(
 metric_key text PRIMARY KEY,
 name text NOT NULL,
 description text,
 unit text NOT NULL,
 aggregation text NOT NULL DEFAULT 'sum' CHECK(aggregation IN('sum','avg','min','max','count','distinct_count','ratio','custom')),
 formula jsonb NOT NULL DEFAULT '{}'::jsonb,
 dimensions text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired'))
);
CREATE TABLE IF NOT EXISTS public.analytics_datasets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 dataset_key text NOT NULL,
 name text NOT NULL,
 source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 schema_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
 refresh_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_refreshed_at timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','failed','retired')),
 UNIQUE(tenant_id,dataset_key)
);
CREATE TABLE IF NOT EXISTS public.analytics_dashboard_definitions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 dashboard_key text NOT NULL,
 name text NOT NULL,
 audience text NOT NULL DEFAULT 'operator',
 layout jsonb NOT NULL DEFAULT '{}'::jsonb,
 metric_keys text[] NOT NULL DEFAULT '{}',
 filters jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','retired')),
 UNIQUE(tenant_id,dashboard_key)
);
CREATE TABLE IF NOT EXISTS public.analytics_export_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 dataset_id uuid REFERENCES public.analytics_datasets(id) ON DELETE SET NULL,
 dashboard_id uuid REFERENCES public.analytics_dashboard_definitions(id) ON DELETE SET NULL,
 export_format text NOT NULL CHECK(export_format IN('csv','xlsx','json','pdf','parquet')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','complete','failed','cancelled')),
 storage_ref text,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

-- Education Intelligence pack.
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status)
VALUES('unipathway','UniPathway','Education delivery, pathway and student-success platform.','education','external','active')
ON CONFLICT(product_key) DO UPDATE SET description=EXCLUDED.description,status='active';

CREATE TABLE IF NOT EXISTS public.education_students(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 student_ref text NOT NULL,
 programme_ref text,
 status text NOT NULL DEFAULT 'applicant' CHECK(status IN('applicant','offer','enrolled','active','paused','completed','withdrawn','alumni')),
 risk_score numeric CHECK(risk_score IS NULL OR (risk_score>=0 AND risk_score<=100)),
 profile jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,student_ref)
);
CREATE TABLE IF NOT EXISTS public.education_courses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 course_ref text NOT NULL,
 title text NOT NULL,
 awarding_body text,
 level text,
 credits numeric,
 delivery_mode text,
 content_collection_ref text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,product_key,course_ref)
);
CREATE TABLE IF NOT EXISTS public.education_cohorts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 cohort_ref text NOT NULL,
 course_id uuid REFERENCES public.education_courses(id) ON DELETE SET NULL,
 name text NOT NULL,
 starts_on date,
 ends_on date,
 centre_weeks jsonb NOT NULL DEFAULT '[]'::jsonb,
 capacity integer,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','open','active','completed','cancelled')),
 UNIQUE(tenant_id,product_key,cohort_ref)
);
CREATE TABLE IF NOT EXISTS public.education_enrolments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 course_id uuid REFERENCES public.education_courses(id) ON DELETE SET NULL,
 cohort_id uuid REFERENCES public.education_cohorts(id) ON DELETE SET NULL,
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('pending','active','completed','withdrawn','failed')),
 progress jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(student_id,course_id,cohort_id)
);
CREATE TABLE IF NOT EXISTS public.education_interventions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 signal_type text NOT NULL,
 severity text NOT NULL DEFAULT 'medium' CHECK(severity IN('low','medium','high','critical')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewed','actioned','resolved','dismissed')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.education_placements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 placement_type text NOT NULL CHECK(placement_type IN('residential_week','lab','work_placement','exam','visit','other')),
 starts_at timestamptz,
 ends_at timestamptz,
 location_ref text,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','confirmed','attended','missed','completed','cancelled')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Haccora-style food safety as one product with UK/DE compliance packs.
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status)
VALUES('haccora','Haccora','Food-safety and compliance workspace with country packs and shared Omniqora intelligence.','compliance','external','active')
ON CONFLICT(product_key) DO UPDATE SET description=EXCLUDED.description,status='active';

INSERT INTO public.vertical_package_catalogue(
 package_key,name,family,description,status,implementation_status,required_services,provider_requirements,capabilities,metadata
) VALUES
 ('haccora.food-safety','Haccora Food Safety','compliance',
  'Reusable food-safety evidence, HACCP-style controls and jurisdiction packs for standalone or add-on use.',
  'active','built_main',ARRAY['omniqora.documents','omniqora.automation','omniqora.ai','omniqora.food-safety'],
  ARRAY[]::text[],ARRAY['food_safety','haccp','checks','evidence','incidents','corrective_actions','country_packs'],
  '{"countryPacks":["GB","DE"],"separateCountryProducts":false}'::jsonb)
ON CONFLICT(package_key) DO UPDATE SET
 status='active',implementation_status='built_main',required_services=EXCLUDED.required_services,
 capabilities=EXCLUDED.capabilities,metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO public.compliance_pack_definitions(pack_key,name,regulator,jurisdiction,status,controls,evidence_requirements,metadata) VALUES
 ('haccora-gb-food-safety','Haccora UK Food Safety','Local authority / FSA framework','GB','active','[]'::jsonb,'[]'::jsonb,
  '{"product":"haccora","countryPack":true,"certificationNotImplied":true}'::jsonb),
 ('haccora-de-food-safety','Haccora Germany Food Safety','German food-control framework','DE','active','[]'::jsonb,'[]'::jsonb,
  '{"product":"haccora","countryPack":true,"certificationNotImplied":true}'::jsonb)
ON CONFLICT(pack_key) DO UPDATE SET status='active',metadata=EXCLUDED.metadata,updated_at=now();

-- Tenant/RLS controls.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'sales_prospect_lists','sales_prospect_members','sales_callbacks','sales_meetings','sales_proposals',
  'sales_proposal_signatures','sales_onboarding_handoffs','contact_centre_queues','contact_centre_routing_policies',
  'contact_centre_sessions','contact_centre_callbacks','tenant_agent_templates',
  'marketing_attribution_touchpoints','marketing_attribution_conversions','company_memory_facts',
  'relationship_intelligence','research_enrichment_jobs','analytics_datasets',
  'analytics_dashboard_definitions','analytics_export_jobs','education_students','education_courses',
  'education_cohorts','education_enrolments','education_interventions','education_placements'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
   'long range tenant read',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
   'long range tenant write',t);
 END LOOP;
END $$;

ALTER TABLE public.agent_template_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_metric_definitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_template_catalogue,public.analytics_metric_definitions TO authenticated;
GRANT ALL ON public.agent_template_catalogue,public.analytics_metric_definitions TO service_role;
CREATE POLICY "agent template read" ON public.agent_template_catalogue FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "analytics metric definition read" ON public.analytics_metric_definitions FOR SELECT TO authenticated USING(status<>'retired');

CREATE INDEX IF NOT EXISTS sales_prospect_member_score_idx ON public.sales_prospect_members(tenant_id,status,total_score DESC);
CREATE INDEX IF NOT EXISTS contact_centre_session_queue_idx ON public.contact_centre_sessions(tenant_id,status,started_at DESC);
CREATE INDEX IF NOT EXISTS attribution_person_time_idx ON public.marketing_attribution_touchpoints(tenant_id,person_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS company_memory_subject_idx ON public.company_memory_facts(tenant_id,subject_type,subject_ref,fact_key);
CREATE INDEX IF NOT EXISTS education_student_status_idx ON public.education_students(tenant_id,product_key,status,risk_score DESC);

-- Seed 38 reusable agent templates discussed in the original agent-library design.
INSERT INTO public.agent_template_catalogue(template_key,name,family,description,default_profile,default_tools,default_autonomy,approval_required) VALUES
 ('service.triage','Service Triage','customer_service','Triage inbound conversations and cases.','discovery',ARRAY['records.read','evidence.search','task.propose'],'assist',true),
 ('service.qa','Knowledge Q&A','customer_service','Answer from approved knowledge with citations.','discovery',ARRAY['evidence.search'],'assist',true),
 ('service.callback','Callback Coordinator','customer_service','Prioritise and propose callback tasks.','discovery',ARRAY['records.read','task.propose'],'assist',true),
 ('service.recovery','Service Recovery','customer_service','Propose recovery actions for negative feedback.','discovery',ARRAY['records.read','evidence.search','task.propose'],'assist',true),
 ('service.sla','SLA Watch','customer_service','Detect SLA risks and propose escalations.','technical',ARRAY['records.read','task.propose'],'observe',true),
 ('sales.prospect','Prospect Research','sales','Research prospects and evidence-backed fit.','discovery',ARRAY['records.read','evidence.search','task.propose'],'assist',true),
 ('sales.score','Lead Scoring','sales','Propose explainable fit/intent/engagement scores.','discovery',ARRAY['records.read'],'assist',true),
 ('sales.sequence','Sequence Assistant','sales','Recommend next cadence actions.','product',ARRAY['records.read','task.propose'],'assist',true),
 ('sales.followup','Follow-up Assistant','sales','Propose callbacks, tasks and meetings.','product',ARRAY['records.read','task.propose'],'assist',true),
 ('sales.proposal','Proposal Assistant','sales','Draft evidence-backed proposal content.','product',ARRAY['records.read','evidence.search'],'assist',true),
 ('sales.pipeline','Pipeline Coach','sales','Identify stalled or risky opportunities.','finance',ARRAY['records.read','finance.report','task.propose'],'observe',true),
 ('marketing.segment','Segment Analyst','marketing','Analyse audiences and segment membership.','product',ARRAY['records.read'],'observe',true),
 ('marketing.campaign','Campaign Planner','marketing','Draft campaign and journey recommendations.','product',ARRAY['records.read','evidence.search'],'assist',true),
 ('marketing.attribution','Attribution Analyst','marketing','Explain conversion paths and attribution evidence.','finance',ARRAY['records.read','finance.report'],'observe',true),
 ('marketing.content','Content Assistant','marketing','Draft content from approved sources.','product',ARRAY['evidence.search'],'assist',true),
 ('marketing.review','Review Intelligence','marketing','Analyse reviews, sentiment and recovery themes.','product',ARRAY['records.read','evidence.search'],'observe',true),
 ('finance.bookkeeping','Bookkeeping Review','finance','Review extraction/coding proposals and exceptions.','accounting',ARRAY['documents.read','evidence.search','accounting.propose'],'assist',true),
 ('finance.reconcile','Reconciliation Analyst','finance','Identify reconciliation differences.','finance',ARRAY['records.read','finance.report'],'observe',true),
 ('finance.reporting','Management Reporting','finance','Prepare evidence-backed management reporting drafts.','finance',ARRAY['records.read','finance.report','evidence.search'],'assist',true),
 ('finance.cashflow','Cashflow Analyst','finance','Analyse supplied cashflow scenarios without inventing forecasts.','finance',ARRAY['records.read','finance.report'],'observe',true),
 ('finance.tax','Tax Research','finance','Research tax positions against authority sources.','tax',ARRAY['evidence.search','tax.sources.read','tax.propose'],'assist',true),
 ('ops.dispatch','Dispatch Monitor','operations','Identify dispatch exceptions and propose interventions.','technical',ARRAY['records.read','task.propose'],'observe',true),
 ('ops.capacity','Capacity Planner','operations','Review staffing/resource capacity and bottlenecks.','technical',ARRAY['records.read','task.propose'],'observe',true),
 ('ops.inventory','Inventory Watch','operations','Identify inventory/availability exceptions.','technical',ARRAY['records.read','task.propose'],'observe',true),
 ('ops.supplier','Supplier Monitor','operations','Review supplier performance/evidence.','technical',ARRAY['records.read','evidence.search'],'observe',true),
 ('ops.quality','Quality Monitor','operations','Identify quality exceptions and corrective actions.','compliance',ARRAY['records.read','evidence.search','task.propose'],'observe',true),
 ('compliance.evidence','Evidence Checker','compliance','Check evidence gaps against configured controls.','compliance',ARRAY['records.read','evidence.search','task.propose'],'observe',true),
 ('compliance.readiness','Readiness Analyst','compliance','Assess readiness without claiming certification.','compliance',ARRAY['records.read','evidence.search','compliance.report'],'observe',true),
 ('compliance.change','Regulatory Change','compliance','Summarise reviewed source changes and impacted controls.','compliance',ARRAY['evidence.search','task.propose'],'observe',true),
 ('compliance.incident','Incident Reviewer','compliance','Review incident evidence and propose corrective tasks.','compliance',ARRAY['records.read','evidence.search','task.propose'],'assist',true),
 ('executive.brief','Executive Brief','executive','Summarise cross-functional evidence and decisions.','discovery',ARRAY['records.read','evidence.search','finance.report','technical.report'],'assist',true),
 ('executive.risk','Enterprise Risk','executive','Surface cross-functional risks and evidence gaps.','compliance',ARRAY['records.read','evidence.search','task.propose'],'observe',true),
 ('relationship.health','Relationship Health','relationship','Assess customer/partner relationship health from supplied interactions.','discovery',ARRAY['records.read','evidence.search'],'observe',true),
 ('research.enrich','Research & Enrichment','research','Enrich approved subjects using configured bounded connectors.','discovery',ARRAY['records.read','connector.read','evidence.search'],'assist',true),
 ('education.student','Student Success','education','Review student/cohort evidence and propose interventions.','product',ARRAY['records.read','evidence.search','task.propose'],'assist',true),
 ('automotive.vehicle','Vehicle Intelligence','automotive','Review vehicle identity/evidence/market records.','technical',ARRAY['records.read','evidence.search'],'observe',true),
 ('childcare.match','Childcare Match Review','childcare','Review provider-match evidence with human approval.','compliance',ARRAY['records.read','evidence.search','task.propose'],'assist',true),
 ('foodsafe.readiness','Food Safety Readiness','food_safety','Review food-safety evidence and corrective-action gaps.','compliance',ARRAY['records.read','evidence.search','task.propose'],'observe',true)
ON CONFLICT(template_key) DO UPDATE SET
 name=EXCLUDED.name,family=EXCLUDED.family,description=EXCLUDED.description,
 default_profile=EXCLUDED.default_profile,default_tools=EXCLUDED.default_tools,
 default_autonomy=EXCLUDED.default_autonomy,approval_required=EXCLUDED.approval_required,status='active';

COMMIT;
