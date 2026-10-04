BEGIN;

-- Shared AI routing/governance + inbound/outbound webhook registry for all SaaS Factory products.

CREATE TABLE IF NOT EXISTS public.ai_model_catalogue(
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 model_key text NOT NULL,
 name text NOT NULL,
 capabilities text[] NOT NULL DEFAULT '{}',
 context_window integer,
 max_output integer,
 input_cost_minor_per_million bigint,
 output_cost_minor_per_million bigint,
 currency text NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','planned','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider_key,model_key)
);

CREATE TABLE IF NOT EXISTS public.ai_routing_policies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case_key text NOT NULL,
 capability text NOT NULL,
 preferred_providers text[] NOT NULL DEFAULT '{}',
 preferred_models text[] NOT NULL DEFAULT '{}',
 fallback_providers text[] NOT NULL DEFAULT '{}',
 max_data_classification text NOT NULL DEFAULT 'confidential'
   CHECK(max_data_classification IN('public','internal','confidential','restricted')),
 approval_mode text NOT NULL DEFAULT 'none'
   CHECK(approval_mode IN('none','before_external_write','always')),
 max_cost_minor_per_run bigint,
 currency text NOT NULL DEFAULT 'GBP',
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,use_case_key)
);

CREATE TABLE IF NOT EXISTS public.ai_tool_bindings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 tool_key text NOT NULL,
 name text NOT NULL,
 action_kind text NOT NULL CHECK(action_kind IN('read','draft','event','webhook','provider_action')),
 destination_ref text,
 required_permissions text[] NOT NULL DEFAULT '{}',
 approval_mode text NOT NULL DEFAULT 'none'
   CHECK(approval_mode IN('none','before_external_write','always')),
 schema jsonb NOT NULL DEFAULT '{}'::jsonb,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,tool_key)
);

CREATE TABLE IF NOT EXISTS public.ai_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case_key text NOT NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 model_key text,
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN('queued','running','requires_approval','succeeded','failed','cancelled')),
 data_classification text NOT NULL DEFAULT 'internal'
   CHECK(data_classification IN('public','internal','confidential','restricted')),
 input_hash text,
 output_hash text,
 input_tokens bigint NOT NULL DEFAULT 0,
 cached_input_tokens bigint NOT NULL DEFAULT 0,
 output_tokens bigint NOT NULL DEFAULT 0,
 estimated_cost_minor bigint NOT NULL DEFAULT 0,
 currency text NOT NULL DEFAULT 'GBP',
 correlation_id text,
 source_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_runs_scope_idx
 ON public.ai_runs(tenant_id,product_key,use_case_key,created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_action_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 run_id uuid REFERENCES public.ai_runs(id) ON DELETE SET NULL,
 tool_binding_id uuid REFERENCES public.ai_tool_bindings(id) ON DELETE SET NULL,
 action_type text NOT NULL,
 subject_type text,
 subject_id text,
 proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN('pending','approved','rejected','executing','succeeded','failed','cancelled')),
 requested_by text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 execution_ref text,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_webhook_endpoints(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 endpoint_url text NOT NULL,
 secret_ref text,
 signing_mode text NOT NULL DEFAULT 'hmac_sha256'
   CHECK(signing_mode IN('none','hmac_sha256','provider_native')),
 header_config jsonb NOT NULL DEFAULT '{}'::jsonb,
 timeout_ms integer NOT NULL DEFAULT 10000 CHECK(timeout_ms BETWEEN 1000 AND 60000),
 max_attempts integer NOT NULL DEFAULT 8 CHECK(max_attempts BETWEEN 1 AND 30),
 retry_policy jsonb NOT NULL DEFAULT '{"baseSeconds":30,"maxSeconds":3600}'::jsonb,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('active','paused','degraded','disabled')),
 health jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_success_at timestamptz,
 last_failure_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_inbound_webhook_routes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 route_key text NOT NULL,
 signature_mode text NOT NULL DEFAULT 'provider_native'
   CHECK(signature_mode IN('none','hmac_sha256','provider_native')),
 secret_ref text,
 allowed_event_types text[] NOT NULL DEFAULT '{}',
 max_body_bytes integer NOT NULL DEFAULT 1048576,
 max_age_seconds integer NOT NULL DEFAULT 300,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('active','paused','disabled')),
 mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,route_key)
);

CREATE TABLE IF NOT EXISTS public.platform_webhook_delivery_attempts(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 delivery_id uuid NOT NULL REFERENCES public.platform_event_deliveries(id) ON DELETE CASCADE,
 endpoint_id uuid REFERENCES public.platform_webhook_endpoints(id) ON DELETE SET NULL,
 attempt_number integer NOT NULL,
 status_code integer,
 duration_ms integer,
 response_hash text,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(delivery_id,attempt_number)
);

ALTER TABLE public.platform_event_subscriptions
 ADD COLUMN IF NOT EXISTS webhook_endpoint_id uuid REFERENCES public.platform_webhook_endpoints(id) ON DELETE SET NULL;

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'ai_routing_policies','ai_tool_bindings','ai_runs','ai_action_requests',
  'platform_webhook_endpoints','platform_inbound_webhook_routes','platform_webhook_delivery_attempts'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','ai webhook read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','ai webhook write',t);
 END LOOP;
END $$;
ALTER TABLE public.ai_model_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_model_catalogue TO authenticated;
GRANT ALL ON public.ai_model_catalogue TO service_role;
CREATE POLICY "ai model catalogue read" ON public.ai_model_catalogue
 FOR SELECT TO authenticated USING(status<>'retired');

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status
) VALUES
 ('ai.runway','Runway','ai',ARRAY['image','video','generation'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
 ('ai.fal','fal.ai','ai',ARRAY['image','video','audio','3d','generation'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
 ('ai.heygen','HeyGen','ai',ARRAY['avatar','video','voice','translation'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
 ('ai.elevenlabs','ElevenLabs','ai',ARRAY['voice','speech','audio'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
 ('ai.midjourney','Midjourney','ai',ARRAY['image','generation'],ARRAY[]::text[],ARRAY['credential_ref'],ARRAY[]::text[],'planned','catalogue_only')
ON CONFLICT(provider_key) DO UPDATE SET
 capabilities=EXCLUDED.capabilities,required_secret_names=EXCLUDED.required_secret_names,
 status=EXCLUDED.status,implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.ai-router','AI Router','Tenant-aware model/provider routing, fallback, budgets and data-classification controls.','ai','omniqora',true,'automatic','active','built_main'),
 ('omniqora.ai-actions','AI Action Governance','Governed tool bindings, human approvals and external-action execution records.','ai','omniqora',true,'automatic','active','built_main'),
 ('omniqora.webhooks','Webhook Hub','Signed inbound/outbound webhook registry, retries, dead-letter evidence and connector health.','platform','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET description=EXCLUDED.description,implementation_status='built_main',status='active',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.ai-router','omniqora.ai'),
 ('omniqora.ai-actions','omniqora.ai-router'),
 ('omniqora.ai-actions','omniqora.automation'),
 ('omniqora.webhooks','omniqora.automation')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ai_decide_action(
 _tenant uuid,_action uuid,_decision text
) RETURNS public.ai_action_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_action_requests%rowtype;
BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'AI action access denied';END IF;
 IF _decision NOT IN('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision';END IF;
 SELECT * INTO a FROM public.ai_action_requests WHERE id=_action AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR a.status<>'pending' THEN RAISE EXCEPTION 'AI action not pending';END IF;
 UPDATE public.ai_action_requests
 SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 WHERE id=a.id RETURNING * INTO a;
 RETURN a;
END;$$;
REVOKE ALL ON FUNCTION public.ai_decide_action(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_decide_action(uuid,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_register_webhook(
 _tenant uuid,_product text,_name text,_url text,_secret_ref text,_event_patterns text[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid;sid uuid;
BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Webhook access denied';END IF;
 IF _url !~ '^https://.+' THEN RAISE EXCEPTION 'Webhook URL must use HTTPS';END IF;
 INSERT INTO public.platform_webhook_endpoints(tenant_id,product_key,name,endpoint_url,secret_ref)
 VALUES(_tenant,_product,_name,_url,_secret_ref)
 RETURNING id INTO eid;
 INSERT INTO public.platform_event_subscriptions(
  tenant_id,product_key,name,event_patterns,destination_kind,destination_ref,status,webhook_endpoint_id
 ) VALUES(
  _tenant,_product,_name,_event_patterns,'webhook',eid::text,'active',eid
 ) RETURNING id INTO sid;
 RETURN sid;
END;$$;
REVOKE ALL ON FUNCTION public.platform_register_webhook(uuid,text,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_register_webhook(uuid,text,text,text,text,text[]) TO authenticated,service_role;

COMMIT;