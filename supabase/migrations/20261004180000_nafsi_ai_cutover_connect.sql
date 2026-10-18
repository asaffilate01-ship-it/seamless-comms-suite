-- Nafsi Phase 29-30: release-bound Intelligence authority metadata and a
-- privacy-minimal, consent-gated Omniqora Connect event queue.
BEGIN;

ALTER TABLE public.communication_events
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

ALTER TABLE public.communication_events DROP CONSTRAINT IF EXISTS nafsi_connect_to_source_privacy;
ALTER TABLE public.communication_events ADD CONSTRAINT nafsi_connect_to_source_privacy CHECK (
  product_key<>'nafsi' OR direction<>'connect_to_source' OR (
    COALESCE(recipient,'{}'::jsonb) ? 'contactRef'
    AND NOT (COALESCE(recipient,'{}'::jsonb) ?| ARRAY['phone','name','email'])
    AND NOT (COALESCE(message,'{}'::jsonb) ?| ARRAY['body','text','prompt','journal','mood','transcript'])
  )
);

CREATE INDEX IF NOT EXISTS communication_events_claim_idx
  ON public.communication_events(tenant_id,product_key,direction,status,available_at,created_at);

CREATE OR REPLACE FUNCTION public.claim_nafsi_connect_events(
  p_tenant_id uuid,
  p_external_tenant_id text,
  p_limit integer DEFAULT 25
) RETURNS SETOF public.communication_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.communication_events
    WHERE tenant_id=p_tenant_id AND product_key='nafsi'
      AND external_tenant_id=p_external_tenant_id
      AND direction='connect_to_source'
      AND available_at<=now()
      AND (status='queued' OR (status='processing' AND claimed_at<now()-interval '5 minutes'))
      AND attempts<8
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit,1),100)
  )
  UPDATE public.communication_events event SET
    status='processing',attempts=event.attempts+1,claimed_at=now(),updated_at=now()
  FROM claimed WHERE event.id=claimed.id
  RETURNING event.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_nafsi_connect_events(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_nafsi_connect_events(uuid,text,integer) TO service_role;

UPDATE public.product_services SET metadata=metadata || jsonb_build_object(
  'authorityControls',jsonb_build_object(
    'modes',jsonb_build_array('disabled','shadow','canary','active'),
    'maximumInitialCanaryPercent',25,
    'exactReleaseEvidence',true,
    'emergencyRollback',true
  ),
  'liveRoute','/api/control-plane/nafsi/intelligence'
) WHERE product_key='nafsi' AND service_key='omniqora.ai';

UPDATE public.product_services SET metadata=metadata || jsonb_build_object(
  'connectRoute','/api/control-plane/nafsi/connect',
  'connectEventRoute','/api/control-plane/nafsi/connect-events',
  'consentMode','explicit_double_opt_in',
  'commands',jsonb_build_array('START','STOP','HELP'),
  'approvedTemplatesOnly',true,
  'rawWellbeingChatSync',false
) WHERE product_key='nafsi' AND service_key='omniqora.connect';

UPDATE public.blueprint_services SET config=config || jsonb_build_object(
  'pilotMode',true,
  'defaultEnabled',false,
  'requiresConsentEvidence',true,
  'templates',jsonb_build_array(
    'nafsi_whatsapp_opt_in_v1','nafsi_reminder_v1','nafsi_reviewed_dua_v1',
    'nafsi_account_link_v1','nafsi_support_link_v1'
  )
) WHERE blueprint_key='nafsi-gb-consumer' AND service_key='omniqora.connect';

COMMIT;
