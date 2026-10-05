-- Backend-readiness promotion and Reception add-on catalogue.
BEGIN;

UPDATE public.platform_modules
SET version='1.0.0-preview',status='preview',updated_at=now()
WHERE module_key=ANY(ARRAY[
 'payments.core','marketing.core','sales.core','journeys.core','feedback.core','analytics.core',
 'financials.core','creative.core','geo.core','dispatch.core','marketplace.core','mobile.core'
]::text[]);

-- Reception is a horizontal add-on for landlord SaaS products.
INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT p.product_key,'reception.core',false
FROM public.platform_products p
WHERE p.kind IN ('vertical_landlord','standalone','product_variant')
ON CONFLICT(product_key,module_key) DO NOTHING;

COMMIT;
