-- Accounts preparation AI event fanout.
BEGIN;
INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
 ('intelligence.core','accounting_ai.accounts_prep.requested')
ON CONFLICT(module_key,event_pattern) DO UPDATE SET enabled=true;
COMMIT;
