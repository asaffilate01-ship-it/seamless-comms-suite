-- Provider-neutral masked calling core.
-- Real participant numbers are service-role only; tenant-facing session rows retain hashes/metadata.
BEGIN;

CREATE TABLE IF NOT EXISTS public.connect_masking_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_number_ref text,
  phone_e164 text NOT NULL,
  capabilities text[] NOT NULL DEFAULT ARRAY['voice']::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, phone_e164),
  CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE INDEX IF NOT EXISTS connect_masking_numbers_scope_idx
  ON public.connect_masking_numbers (tenant_id,tenant_product_id,provider,status);

CREATE TABLE IF NOT EXISTS public.connect_masked_call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.connect_masked_call_sessions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('caller','recipient')),
  phone_e164 text NOT NULL,
  provider_participant_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id,side),
  CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE INDEX IF NOT EXISTS connect_masked_call_participant_lookup_idx
  ON public.connect_masked_call_participants (tenant_id,phone_e164,session_id);

ALTER TABLE public.connect_masking_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_masked_call_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connect_masking_numbers,public.connect_masked_call_participants FROM anon,authenticated;
GRANT ALL ON public.connect_masking_numbers,public.connect_masked_call_participants TO service_role;

CREATE OR REPLACE VIEW public.connect_masking_number_status
WITH (security_invoker = false)
AS
SELECT n.id,n.tenant_id,n.tenant_product_id,n.location_id,n.provider,n.phone_e164,n.capabilities,n.status,n.updated_at
FROM public.connect_masking_numbers n;
REVOKE ALL ON public.connect_masking_number_status FROM anon,authenticated;
GRANT ALL ON public.connect_masking_number_status TO service_role;

CREATE OR REPLACE FUNCTION public.create_masked_call_session(
  _tenant uuid,
  _tenant_product uuid,
  _location uuid,
  _provider text,
  _caller text,
  _recipient text,
  _context_type text,
  _context_id text,
  _expires_at timestamptz,
  _recording_policy text DEFAULT 'disabled',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chosen public.connect_masking_numbers;
  sid uuid;
BEGIN
  IF _caller !~ '^\+[1-9][0-9]{6,14}$' OR _recipient !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_e164_number';
  END IF;
  IF _caller = _recipient THEN RAISE EXCEPTION 'participants_must_differ'; END IF;
  IF _expires_at <= now() OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'invalid_masking_expiry';
  END IF;
  IF _recording_policy NOT IN ('disabled','provider_default','tenant_policy') THEN
    RAISE EXCEPTION 'invalid_recording_policy';
  END IF;

  SELECT n.* INTO chosen
  FROM public.connect_masking_numbers n
  WHERE n.tenant_id=_tenant
    AND (n.tenant_product_id IS NULL OR n.tenant_product_id=_tenant_product)
    AND (n.location_id IS NULL OR n.location_id=_location)
    AND n.provider=_provider
    AND n.status='active'
    AND 'voice'=ANY(n.capabilities)
    AND NOT EXISTS (
      SELECT 1
      FROM public.connect_masked_call_sessions s
      JOIN public.connect_masked_call_participants p ON p.session_id=s.id
      WHERE s.proxy_number=n.phone_e164
        AND s.state IN ('reserved','active')
        AND s.expires_at>now()
        AND p.phone_e164 IN (_caller,_recipient)
    )
  ORDER BY (
    SELECT count(*) FROM public.connect_masked_call_sessions s
    WHERE s.proxy_number=n.phone_e164 AND s.state IN ('reserved','active') AND s.expires_at>now()
  ), n.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_masking_number_available'; END IF;

  INSERT INTO public.connect_masked_call_sessions(
    tenant_id,tenant_product_id,location_id,provider,proxy_number,caller_hash,recipient_hash,
    context_type,context_id,recording_policy,state,expires_at,metadata
  ) VALUES (
    _tenant,_tenant_product,_location,_provider,chosen.phone_e164,
    encode(digest(_caller,'sha256'),'hex'),encode(digest(_recipient,'sha256'),'hex'),
    _context_type,_context_id,_recording_policy,'reserved',_expires_at,COALESCE(_metadata,'{}'::jsonb)
  ) RETURNING id INTO sid;

  INSERT INTO public.connect_masked_call_participants(session_id,tenant_id,side,phone_e164)
  VALUES(sid,_tenant,'caller',_caller),(sid,_tenant,'recipient',_recipient);

  RETURN jsonb_build_object('id',sid,'proxyNumber',chosen.phone_e164,'provider',_provider,'status','reserved');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_masked_call_target(
  _provider text,
  _proxy_number text,
  _from text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.connect_masked_call_sessions;
  p public.connect_masked_call_participants;
  target public.connect_masked_call_participants;
BEGIN
  SELECT cs.* INTO s
  FROM public.connect_masked_call_sessions cs
  JOIN public.connect_masked_call_participants cp ON cp.session_id=cs.id
  WHERE cs.provider=_provider
    AND cs.proxy_number=_proxy_number
    AND cs.state IN ('reserved','active')
    AND cs.expires_at>now()
    AND cp.phone_e164=_from
  ORDER BY cs.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'masked_session_not_found'; END IF;

  SELECT * INTO p FROM public.connect_masked_call_participants
    WHERE session_id=s.id AND phone_e164=_from LIMIT 1;
  SELECT * INTO target FROM public.connect_masked_call_participants
    WHERE session_id=s.id AND side<>p.side LIMIT 1;

  IF target.id IS NULL THEN RAISE EXCEPTION 'masked_target_not_found'; END IF;

  UPDATE public.connect_masked_call_sessions
    SET state='active',started_at=COALESCE(started_at,now()),updated_at=now()
    WHERE id=s.id;

  RETURN jsonb_build_object(
    'sessionId',s.id,
    'tenantId',s.tenant_id,
    'tenantProductId',s.tenant_product_id,
    'locationId',s.location_id,
    'target',target.phone_e164,
    'proxyNumber',s.proxy_number,
    'recordingPolicy',s.recording_policy,
    'contextType',s.context_type,
    'contextId',s.context_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_masked_call_session(_session uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.connect_masked_call_sessions
  SET state='completed',ended_at=COALESCE(ended_at,now()),updated_at=now()
  WHERE id=_session AND state IN ('reserved','active');
$$;

REVOKE EXECUTE ON FUNCTION public.create_masked_call_session(uuid,uuid,uuid,text,text,text,text,text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_masked_call_target(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.close_masked_call_session(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_masked_call_session(uuid,uuid,uuid,text,text,text,text,text,timestamptz,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_masked_call_target(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_masked_call_session(uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto') THEN
    RAISE EXCEPTION 'pgcrypto extension required for masked calling';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.connect_masking_numbers';
  EXECUTE 'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.connect_masking_numbers FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()';
END $$;

COMMIT;