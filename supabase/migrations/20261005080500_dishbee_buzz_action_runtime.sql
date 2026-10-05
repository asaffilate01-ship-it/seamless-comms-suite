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

-- No implicit tool activation or connector permission changes. Scoped execution
-- functions are defined by the following reviewed execution-hardening migration.
COMMIT;
