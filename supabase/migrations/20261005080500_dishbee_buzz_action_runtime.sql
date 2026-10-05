BEGIN;

-- Bridge Dishbee Buzz proposals into Omniqora's existing AI Action Governance
-- runtime. Human approval is still mandatory. Only an explicit Dishbee tool
-- allowlist is eligible for downstream execution.

ALTER TABLE public.ai_action_requests
  ADD COLUMN IF NOT EXISTS source_proposal_id uuid REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS execution_result jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.ai_action_proposals
  ADD COLUMN IF NOT EXISTS action_request_id uuid REFERENCES public.ai_action_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_action_request_proposal_uq
  ON public.ai_action_requests(source_proposal_id)
  WHERE source_proposal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_action_requests_claim_idx
  ON public.ai_action_requests(tenant_id,product_key,status,next_attempt_at,created_at);

CREATE TABLE IF NOT EXISTS public.product_action_tool_catalogue(
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  tool_key text NOT NULL,
  name text NOT NULL,
  action_kind text NOT NULL DEFAULT 'provider_action'
    CHECK(action_kind IN('read','draft','event','webhook','provider_action')),
  destination_ref text NOT NULL,
  approval_mode text NOT NULL DEFAULT 'always'
    CHECK(approval_mode IN('none','before_external_write','always')),
  required_permissions text[] NOT NULL DEFAULT '{}',
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_key,tool_key)
);

ALTER TABLE public.product_action_tool_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.product_action_tool_catalogue TO authenticated;
GRANT ALL ON public.product_action_tool_catalogue TO service_role;
CREATE POLICY "product action tool catalogue read"
ON public.product_action_tool_catalogue FOR SELECT TO authenticated
USING(active);

INSERT INTO public.product_action_tool_catalogue(
  product_key,tool_key,name,destination_ref,approval_mode,required_permissions,schema,metadata
) VALUES
(
  'dishbee','dishbee.menu.availability','Dishbee menu availability','dishbee.runtime','always',
  ARRAY['tenant.manage'],
  '{
    "type":"object",
    "required":["locationId","menuItemId","available"],
    "properties":{
      "locationId":{"type":"string","format":"uuid"},
      "menuItemId":{"type":"string","format":"uuid"},
      "available":{"type":"boolean"},
      "reason":{"type":"string","maxLength":300},
      "untilAt":{"type":["string","null"],"format":"date-time"}
    }
  }'::jsonb,
  '{"risk":"operational","effects":["86","un86"],"priceWrite":false}'::jsonb
),
(
  'dishbee','dishbee.capacity.update','Dishbee kitchen capacity control','dishbee.runtime','always',
  ARRAY['tenant.manage'],
  '{
    "type":"object",
    "required":["locationId","mode"],
    "properties":{
      "locationId":{"type":"string","format":"uuid"},
      "channelKey":{"type":["string","null"]},
      "brandId":{"type":["string","null"],"format":"uuid"},
      "mode":{"enum":["normal","busy","throttled","paused"]},
      "extraEtaMinutes":{"type":"integer","minimum":0,"maximum":180},
      "orderIntervalSeconds":{"type":"integer","minimum":0,"maximum":3600},
      "reason":{"type":"string","maxLength":300},
      "endsAt":{"type":["string","null"],"format":"date-time"}
    }
  }'::jsonb,
  '{"risk":"operational","effects":["busy_mode","eta","throttle","pause"],"paymentWrite":false}'::jsonb
),
(
  'dishbee','dishbee.promotion.draft','Dishbee promotion draft','dishbee.runtime','always',
  ARRAY['tenant.manage'],
  '{
    "type":"object",
    "required":["name","discountType","discountValue"],
    "properties":{
      "locationId":{"type":["string","null"],"format":"uuid"},
      "brandId":{"type":["string","null"],"format":"uuid"},
      "name":{"type":"string","minLength":2,"maxLength":160},
      "code":{"type":["string","null"],"maxLength":80},
      "discountType":{"enum":["percent","fixed","free_item","bundle"]},
      "discountValue":{"type":"integer","minimum":0},
      "minSpendPence":{"type":"integer","minimum":0},
      "startsAt":{"type":["string","null"],"format":"date-time"},
      "endsAt":{"type":["string","null"],"format":"date-time"},
      "channels":{"type":"array","items":{"type":"string"},"maxItems":20}
    }
  }'::jsonb,
  '{"risk":"commercial","draftOnly":true,"autoPublish":false}'::jsonb
)
ON CONFLICT(product_key,tool_key) DO UPDATE SET
  name=EXCLUDED.name,
  destination_ref=EXCLUDED.destination_ref,
  approval_mode=EXCLUDED.approval_mode,
  required_permissions=EXCLUDED.required_permissions,
  schema=EXCLUDED.schema,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE OR REPLACE FUNCTION public.ensure_product_action_tool_binding(
  _tenant uuid,
  _product text,
  _tool_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  c public.product_action_tool_catalogue%rowtype;
  result uuid;
BEGIN
  SELECT * INTO c
  FROM public.product_action_tool_catalogue
  WHERE product_key=_product AND tool_key=_tool_key AND active;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_tool_bindings(
    tenant_id,product_key,tool_key,name,action_kind,destination_ref,
    required_permissions,approval_mode,schema,config,active
  ) VALUES(
    _tenant,_product,c.tool_key,c.name,c.action_kind,c.destination_ref,
    c.required_permissions,c.approval_mode,c.schema,
    jsonb_build_object('catalogueManaged',true,'metadata',c.metadata),true
  )
  ON CONFLICT(tenant_id,product_key,tool_key) DO UPDATE SET
    name=EXCLUDED.name,
    action_kind=EXCLUDED.action_kind,
    destination_ref=EXCLUDED.destination_ref,
    required_permissions=EXCLUDED.required_permissions,
    approval_mode=EXCLUDED.approval_mode,
    schema=EXCLUDED.schema,
    config=EXCLUDED.config,
    active=true,
    updated_at=now()
  RETURNING id INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_product_action_tool_binding(uuid,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_product_action_tool_binding(uuid,text,text)
TO service_role;

CREATE OR REPLACE FUNCTION public.queue_approved_action_proposal(
  _proposal uuid,
  _actor_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  p public.ai_action_proposals%rowtype;
  binding_id uuid;
  request_id uuid;
  actor_uuid uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO p
  FROM public.ai_action_proposals
  WHERE id=_proposal
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Action proposal not found'; END IF;
  IF p.status<>'approved' THEN RAISE EXCEPTION 'Action proposal must be approved'; END IF;

  IF p.action_request_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'queued',true,
      'actionRequestId',p.action_request_id,
      'duplicate',true
    );
  END IF;

  binding_id:=public.ensure_product_action_tool_binding(
    p.tenant_id,p.product_key,p.action_key
  );

  IF binding_id IS NULL THEN
    RETURN jsonb_build_object(
      'queued',false,
      'supported',false,
      'reason','approved_action_not_in_product_tool_allowlist'
    );
  END IF;

  BEGIN
    actor_uuid:=replace(COALESCE(_actor_ref,''),'dishbee-user:','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    actor_uuid:=NULL;
  END;

  INSERT INTO public.ai_action_requests(
    tenant_id,product_key,tool_binding_id,action_type,subject_type,subject_id,
    proposed_payload,status,requested_by,reviewed_by,reviewed_at,
    source_proposal_id,next_attempt_at
  ) VALUES(
    p.tenant_id,p.product_key,binding_id,p.action_key,p.target_type,p.target_id,
    p.payload,'approved','ai-proposal:'||p.id::text,actor_uuid,now(),
    p.id,now()
  )
  ON CONFLICT(source_proposal_id) DO UPDATE SET
    reviewed_by=COALESCE(public.ai_action_requests.reviewed_by,EXCLUDED.reviewed_by),
    reviewed_at=COALESCE(public.ai_action_requests.reviewed_at,EXCLUDED.reviewed_at),
    updated_at=now()
  RETURNING id INTO request_id;

  UPDATE public.ai_action_proposals
  SET action_request_id=request_id
  WHERE id=p.id;

  RETURN jsonb_build_object(
    'queued',true,
    'supported',true,
    'actionRequestId',request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.queue_approved_action_proposal(uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_approved_action_proposal(uuid,text)
TO service_role;

CREATE OR REPLACE FUNCTION public.claim_product_action_requests(
  _tenant uuid,
  _product text,
  _destination text,
  _worker text,
  _limit integer DEFAULT 20
) RETURNS SETOF public.ai_action_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  RETURN QUERY
  WITH claimed AS(
    SELECT a.id
    FROM public.ai_action_requests a
    JOIN public.ai_tool_bindings b ON b.id=a.tool_binding_id
    WHERE a.tenant_id=_tenant
      AND a.product_key=_product
      AND a.status IN('approved','failed')
      AND a.next_attempt_at<=now()
      AND a.attempts<8
      AND (a.locked_at IS NULL OR a.locked_at<now()-interval '10 minutes')
      AND b.active
      AND b.destination_ref=_destination
      AND b.approval_mode IN('always','before_external_write')
    ORDER BY a.created_at
    FOR UPDATE OF a SKIP LOCKED
    LIMIT GREATEST(1,LEAST(COALESCE(_limit,20),100))
  )
  UPDATE public.ai_action_requests a
  SET status='executing',
      attempts=a.attempts+1,
      locked_at=now(),
      locked_by=_worker,
      updated_at=now()
  FROM claimed c
  WHERE a.id=c.id
  RETURNING a.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_product_action_requests(uuid,text,text,text,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_product_action_requests(uuid,text,text,text,integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.finish_product_action_request(
  _action uuid,
  _success boolean,
  _execution_ref text DEFAULT NULL,
  _result jsonb DEFAULT '{}'::jsonb,
  _error text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  a public.ai_action_requests%rowtype;
  final_status text;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO a
  FROM public.ai_action_requests
  WHERE id=_action
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'AI action request not found'; END IF;
  IF a.status<>'executing' THEN RAISE EXCEPTION 'AI action request is not executing'; END IF;

  final_status:=CASE
    WHEN _success THEN 'succeeded'
    WHEN a.attempts>=8 THEN 'failed'
    ELSE 'failed'
  END;

  UPDATE public.ai_action_requests
  SET status=final_status,
      execution_ref=NULLIF(trim(_execution_ref),''),
      execution_result=COALESCE(_result,'{}'::jsonb),
      error_message=CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'action_execution_failed'),2000) END,
      next_attempt_at=CASE
        WHEN _success OR a.attempts>=8 THEN next_attempt_at
        ELSE now()+make_interval(mins=>LEAST(60,GREATEST(1,2^LEAST(a.attempts,5))))
      END,
      locked_at=NULL,
      locked_by=NULL,
      updated_at=now()
  WHERE id=a.id;

  IF a.source_proposal_id IS NOT NULL THEN
    UPDATE public.ai_action_proposals
    SET status=CASE
          WHEN _success THEN 'executed'
          WHEN a.attempts>=8 THEN 'failed'
          ELSE 'approved'
        END,
        executed_at=CASE WHEN _success THEN now() ELSE executed_at END,
        execution_result=COALESCE(_result,'{}'::jsonb)
          || CASE WHEN _success THEN '{}'::jsonb ELSE jsonb_build_object('lastError',left(COALESCE(_error,'action_execution_failed'),1000)) END
    WHERE id=a.source_proposal_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_product_action_request(uuid,boolean,text,jsonb,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_product_action_request(uuid,boolean,text,jsonb,text)
TO service_role;

-- Existing Dishbee product connections need the additional governed-action scopes.
UPDATE public.product_connections
SET capabilities=(
  SELECT ARRAY(
    SELECT DISTINCT cap
    FROM unnest(
      COALESCE(capabilities,'{}'::text[])
      || ARRAY[
        'intelligence.run.start',
        'intelligence.run.read',
        'intelligence.action.review',
        'intelligence.action.claim',
        'intelligence.action.finish'
      ]::text[]
    ) cap
    ORDER BY cap
  )
),
updated_at=now()
WHERE product_key='dishbee';

-- Future Dishbee links always receive the bounded intelligence runtime scopes.
CREATE OR REPLACE FUNCTION public.platform_link_product(
  _tenant uuid,
  _product text,
  _external_tenant_id text,
  _base_url text DEFAULT NULL,
  _capabilities text[] DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  result uuid;
  effective_capabilities text[];
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;
  IF length(COALESCE(_external_tenant_id,''))<1 THEN
    RAISE EXCEPTION 'External tenant ID required';
  END IF;

  effective_capabilities:=COALESCE(_capabilities,'{}'::text[]);
  IF _product='dishbee' THEN
    effective_capabilities:=(
      SELECT ARRAY(
        SELECT DISTINCT cap
        FROM unnest(
          effective_capabilities
          || ARRAY[
            'intelligence.run.start',
            'intelligence.run.read',
            'intelligence.action.review',
            'intelligence.action.claim',
            'intelligence.action.finish'
          ]::text[]
        ) cap
        ORDER BY cap
      )
    );
  END IF;

  INSERT INTO public.product_connections(
    tenant_id,product_key,external_tenant_id,base_url,status,capabilities
  ) VALUES(
    _tenant,_product,_external_tenant_id,_base_url,'configured',effective_capabilities
  )
  ON CONFLICT(tenant_id,product_key,external_tenant_id)
  DO UPDATE SET
    base_url=EXCLUDED.base_url,
    capabilities=EXCLUDED.capabilities,
    status='configured',
    updated_at=now()
  RETURNING id INTO result;

  INSERT INTO public.tenant_products(
    tenant_id,product_key,status,external_tenant_id,base_url
  ) VALUES(
    _tenant,_product,'provisioning',_external_tenant_id,_base_url
  )
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET
    external_tenant_id=EXCLUDED.external_tenant_id,
    base_url=EXCLUDED.base_url,
    status=CASE WHEN public.tenant_products.status='active' THEN 'active' ELSE 'provisioning' END,
    updated_at=now();

  PERFORM public.queue_provisioning(
    _tenant,'integration',_product||':'||_external_tenant_id,'verify',
    jsonb_build_object(
      'productKey',_product,
      'externalTenantId',_external_tenant_id,
      'baseUrl',_base_url,
      'capabilities',effective_capabilities
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_link_product(uuid,text,text,text,text[])
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_link_product(uuid,text,text,text,text[])
TO authenticated,service_role;

COMMIT;
