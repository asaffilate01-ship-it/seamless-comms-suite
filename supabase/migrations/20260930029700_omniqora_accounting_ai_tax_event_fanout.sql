-- Event fanout for AI Bookkeeping and Tax Intelligence.
BEGIN;

INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
 ('intelligence.core','accounting_ai.extraction.requested'),
 ('intelligence.core','tax_intelligence.research.requested'),
 ('accounting_ai.core','accounting_ai.*'),
 ('accounting_ai.core','document.*'),
 ('tax_intelligence.core','tax_intelligence.*'),
 ('tax_intelligence.core','accounting_ai.trial_balance.*'),
 ('tax_intelligence.core','document.*')
ON CONFLICT(module_key,event_pattern) DO UPDATE SET enabled=true;

COMMIT;
