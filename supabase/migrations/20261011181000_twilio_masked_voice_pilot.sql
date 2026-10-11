-- Twilio masked-voice pilot. Never treat a catalogue entry as provider activation.
-- Only a platform administrator may start a short-lived routing session.
-- Participant numbers are service-role-only; tenant sessions never expose them.
BEGIN;

CREATE TABLE IF NOT EXISTS public.masked_voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  channel_id uuid NOT NULL REFERENCES public.order_intake_channels(id) ON DELETE RESTRICT,
  mask_number text NOT NULL CHECK(mask_number ~ '^\+[1-9][0-9]{7,14}$'),
  participant_a text NOT NULL CHECK(participant_a ~ '^\+[1-9][0-9]{7,14}$'),
  participant_b text NOT NULL CHECK(participant_b ~ '^\+[1-9][0-9]{7,14}$'),
  provider_account_sid text NOT NULL CHECK(provider_account_sid ~ '^AC[a-fA-F0-9]{32}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_attested_at timestamptz NOT NULL DEFAULT now(),
  CHECK(participant_a <> participant_b),
  CHECK(mask_number <> participant_a AND mask_number <> participant_b),
  CHECK(expires_at > created_at),
  CHECK(expires_at <= created_at + interval '60 minutes')
);
CREATE INDEX IF NOT EXISTS masked_voice_active_number_idx
  ON public.masked_voice_sessions(mask_number,status,expires_at);
CREATE INDEX IF NOT EXISTS masked_voice_tenant_idx
  ON public.masked_voice_sessions(tenant_id,product_key,created_at DESC);
ALTER TABLE public.masked_voice_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.masked_voice_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.masked_voice_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.masked_voice_call_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.masked_voice_sessions(id) ON DELETE CASCADE,
  provider_account_sid text NOT NULL,
  provider_call_sid text NOT NULL CHECK(provider_call_sid ~ '^CA[a-fA-F0-9]{32}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_account_sid,provider_call_sid)
);
CREATE INDEX IF NOT EXISTS masked_voice_call_receipts_tenant_idx
  ON public.masked_voice_call_receipts(tenant_id,first_seen_at DESC);
ALTER TABLE public.masked_voice_call_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.masked_voice_call_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.masked_voice_call_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.platform_create_masked_voice_session(
  _tenant uuid, _product text, _channel uuid,
  _participant_a text, _participant_b text,
  _provider_account_sid text, _ttl_minutes integer DEFAULT 30,
  _consent_attested boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  configured public.order_intake_channels%rowtype;
  created_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;
  IF _consent_attested IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Participant consent attestation required';
  END IF;
  IF _ttl_minutes NOT BETWEEN 1 AND 60 OR
    _participant_a !~ '^\+[1-9][0-9]{7,14}$' OR
    _participant_b !~ '^\+[1-9][0-9]{7,14}$' OR
    _provider_account_sid !~ '^AC[a-fA-F0-9]{32}$' OR
    _participant_a = _participant_b THEN
    RAISE EXCEPTION 'Invalid masked call parameters';
  END IF;
  -- The tenant must have both a real product and an active voice entitlement.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_products p
    WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tenant_services s
    WHERE s.tenant_id=_tenant AND s.service_key='omniqora.voice'
      AND s.status IN ('active','trial')
      AND (s.valid_until IS NULL OR s.valid_until > now())
  ) THEN RAISE EXCEPTION 'Active voice product entitlement required'; END IF;

  SELECT * INTO configured FROM public.order_intake_channels c
  WHERE c.id=_channel AND c.tenant_id=_tenant AND c.product_key=_product
    AND c.provider='twilio' AND c.channel='voice' AND c.enabled
    AND c.address ~ '^\+[1-9][0-9]{7,14}$'
    -- Explicit server-managed approval after verifying number ownership.
    AND c.routing->>'masking_mode'='enabled'
    AND c.metadata->>'twilioAccountSid'=_provider_account_sid
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved Twilio masking number is unavailable'; END IF;
  IF configured.address IN (_participant_a,_participant_b) THEN
    RAISE EXCEPTION 'Mask number cannot equal a participant';
  END IF;

  -- One active two-party session per number. Prevent cross-tenant races.
  PERFORM pg_advisory_xact_lock(hashtextextended(configured.address, 211));
  IF EXISTS (
    SELECT 1 FROM public.masked_voice_sessions m
    WHERE m.mask_number=configured.address AND m.status='active'
      AND m.expires_at > now()
  ) THEN RAISE EXCEPTION 'Mask number is already assigned'; END IF;

  INSERT INTO public.masked_voice_sessions(
    tenant_id,product_key,channel_id,mask_number,
    participant_a,participant_b,provider_account_sid,expires_at,created_by
  ) VALUES (
    _tenant,_product,_channel,configured.address,
    _participant_a,_participant_b,_provider_account_sid,
    now() + make_interval(mins=>_ttl_minutes),auth.uid()
  ) RETURNING id INTO created_id;
  RETURN created_id;
END; $$;

REVOKE ALL ON FUNCTION public.platform_create_masked_voice_session(
  uuid,text,uuid,text,text,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_create_masked_voice_session(
  uuid,text,uuid,text,text,text,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_revoke_masked_voice_session(
  _tenant uuid, _session uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;
  UPDATE public.masked_voice_sessions SET status='revoked'
  WHERE id=_session AND tenant_id=_tenant AND status='active';
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.platform_revoke_masked_voice_session(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_revoke_masked_voice_session(uuid,uuid)
  TO authenticated;

COMMIT;
