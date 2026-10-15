-- Additional inbound-UK market site launch templates on TraveNexa, not four separate travel SaaS backends.
-- Operated under the UK trading entity by default; country is a TARGET MARKET, not automatically a locally incorporated company.
-- Provider API connectivity, payment methods, domains, licensed ground transport and regulated travel sales remain blocked pending approval.
BEGIN;

INSERT INTO public.service_catalogue
(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata)
VALUES
 ('travenexa.inbound-uk','Inbound UK Travel','Dedicated inbound-to-United-Kingdom offer discovery, inventory and local journey experience.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-external-adapter","available":false}'::jsonb),
 ('travenexa.local-sites','Local-Market Travel Storefronts','Source-market-specific storefront tenancy, translated content, SEO, brand rules and native-feeling mobile UX.','platform','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-external-adapter","available":false}'::jsonb),
 ('travenexa.ground-transport','UK Ground Transport','Airport pickup, intercity chauffeur, private car, minibus and local transport quote/booking via approved operators.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-external-adapter","available":false}'::jsonb),
 ('travenexa.rail-coach','UK Rail & Coach','UK train, bus and coach discovery and affiliate/approved ticket fulfilment.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-external-adapter","available":false}'::jsonb),
 ('travenexa.market-payments','Market Payment Methods','Market-appropriate payment presentation, currency handling, FX disclosure and approved payment acceptance.','payments','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-external-adapter","available":false}'::jsonb),
 ('travenexa.trip-builder','UK Trip Builder','Multi-service travel itineraries, arrival details, booking references and concierge assistance.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-external-adapter","available":false}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,family=excluded.family,owner_product_key=excluded.owner_product_key,
 billable=excluded.billable,provisioning_mode=excluded.provisioning_mode,
 status=excluded.status,implementation_status=excluded.implementation_status,
 metadata=excluded.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required)
VALUES
 ('travenexa.inbound-uk','travenexa.core',true),
 ('travenexa.local-sites','travenexa.white-label',true),
 ('travenexa.local-sites','travenexa.inbound-uk',true),
 ('travenexa.ground-transport','travenexa.provider-connectors',true),
 ('travenexa.rail-coach','travenexa.provider-connectors',true),
 ('travenexa.market-payments','travenexa.core',true),
 ('travenexa.market-payments','omniqora.payments',true),
 ('travenexa.trip-builder','travenexa.inbound-uk',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=excluded.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES
 ('travenexa','travenexa.inbound-uk',false,false,'{"scope":"optional-uk-inbound-surface","live":false}'::jsonb),
 ('travenexa','travenexa.local-sites',false,false,'{"scope":"optional-uk-inbound-surface","live":false}'::jsonb),
 ('travenexa','travenexa.ground-transport',false,false,'{"scope":"optional-uk-inbound-surface","live":false}'::jsonb),
 ('travenexa','travenexa.rail-coach',false,false,'{"scope":"optional-uk-inbound-surface","live":false}'::jsonb),
 ('travenexa','travenexa.market-payments',false,false,'{"scope":"optional-uk-inbound-surface","live":false}'::jsonb),
 ('travenexa','travenexa.trip-builder',false,false,'{"scope":"optional-uk-inbound-surface","live":false}'::jsonb)
ON CONFLICT(product_key,service_key) DO UPDATE SET metadata=excluded.metadata;

INSERT INTO public.product_workspace_types
(product_key,workspace_type,name,description,system_workspace,allow_multiple,default_services,metadata)
VALUES
('travenexa','inbound_uk_site','Inbound UK country storefront','Source market is defined in each blueprint; shared TraveNexa API supplies UK-only destination products.',false,true,
 ARRAY['travenexa.core','travenexa.inbound-uk','travenexa.local-sites','travenexa.transfers','travenexa.ground-transport','travenexa.hotel-search','travenexa.activities'],
 '{"sourceMarketConfig":true,"destinationCountry":"GB","isSeparateSaaSLandlord":false,"siteDomains":"ownership-and-routing-verification-required","merchantJurisdiction":"GB-default-review-required","humanReviewOfBookings":true}'::jsonb)
ON CONFLICT(product_key,workspace_type) DO UPDATE SET
 name=excluded.name,description=excluded.description,system_workspace=excluded.system_workspace,
 allow_multiple=excluded.allow_multiple,default_services=excluded.default_services,
 metadata=excluded.metadata,updated_at=now();

-- The country_code here describes the default legal/operating jurisdiction (GB).
-- Source-country markets are explicit metadata and blueprint_products config values.
INSERT INTO public.tenant_blueprints
(blueprint_key,name,description,country_code,category,status,metadata)
VALUES
 ('travenexa.uk-inbound.kr','South Korea → UK','Localised UK travel marketplace for customers resident in KR, backed by TraveNexa.','GB','travel','active','{"workspaceType":"inbound_uk_site","sourceMarket":"KR","operatingCountry":"GB","destinationCountry":"GB","locale":"ko-KR","presentationCurrency":"KRW","timezone":"Asia/Seoul","siteBrandKey":"uk-inbound-korea","brandName":"UK Travel Korea (working name)","brandStatus":"working-title-only","suggestedPayments":["card","kakaopay","naverpay","toss"],"paymentStatus":"requires-acquirer-approval","legalReview":["KR-PIPA","UK-GDPR","GB-PTR"],"marketingChannels":["Naver","KakaoTalk","Google"],"domainStatus":"not-registered-or-verified","backendProductKey":"travenexa","supplierBookingStatus":"not-connected"}'::jsonb),
 ('travenexa.uk-inbound.jp','Japan → UK','Localised UK travel marketplace for customers resident in JP, backed by TraveNexa.','GB','travel','active','{"workspaceType":"inbound_uk_site","sourceMarket":"JP","operatingCountry":"GB","destinationCountry":"GB","locale":"ja-JP","presentationCurrency":"JPY","timezone":"Asia/Tokyo","siteBrandKey":"uk-inbound-japan","brandName":"UK Travel Japan (working name)","brandStatus":"working-title-only","suggestedPayments":["card","jcb","paypay"],"paymentStatus":"requires-acquirer-approval","legalReview":["JP-APPI","UK-GDPR","GB-PTR"],"marketingChannels":["Google","Yahoo-Japan","LINE"],"domainStatus":"not-registered-or-verified","backendProductKey":"travenexa","supplierBookingStatus":"not-connected"}'::jsonb),
 ('travenexa.uk-inbound.cn','China → UK','Localised UK travel marketplace for customers resident in CN, backed by TraveNexa.','GB','travel','active','{"workspaceType":"inbound_uk_site","sourceMarket":"CN","operatingCountry":"GB","destinationCountry":"GB","locale":"zh-CN","presentationCurrency":"CNY","timezone":"Asia/Shanghai","siteBrandKey":"uk-inbound-china","brandName":"UK Travel China (working name)","brandStatus":"working-title-only","suggestedPayments":["card","alipay","wechatpay","unionpay"],"paymentStatus":"requires-acquirer-approval","legalReview":["CN-PIPL","CN-ICP-if-hosted-or-delivered-in-mainland","UK-GDPR","GB-PTR"],"marketingChannels":["Baidu","WeChat","Xiaohongshu"],"domainStatus":"not-registered-or-verified","backendProductKey":"travenexa","supplierBookingStatus":"not-connected"}'::jsonb),
 ('travenexa.uk-inbound.us','United States → UK','Localised UK travel marketplace for customers resident in US, backed by TraveNexa.','GB','travel','active','{"workspaceType":"inbound_uk_site","sourceMarket":"US","operatingCountry":"GB","destinationCountry":"GB","locale":"en-US","presentationCurrency":"USD","timezone":"America/New_York","siteBrandKey":"uk-inbound-usa","brandName":"UK Travel USA (working name)","brandStatus":"working-title-only","suggestedPayments":["card","applepay","googlepay"],"paymentStatus":"requires-acquirer-approval","legalReview":["US-state-privacy","UK-GDPR","GB-PTR"],"marketingChannels":["Google","Instagram","YouTube"],"domainStatus":"not-registered-or-verified","backendProductKey":"travenexa","supplierBookingStatus":"not-connected"}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,country_code=excluded.country_code,
 category=excluded.category,status=excluded.status,metadata=excluded.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES
 ('travenexa.uk-inbound.kr','travenexa',true,'{"workspaceType":"inbound_uk_site","brandKey":"uk-inbound-korea","sourceMarket":"KR","destinationMarket":"GB","locale":"ko-KR","presentationCurrency":"KRW","timezone":"Asia/Seoul","supplierScope":"UK_ONLY","supplierAgreement":"required_before-activation","domainStatus":"not-verified"}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa',true,'{"workspaceType":"inbound_uk_site","brandKey":"uk-inbound-japan","sourceMarket":"JP","destinationMarket":"GB","locale":"ja-JP","presentationCurrency":"JPY","timezone":"Asia/Tokyo","supplierScope":"UK_ONLY","supplierAgreement":"required_before-activation","domainStatus":"not-verified"}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa',true,'{"workspaceType":"inbound_uk_site","brandKey":"uk-inbound-china","sourceMarket":"CN","destinationMarket":"GB","locale":"zh-CN","presentationCurrency":"CNY","timezone":"Asia/Shanghai","supplierScope":"UK_ONLY","supplierAgreement":"required_before-activation","domainStatus":"not-verified"}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa',true,'{"workspaceType":"inbound_uk_site","brandKey":"uk-inbound-usa","sourceMarket":"US","destinationMarket":"GB","locale":"en-US","presentationCurrency":"USD","timezone":"America/New_York","supplierScope":"UK_ONLY","supplierAgreement":"required_before-activation","domainStatus":"not-verified"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=excluded.required,config=excluded.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES
 ('travenexa.uk-inbound.kr','travenexa.core',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.inbound-uk',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.local-sites',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.transfers',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.ground-transport',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.hotel-search',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.activities',true,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.rail-coach',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.market-payments',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.trip-builder',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.flight-search',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.flight-redirects',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.flightlounge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.car-hire',false,'{}'::jsonb),
 ('travenexa.uk-inbound.kr','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.core',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.inbound-uk',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.local-sites',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.transfers',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.ground-transport',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.hotel-search',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.activities',true,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.rail-coach',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.market-payments',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.trip-builder',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.flight-search',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.flight-redirects',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.flightlounge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.car-hire',false,'{}'::jsonb),
 ('travenexa.uk-inbound.jp','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.core',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.inbound-uk',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.local-sites',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.transfers',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.ground-transport',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.hotel-search',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.activities',true,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.rail-coach',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.market-payments',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.trip-builder',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.flight-search',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.flight-redirects',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.flightlounge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.car-hire',false,'{}'::jsonb),
 ('travenexa.uk-inbound.cn','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.core',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.inbound-uk',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.local-sites',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.transfers',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.ground-transport',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.hotel-search',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.activities',true,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.rail-coach',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.market-payments',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.trip-builder',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.flight-search',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.flight-redirects',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.flightlounge',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.car-hire',false,'{}'::jsonb),
 ('travenexa.uk-inbound.us','travenexa.ai-concierge',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=excluded.required,config=excluded.config;

-- These provider entries are only permission/credentials checklists. No active transfer, rail or coach supplier is implied.
INSERT INTO public.provider_catalogue
(provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status,metadata)
VALUES
 ('travel.omio','Omio B2B / Affiliates','travel-supplier',ARRAY['rail.search','coach.search','rail.redirect','coach.redirect'],ARRAY['GB'],ARRAY['affiliate_id','partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"approvalRequired":true,"readiness":"not-connected","purpose":"UK rail, coach and onward intercity public transport through permitted comparison, affiliate or booking partner integrations","documentation":"https://www.omio.com/corporate/omio-b2b/","operatorLicensingReview":true}'::jsonb),
 ('travel.rdg-rail','Rail Delivery Group / Accredited Retail','travel-supplier',ARRAY['rail.licensing','rail.ticketing'],ARRAY['GB'],ARRAY['licence_reference','accredited_partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"approvalRequired":true,"readiness":"not-connected","purpose":"UK National Rail retail licensing and ticket-issuing approval where TraveNexa sells rail tickets directly","documentation":"https://www.raildeliverygroup.com/our-services/retail-commercial/how-to-become-a-retailer/third-party-licences.html","operatorLicensingReview":true}'::jsonb),
 ('travel.uk-phv-partners','Licensed UK Private Hire & Transfer Operators','travel-supplier',ARRAY['transfer.quote','transfer.book','transfer.status'],ARRAY['GB'],ARRAY['partner_agreement_reference','api_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"approvalRequired":true,"readiness":"not-connected","purpose":"Approved supplier-operated airport pickup, chauffeur, intercity private hire and transfer fulfilment; does not grant the platform an operator licence","documentation":"https://www.gov.uk/operator-licence-private-hire-vehicle","operatorLicensingReview":true}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 name=excluded.name,provider_kind=excluded.provider_kind,capabilities=excluded.capabilities,
 supported_countries=excluded.supported_countries,required_secret_names=excluded.required_secret_names,
 metadata=COALESCE(public.provider_catalogue.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose,config)
VALUES
 ('travenexa','travel.omio',false,'UK rail, coach and onward intercity public transport through permitted comparison, affiliate or booking partner integrations','{"availability":"not-verified","scope":"GB"}'::jsonb),
 ('travenexa','travel.rdg-rail',false,'UK National Rail retail licensing and ticket-issuing approval where TraveNexa sells rail tickets directly','{"availability":"not-verified","scope":"GB"}'::jsonb),
 ('travenexa','travel.uk-phv-partners',false,'Approved supplier-operated airport pickup, chauffeur, intercity private hire and transfer fulfilment; does not grant the platform an operator licence','{"availability":"not-verified","scope":"GB"}'::jsonb)
ON CONFLICT(product_key,provider_key) DO UPDATE SET required=excluded.required,purpose=excluded.purpose,config=excluded.config;

COMMIT;
