BEGIN;

-- Customer-facing product name and authoritative runtime are separate concepts.
-- Dishbee One/Stay run on the Dishbee workspace. Dishbee+ remains an independent
-- marketplace product connection even though it belongs to the Dishbee brand family.

UPDATE public.product_catalogue
SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
  'runtimeProductKey','dishbee',
  'runtimeRepository','asaffilate01-ship-it/dishbee-helper'
),updated_at=now()
WHERE product_key IN('dishbee','dishbee-one','dishbee-stay');

UPDATE public.product_catalogue
SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
  'runtimeProductKey','dishbee-plus',
  'runtimeRepository','asaffilate01-ship-it/onyn'
),updated_at=now()
WHERE product_key='dishbee-plus';

UPDATE public.product_catalogue
SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
  'runtimeProductKey','haccora',
  'runtimeRepository','asaffilate01-ship-it/haccora-connect'
),updated_at=now()
WHERE product_key='haccora';

COMMIT;
