-- Product module catalogue: reusable add-ons available to landlord SaaS products,
-- plus baseline modules enabled during provisioning when no published blueprint overrides them.
BEGIN;

-- Horizontal add-ons are available (but not necessarily enabled by default) to every landlord/standalone product.
INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT p.product_key,m.module_key,false
FROM public.platform_products p
JOIN public.platform_modules m ON m.module_key = ANY(ARRAY[
 'crm.core','connect.core','intelligence.core','compliance.core','geo.core','dispatch.core',
 'marketplace.core','payments.core','journeys.core','sales.core','feedback.core','analytics.core',
 'mobile.core','documents.core','creative.core','marketing.core','financials.core','inventory.core',
 'bookings.core','loyalty.core','automation.core','forms.core','support.core','notifications.core','search.core'
]::text[])
WHERE p.kind IN ('vertical_landlord','standalone','product_variant')
ON CONFLICT(product_key,module_key) DO NOTHING;

-- Domain-specific modules are available only to products where they make sense.
INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default) VALUES
 ('dishbee','ordering.core',true),
 ('dishbee','hospitality.intelligence',true),
 ('dishbee','inventory.core',false),
 ('dishbee','bookings.core',false),
 ('dishbee','loyalty.core',false),
 ('taxcenda','practice.core',true),
 ('iq-practice-cloud','practice.core',true),
 ('regulos','practice.core',true),
 ('business360','business360.core',true),
 ('business360','transactions.core',true),
 ('regulos','business360.core',false),
 ('regulos','transactions.core',false)
ON CONFLICT(product_key,module_key) DO UPDATE
 SET enabled_by_default=EXCLUDED.enabled_by_default;

-- Baseline defaults mirrored from canonical product definitions.
INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default) VALUES
 ('dishbee','connect.core',true),('dishbee','crm.core',true),('dishbee','feedback.core',true),
 ('haccora','connect.core',true),('haccora','crm.core',true),('haccora','compliance.core',true),('haccora','intelligence.core',true),
 ('taxnuvia','crm.core',true),('taxnuvia','sales.core',true),('taxnuvia','connect.core',true),('taxnuvia','intelligence.core',true),
 ('xpertjobs','crm.core',true),('xpertjobs','sales.core',true),('xpertjobs','connect.core',true),('xpertjobs','intelligence.core',true),
 ('fleetsora','crm.core',true),('fleetsora','connect.core',true),('fleetsora','geo.core',true),('fleetsora','dispatch.core',true),('fleetsora','mobile.core',true),
 ('syndriva','marketplace.core',true),('syndriva','crm.core',true),('syndriva','connect.core',true),('syndriva','payments.core',true),('syndriva','analytics.core',true),
 ('affivon','crm.core',true),('affivon','sales.core',true),('affivon','journeys.core',true),('affivon','connect.core',true),('affivon','analytics.core',true),('affivon','marketplace.core',true),
 ('voxentri','creative.core',true),('voxentri','marketing.core',true),('voxentri','analytics.core',true),('voxentri','intelligence.core',true),
 ('tendryva','crm.core',true),('tendryva','compliance.core',true),('tendryva','intelligence.core',true),('tendryva','connect.core',true),('tendryva','sales.core',true),('tendryva','documents.core',true),
 ('taxcenda','crm.core',true),('taxcenda','practice.core',true),('taxcenda','documents.core',true),('taxcenda','payments.core',true),('taxcenda','connect.core',true),('taxcenda','analytics.core',true),('taxcenda','financials.core',true),('taxcenda','intelligence.core',true),('taxcenda','compliance.core',true),
 ('iq-practice-cloud','crm.core',true),('iq-practice-cloud','practice.core',true),('iq-practice-cloud','documents.core',true),('iq-practice-cloud','payments.core',true),('iq-practice-cloud','connect.core',true),('iq-practice-cloud','analytics.core',true),('iq-practice-cloud','financials.core',true),('iq-practice-cloud','intelligence.core',true),('iq-practice-cloud','compliance.core',true),
 ('regulos','crm.core',true),('regulos','compliance.core',true),('regulos','documents.core',true),('regulos','connect.core',true),('regulos','analytics.core',true),('regulos','financials.core',true),('regulos','intelligence.core',true),('regulos','practice.core',true),
 ('business360','crm.core',true),('business360','business360.core',true),('business360','transactions.core',true),('business360','documents.core',true),('business360','analytics.core',true),('business360','financials.core',true),('business360','intelligence.core',true),('business360','compliance.core',true),('business360','connect.core',true),
 ('zoryn-rewards','crm.core',true),('zoryn-rewards','loyalty.core',true),('zoryn-rewards','connect.core',true),('zoryn-rewards','marketing.core',true),('zoryn-rewards','journeys.core',true),('zoryn-rewards','analytics.core',true),('zoryn-rewards','intelligence.core',true)
ON CONFLICT(product_key,module_key) DO UPDATE
 SET enabled_by_default=EXCLUDED.enabled_by_default;

COMMIT;
