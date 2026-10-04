BEGIN;

-- Cross-product observability and approval layer.
-- Vertical data (menus, orders, payment attempts, screen playlists) remains in the source product.

CREATE TABLE IF NOT EXISTS public.connected_operation_targets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 target_type text NOT NULL CHECK(target_type IN('display','kiosk','customer_display','collection_display','payment_device','kds','printer','other')),
 external_ref text NOT NULL,
 external_location_ref text,
 name text,
 status text NOT NULL DEFAULT 'unknown' CHECK(status IN('unknown','online','healthy','degraded','offline','disabled')),
 capabilities text[] NOT NULL DEFAULT '{}',
 last_seen_at timestamptz,
 last_event_at timestamptz,
 summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,target_type,external_ref)
);
CREATE INDEX IF NOT EXISTS connected_operation_targets_health_idx
 ON public.connected_operation_targets(tenant_id,status,last_seen_at);

CREATE TABLE IF NOT EXISTS public.pricing_intelligence_queue(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 external_item_ref text NOT NULL,
 external_location_ref text,
 channel_key text NOT NULL,
 fulfilment text,
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 current_minor bigint NOT NULL CHECK(current_minor>=0),
 recommended_minor bigint NOT NULL CHECK(recommended_minor>=0),
 estimated_cost_minor bigint,
 target_margin_bps integer CHECK(target_margin_bps IS NULL OR target_margin_bps BETWEEN 0 AND 10000),
 reason text,
 inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','applied','expired','superseded')),
 source_ref text,
 decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_intelligence_queue_status_idx
 ON public.pricing_intelligence_queue(tenant_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_intelligence_source_uq
 ON public.pricing_intelligence_queue(tenant_id,product_key,source_ref)
 WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.display_orchestration_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 external_profile_ref text NOT NULL,
 external_location_ref text,
 campaign_ref text,
 content_ref text,
 assignment_type text NOT NULL DEFAULT 'campaign' CHECK(assignment_type IN('campaign','promotion','emergency','daypart','sponsor')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','scheduled','active','paused','completed','cancelled')),
 starts_at timestamptz,
 ends_at timestamptz,
 targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS display_orchestration_links_schedule_idx
 ON public.display_orchestration_links(tenant_id,status,starts_at,ends_at);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['connected_operation_targets','pricing_intelligence_queue','display_orchestration_links'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','connected ops read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','connected ops write',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.server_upsert_connected_operation_target(
 _tenant uuid,
 _product text,
 _target_type text,
 _external_ref text,
 _external_location_ref text DEFAULT NULL,
 _name text DEFAULT NULL,
 _status text DEFAULT 'unknown',
 _last_seen_at timestamptz DEFAULT NULL,
 _capabilities text[] DEFAULT '{}',
 _summary jsonb DEFAULT '{}'::jsonb,
 _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
  RAISE EXCEPTION 'Service role required';
 END IF;
 IF _target_type NOT IN('display','kiosk','customer_display','collection_display','payment_device','kds','printer','other') THEN
  RAISE EXCEPTION 'Invalid target type';
 END IF;
 IF _status NOT IN('unknown','online','healthy','degraded','offline','disabled') THEN
  RAISE EXCEPTION 'Invalid status';
 END IF;
 INSERT INTO public.connected_operation_targets(
  tenant_id,product_key,target_type,external_ref,external_location_ref,name,status,
  capabilities,last_seen_at,last_event_at,summary,metadata
 ) VALUES(
  _tenant,_product,_target_type,_external_ref,_external_location_ref,_name,_status,
  COALESCE(_capabilities,'{}'),_last_seen_at,now(),COALESCE(_summary,'{}'::jsonb),COALESCE(_metadata,'{}'::jsonb)
 )
 ON CONFLICT(tenant_id,product_key,target_type,external_ref) DO UPDATE SET
  external_location_ref=EXCLUDED.external_location_ref,
  name=EXCLUDED.name,
  status=EXCLUDED.status,
  capabilities=EXCLUDED.capabilities,
  last_seen_at=EXCLUDED.last_seen_at,
  last_event_at=now(),
  summary=EXCLUDED.summary,
  metadata=public.connected_operation_targets.metadata||EXCLUDED.metadata,
  updated_at=now()
 RETURNING id INTO v_id;
 RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.server_upsert_connected_operation_target(uuid,text,text,text,text,text,text,timestamptz,text[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_upsert_connected_operation_target(uuid,text,text,text,text,text,text,timestamptz,text[],jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.server_queue_pricing_recommendation(
 _tenant uuid,
 _product text,
 _external_item_ref text,
 _external_location_ref text,
 _channel text,
 _fulfilment text,
 _currency text,
 _current_minor bigint,
 _recommended_minor bigint,
 _estimated_cost_minor bigint DEFAULT NULL,
 _target_margin_bps integer DEFAULT NULL,
 _reason text DEFAULT NULL,
 _inputs jsonb DEFAULT '{}'::jsonb,
 _source_ref text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
  RAISE EXCEPTION 'Service role required';
 END IF;
 INSERT INTO public.pricing_intelligence_queue(
  tenant_id,product_key,external_item_ref,external_location_ref,channel_key,fulfilment,currency,
  current_minor,recommended_minor,estimated_cost_minor,target_margin_bps,reason,inputs,source_ref,status
 ) VALUES(
  _tenant,_product,_external_item_ref,_external_location_ref,_channel,_fulfilment,upper(_currency),
  _current_minor,_recommended_minor,_estimated_cost_minor,_target_margin_bps,_reason,COALESCE(_inputs,'{}'::jsonb),_source_ref,'pending'
 )
 ON CONFLICT(tenant_id,product_key,source_ref) WHERE source_ref IS NOT NULL
 DO UPDATE SET
  recommended_minor=EXCLUDED.recommended_minor,
  current_minor=EXCLUDED.current_minor,
  estimated_cost_minor=EXCLUDED.estimated_cost_minor,
  target_margin_bps=EXCLUDED.target_margin_bps,
  reason=EXCLUDED.reason,
  inputs=EXCLUDED.inputs,
  status=CASE WHEN public.pricing_intelligence_queue.status='applied' THEN 'applied' ELSE 'pending' END,
  updated_at=now()
 RETURNING id INTO v_id;
 RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.server_queue_pricing_recommendation(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_queue_pricing_recommendation(uuid,text,text,text,text,text,text,bigint,bigint,bigint,integer,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.decide_pricing_recommendation(
 _tenant uuid,
 _recommendation uuid,
 _decision text
) RETURNS public.pricing_intelligence_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.pricing_intelligence_queue%rowtype;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Pricing intelligence access denied';
 END IF;
 IF _decision NOT IN('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision';END IF;
 SELECT * INTO v FROM public.pricing_intelligence_queue WHERE id=_recommendation AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation not found';END IF;
 IF v.status NOT IN('pending','approved','rejected') THEN RAISE EXCEPTION 'Recommendation not decidable';END IF;
 UPDATE public.pricing_intelligence_queue
 SET status=_decision,decided_by=auth.uid(),decided_at=now(),updated_at=now()
 WHERE id=v.id
 RETURNING * INTO v;
 RETURN v;
END;$$;
REVOKE ALL ON FUNCTION public.decide_pricing_recommendation(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_pricing_recommendation(uuid,uuid,text) TO authenticated,service_role;

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.device-observability','Connected Device Observability','Cross-product health and status summaries for displays, kiosks, payment devices, KDS and related operational endpoints.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.pricing-intelligence','Pricing Intelligence','Cross-product recommendation and approval queue for margin-aware channel pricing without copying vertical catalogue ownership.','analytics','omniqora',true,'automatic','active','built_main'),
 ('omniqora.signage-orchestration','Signage Orchestration','Cross-product campaign, daypart and emergency assignment references for connected digital displays.','growth','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 description=EXCLUDED.description,implementation_status='built_main',status='active',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.device-observability','omniqora.analytics'),
 ('omniqora.pricing-intelligence','omniqora.analytics'),
 ('omniqora.pricing-intelligence','omniqora.automation'),
 ('omniqora.signage-orchestration','omniqora.campaigns'),
 ('omniqora.signage-orchestration','omniqora.automation')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT p.product_key,s.service_key,true,false
FROM (VALUES('dishbee'),('mealdeck')) p(product_key)
CROSS JOIN (VALUES
 ('omniqora.device-observability'),
 ('omniqora.pricing-intelligence'),
 ('omniqora.signage-orchestration')
) s(service_key)
WHERE EXISTS(SELECT 1 FROM public.product_catalogue pc WHERE pc.product_key=p.product_key)
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=true;

COMMIT;