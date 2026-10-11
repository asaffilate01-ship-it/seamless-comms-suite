-- Preserve multi-message Twilio reception transcripts atomically and idempotently.
-- Restrict receipt writes to service role after validating Twilio's signed callback.
BEGIN;

CREATE TABLE IF NOT EXISTS public.twilio_reception_message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.reception_sessions(id) ON DELETE CASCADE,
  provider_account_sid text NOT NULL CHECK(provider_account_sid ~ '^AC[a-fA-F0-9]{32}$'),
  provider_message_sid text NOT NULL CHECK(provider_message_sid ~ '^(SM|MM)[a-fA-F0-9]{32}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_account_sid,provider_message_sid)
);
CREATE INDEX IF NOT EXISTS twilio_reception_message_receipts_session_idx
 ON public.twilio_reception_message_receipts(tenant_id,session_id,received_at DESC);
ALTER TABLE public.twilio_reception_message_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.twilio_reception_message_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.twilio_reception_message_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.server_append_twilio_reception_message(
 _session uuid,_account_sid text,_message_sid text,_body text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 current_session public.reception_sessions%rowtype;
 receipt_id uuid;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'') <> 'service_role' THEN
   RAISE EXCEPTION 'Service role required';
 END IF;
 IF _account_sid !~ '^AC[a-fA-F0-9]{32}$' OR
    _message_sid !~ '^(SM|MM)[a-fA-F0-9]{32}$' OR
    length(COALESCE(_body,'')) > 4096 THEN
   RAISE EXCEPTION 'Invalid reception message';
 END IF;
 SELECT * INTO current_session FROM public.reception_sessions
 WHERE id=_session AND provider='twilio' AND channel IN ('sms','whatsapp')
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reception session is unavailable'; END IF;

 INSERT INTO public.twilio_reception_message_receipts(
  tenant_id,session_id,provider_account_sid,provider_message_sid
 ) VALUES(
  current_session.tenant_id,_session,_account_sid,_message_sid
 ) ON CONFLICT(provider_account_sid,provider_message_sid) DO NOTHING
 RETURNING id INTO receipt_id;
 IF receipt_id IS NULL THEN RETURN false; END IF;

 UPDATE public.reception_sessions SET
  transcript=COALESCE(transcript,'[]'::jsonb) ||
   jsonb_build_array(jsonb_build_object(
     'direction','inbound',
     'body',COALESCE(_body,''),
     'messageSid',_message_sid,
     'at',now()
   )),
  intent='order',
  updated_at=now()
 WHERE id=_session AND tenant_id=current_session.tenant_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.server_append_twilio_reception_message(
 uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_append_twilio_reception_message(
 uuid,text,text,text) TO service_role;

COMMIT;
