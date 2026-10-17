-- Activate the next governed Nafsi integration stages without changing data authority.
BEGIN;

UPDATE public.product_catalogue
SET metadata = metadata || jsonb_build_object(
  'integrationStage','shadow_intelligence_and_signed_events',
  'intelligenceCapabilities',jsonb_build_array('daily-plan','flow-ai-slot','weekly-report'),
  'eventProtocol','oqcp-hmac-v1'
), updated_at=now()
WHERE product_key='nafsi';

UPDATE public.product_services
SET metadata = metadata || jsonb_build_object(
  'mode','shadow',
  'route','/api/control-plane/nafsi/intelligence-shadow',
  'persistDraftText',false,
  'requiresHumanParityReview',true
)
WHERE product_key='nafsi' AND service_key='omniqora.ai';

UPDATE public.product_services
SET metadata = metadata || jsonb_build_object(
  'eventRoute','/api/control-plane/nafsi/events',
  'signatureProtocol','oqcp-hmac-v1',
  'replayWindowSeconds',300,
  'dataClass','operational_metadata_only'
)
WHERE product_key='nafsi' AND service_key='nafsi.core';

UPDATE public.blueprint_services
SET config = config || jsonb_build_object(
  'capabilities',jsonb_build_array('daily-plan','flow-ai-slot','weekly-report'),
  'requiresParityEvidence',true
)
WHERE blueprint_key='nafsi-gb-consumer' AND service_key='omniqora.ai';

COMMIT;
