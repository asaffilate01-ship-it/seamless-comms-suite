-- TraveNexa is the travel-tech landlord within Omniqora SaaS Factory.
-- FlightLounge, BestFares BestRates and MarocWays are travel tenants/brands, not duplicate platform landlords.
-- This is catalogue registration only: no supplier credentials, external code, tenant workspaces or live bookings are activated.
BEGIN;

INSERT INTO public.product_catalogue
(product_key,name,description,category,product_role,deployment_mode,default_base_url,status,implementation_status,metadata)
VALUES
('travenexa','TraveNexa','Multi-tenant travel technology and travel supplier orchestration landlord.','travel','landlord','external',NULL,'beta','external_product',
 '{"brandArchitecture":"landlord-with-white-label-travel-tenants","canonicalSource":"not-yet-confirmed","tenantBrands":["FlightLounge","BestFares BestRates","MarocWays"],"supplierStatus":"access-and-adapters-pending","supplierCredentials":"server-side-vault-only"}'::jsonb)
ON CONFLICT(product_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,category=excluded.category,
 product_role=excluded.product_role,deployment_mode=excluded.deployment_mode,
 status=excluded.status,implementation_status=excluded.implementation_status,
 metadata=COALESCE(public.product_catalogue.metadata,'{}'::jsonb) || excluded.metadata,
 updated_at=now();

INSERT INTO public.service_catalogue
(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata)
VALUES
 ('travenexa.core','TraveNexa Core','Tenant-isolated travel technology, offers, brands, trips and lifecycle management.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.provider-connectors','Travel Supplier Connector Hub','Scoped supplier adapters, secrets, entitlement checks, request budgets, response normalization and webhooks.','integration','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.flight-search','Flight Search & Comparison','Flights search, offer normalization, fare rules, live-versus-indicative indicators and provider comparison.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.flight-redirects','Flight Affiliate Redirects','Tracked metasearch redirect, attribution, consented referral reporting and commission reconciliation.','affiliate','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.flight-booking','Flight Direct Booking','Repriced flight offers, booking, confirmation, changes, refunds and settlement; only with approved suppliers and travel compliance.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.flightlounge','FlightLounge','Premium flight discovery frontend and tenant-scoped flight API surface on shared TraveNexa connectors.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.hotel-search','Accommodation Search','Accommodation discovery, availability, rates and external or approved integrated booking paths.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.car-hire','Car Hire','Compare car rentals and hand off or book through approved provider flows.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.activities','Tours & Activities','Discover and refer or book tours and destination experiences via approved partners.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.transfers','Airport Transfers','Airport transfer comparison, referrals and approved booking integrations.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.esim','Travel eSIM','Partner eSIM referral and fulfilment integration.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.price-alerts','Fare & Price Alerts','Consent-based saved searches, deal alerts and price notifications with stale-price protection.','travel','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.white-label','White-label Travel Tenants','Tenant-branded travel sites, custom domains, locale and commercial rules without duplicate supplier adapters.','platform','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb),
 ('travenexa.ai-concierge','Travel AI Concierge','Omniqora-governed assistance for trip planning, saved itineraries and customer support; approvals for bookings and money movement.','ai','travenexa',true,'external','beta','external_product','{"systemOfRecord":"travenexa","runtimeGate":"requires-verified-product-connection","available":false}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,family=excluded.family,
 owner_product_key=excluded.owner_product_key,billable=excluded.billable,
 provisioning_mode=excluded.provisioning_mode,status=excluded.status,
 implementation_status=excluded.implementation_status,metadata=excluded.metadata,
 updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required)
VALUES
 ('travenexa.provider-connectors','travenexa.core',true),
 ('travenexa.flight-search','travenexa.provider-connectors',true),
 ('travenexa.flight-redirects','travenexa.flight-search',true),
 ('travenexa.flight-booking','travenexa.flight-search',true),
 ('travenexa.flightlounge','travenexa.flight-search',true),
 ('travenexa.flightlounge','travenexa.flight-redirects',true),
 ('travenexa.hotel-search','travenexa.provider-connectors',true),
 ('travenexa.car-hire','travenexa.provider-connectors',true),
 ('travenexa.activities','travenexa.provider-connectors',true),
 ('travenexa.transfers','travenexa.provider-connectors',true),
 ('travenexa.esim','travenexa.provider-connectors',true),
 ('travenexa.price-alerts','travenexa.flight-search',true),
 ('travenexa.white-label','travenexa.core',true),
 ('travenexa.ai-concierge','travenexa.core',true),
 ('travenexa.ai-concierge','omniqora.ai',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=excluded.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES
 ('travenexa','travenexa.core',true,true,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.provider-connectors',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.flight-search',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.flight-redirects',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.flight-booking',false,false,'{"capabilityTag":"regulated-booking-approval-required"}'::jsonb),
 ('travenexa','travenexa.flightlounge',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.hotel-search',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.car-hire',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.activities',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.transfers',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.esim',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.price-alerts',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.white-label',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','travenexa.ai-concierge',false,false,'{"capabilityTag":"travel-domain-feature"}'::jsonb),
 ('travenexa','omniqora.identity',true,true,'{"shared":true}'::jsonb),
 ('travenexa','omniqora.crm',false,false,'{"shared":true}'::jsonb),
 ('travenexa','omniqora.connect',false,false,'{"shared":true}'::jsonb),
 ('travenexa','omniqora.analytics',false,false,'{"shared":true}'::jsonb),
 ('travenexa','omniqora.ai',false,false,'{"shared":true}'::jsonb),
 ('travenexa','omniqora.payments',false,false,'{"shared":true}'::jsonb),
 ('travenexa','omniqora.webhooks',false,false,'{"shared":true}'::jsonb)
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=excluded.default_enabled,required=excluded.required,metadata=excluded.metadata;

-- Product_workspace_types was introduced by the existing Lawquo factory migration.
INSERT INTO public.product_workspace_types
(product_key,workspace_type,name,description,system_workspace,allow_multiple,default_services,metadata)
VALUES
 ('travenexa','landlord','TraveNexa Landlord','Shared supplier catalogue, connector policy and travel tenant management.',true,false,ARRAY['travenexa.core','travenexa.provider-connectors'],'{"audience":"platform"}'::jsonb),
 ('travenexa','flight_metasearch','Flight metasearch tenant','FlightLounge-style flight search and affiliate handoffs.',false,true,ARRAY['travenexa.core','travenexa.flightlounge','travenexa.price-alerts'],'{"audience":"traveller"}'::jsonb),
 ('travenexa','comparison','Travel comparison tenant','Flights and accommodation comparison under its own brand.',false,true,ARRAY['travenexa.core','travenexa.flight-search','travenexa.flight-redirects','travenexa.hotel-search'],'{"audience":"traveller"}'::jsonb),
 ('travenexa','destination','Destination travel tenant','Destination-specific travel itinerary and supplier catalogue.',false,true,ARRAY['travenexa.core','travenexa.hotel-search','travenexa.activities','travenexa.transfers'],'{"audience":"traveller"}'::jsonb),
 ('travenexa','agency','White-label travel agency tenant','Travel agency storefront and approved supplier access, isolated by tenant.',false,true,ARRAY['travenexa.core','travenexa.white-label'],'{"audience":"partner"}'::jsonb)
ON CONFLICT(product_key,workspace_type) DO UPDATE SET
 name=excluded.name,description=excluded.description,system_workspace=excluded.system_workspace,
 allow_multiple=excluded.allow_multiple,default_services=excluded.default_services,
 metadata=excluded.metadata,updated_at=now();

INSERT INTO public.tenant_blueprints
(blueprint_key,name,description,country_code,category,status,metadata)
VALUES
 ('travenexa-platform','TraveNexa Platform','TraveNexa landlord travel control plane and supplier-connector setup',NULL,'travel','active','{"workspaceType":"landlord","brandName":null,"productKey":"travenexa","providerAccess":"approval-required","launchState":"awaiting-external-workspace"}'::jsonb),
 ('travenexa-flightlounge','FlightLounge by TraveNexa','Premium flight metasearch, redirect and alerts tenant',NULL,'travel','active','{"workspaceType":"flight_metasearch","brandName":"FlightLounge","productKey":"travenexa","providerAccess":"approval-required","launchState":"awaiting-external-workspace"}'::jsonb),
 ('travenexa-bestfares','BestFares BestRates','Travel comparison tenant for flights and accommodation',NULL,'travel','active','{"workspaceType":"comparison","brandName":"BestFares BestRates","productKey":"travenexa","providerAccess":"approval-required","launchState":"awaiting-external-workspace"}'::jsonb),
 ('travenexa-marocways','MarocWays','Destination-specialist travel brand tenant',NULL,'travel','active','{"workspaceType":"destination","brandName":"MarocWays","productKey":"travenexa","providerAccess":"approval-required","launchState":"awaiting-external-workspace"}'::jsonb),
 ('travenexa-white-label','TraveNexa White Label','Partner travel business tenant with isolated branding and provider entitlements',NULL,'travel','active','{"workspaceType":"agency","brandName":"White-label agency","productKey":"travenexa","providerAccess":"approval-required","launchState":"awaiting-external-workspace"}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,country_code=excluded.country_code,
 category=excluded.category,status=excluded.status,metadata=excluded.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES
 ('travenexa-platform','travenexa',true,'{"workspaceType":"landlord","brandName":null}'::jsonb),
 ('travenexa-flightlounge','travenexa',true,'{"workspaceType":"flight_metasearch","brandName":"FlightLounge"}'::jsonb),
 ('travenexa-bestfares','travenexa',true,'{"workspaceType":"comparison","brandName":"BestFares BestRates"}'::jsonb),
 ('travenexa-marocways','travenexa',true,'{"workspaceType":"destination","brandName":"MarocWays"}'::jsonb),
 ('travenexa-white-label','travenexa',true,'{"workspaceType":"agency","brandName":"White-label agency"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=excluded.required,config=excluded.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES
 ('travenexa-platform','travenexa.core',true,'{}'::jsonb),
 ('travenexa-platform','travenexa.provider-connectors',true,'{}'::jsonb),
 ('travenexa-platform','travenexa.white-label',false,'{}'::jsonb),
 ('travenexa-platform','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa-flightlounge','travenexa.core',true,'{}'::jsonb),
 ('travenexa-flightlounge','travenexa.flightlounge',true,'{}'::jsonb),
 ('travenexa-flightlounge','travenexa.price-alerts',true,'{}'::jsonb),
 ('travenexa-flightlounge','travenexa.flight-booking',false,'{}'::jsonb),
 ('travenexa-flightlounge','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.core',true,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.flight-search',true,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.flight-redirects',true,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.hotel-search',true,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.car-hire',false,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.activities',false,'{}'::jsonb),
 ('travenexa-bestfares','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa-marocways','travenexa.core',true,'{}'::jsonb),
 ('travenexa-marocways','travenexa.hotel-search',true,'{}'::jsonb),
 ('travenexa-marocways','travenexa.activities',true,'{}'::jsonb),
 ('travenexa-marocways','travenexa.transfers',true,'{}'::jsonb),
 ('travenexa-marocways','travenexa.flight-search',false,'{}'::jsonb),
 ('travenexa-marocways','travenexa.flight-redirects',false,'{}'::jsonb),
 ('travenexa-marocways','travenexa.ai-concierge',false,'{}'::jsonb),
 ('travenexa-white-label','travenexa.core',true,'{}'::jsonb),
 ('travenexa-white-label','travenexa.white-label',true,'{}'::jsonb),
 ('travenexa-white-label','travenexa.flight-search',false,'{}'::jsonb),
 ('travenexa-white-label','travenexa.flight-redirects',false,'{}'::jsonb),
 ('travenexa-white-label','travenexa.hotel-search',false,'{}'::jsonb),
 ('travenexa-white-label','travenexa.ai-concierge',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=excluded.required,config=excluded.config;

-- Catalogue-only supplier placeholders. A provider listing does not mean credentials or a functioning adapter exists.
INSERT INTO public.provider_catalogue
(provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status,metadata)
VALUES
 ('travel.travelpayouts','Travelpayouts','travel-supplier',ARRAY['flight.affiliate','attribution'],ARRAY[]::text[],ARRAY['partner_id','api_token'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"affiliate offers, tracked referrals and reporting","credentials":"vault-only"}'::jsonb),
 ('travel.skyscanner','Skyscanner Travel APIs','travel-supplier',ARRAY['flight.search','flight.indicative'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"Live and indicative flight metasearch subject to partner approval","credentials":"vault-only"}'::jsonb),
 ('travel.duffel','Duffel','travel-supplier',ARRAY['flight.search','flight.book','flight.manage'],ARRAY[]::text[],ARRAY['access_token'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"flight offers, order creation and order management where approved","credentials":"vault-only"}'::jsonb),
 ('travel.amadeus','Amadeus Self-Service / Enterprise','travel-supplier',ARRAY['flight.search','hotel.search'],ARRAY[]::text[],ARRAY['client_id','client_secret'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"flight, hotel and destination API services subject to access plan","credentials":"vault-only"}'::jsonb),
 ('travel.travelfusion','Travelfusion','travel-supplier',ARRAY['flight.search','flight.ndc'],ARRAY[]::text[],ARRAY['provider_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"Low-cost carrier and NDC offer sources subject to commercial agreement","credentials":"vault-only"}'::jsonb),
 ('travel.booking-demand','Booking.com Demand','travel-supplier',ARRAY['hotel.search','hotel.booking','cars','activities'],ARRAY[]::text[],ARRAY['affiliate_id','api_token'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"accommodation, car rental and attractions; integration flow per contract","credentials":"vault-only"}'::jsonb),
 ('travel.hotelbeds','Hotelbeds','travel-supplier',ARRAY['hotel.search','hotel.booking'],ARRAY[]::text[],ARRAY['api_key','api_secret'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"contracted accommodation inventory and rates","credentials":"vault-only"}'::jsonb),
 ('travel.ratehawk','RateHawk','travel-supplier',ARRAY['hotel.search','hotel.booking'],ARRAY[]::text[],ARRAY['api_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"contracted accommodation inventory and booking","credentials":"vault-only"}'::jsonb),
 ('travel.viator','Viator','travel-supplier',ARRAY['activities','attribution'],ARRAY[]::text[],ARRAY['partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"tours and activities referrals or approved API integration","credentials":"vault-only"}'::jsonb),
 ('travel.getyourguide','GetYourGuide','travel-supplier',ARRAY['activities','attribution'],ARRAY[]::text[],ARRAY['partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"activities and tours via approved partner programme","credentials":"vault-only"}'::jsonb),
 ('travel.discovercars','Discover Cars','travel-supplier',ARRAY['car_hire','attribution'],ARRAY[]::text[],ARRAY['partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"car hire affiliate offer and attribution where approved","credentials":"vault-only"}'::jsonb),
 ('travel.welcome-pickups','Welcome Pickups','travel-supplier',ARRAY['transfers','attribution'],ARRAY[]::text[],ARRAY['partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"airport transfer partner flow","credentials":"vault-only"}'::jsonb),
 ('travel.airalo','Airalo Partners','travel-supplier',ARRAY['esim','attribution'],ARRAY[]::text[],ARRAY['partner_credentials'],ARRAY[]::text[],'planned','catalogue_only','{"access":"partner-approval-required","source":"travel-factory-registration","purpose":"eSIM referral or partner fulfilment where approved","credentials":"vault-only"}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 name=excluded.name,provider_kind=excluded.provider_kind,capabilities=excluded.capabilities,
 supported_countries=excluded.supported_countries,required_secret_names=excluded.required_secret_names,
 public_config_names=excluded.public_config_names,
 metadata=COALESCE(public.provider_catalogue.metadata,'{}'::jsonb) || excluded.metadata,
 updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose,config)
VALUES
 ('travenexa','travel.travelpayouts',false,'affiliate offers, tracked referrals and reporting','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.skyscanner',false,'Live and indicative flight metasearch subject to partner approval','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.duffel',false,'flight offers, order creation and order management where approved','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.amadeus',false,'flight, hotel and destination API services subject to access plan','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.travelfusion',false,'Low-cost carrier and NDC offer sources subject to commercial agreement','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.booking-demand',false,'accommodation, car rental and attractions; integration flow per contract','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.hotelbeds',false,'contracted accommodation inventory and rates','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.ratehawk',false,'contracted accommodation inventory and booking','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.viator',false,'tours and activities referrals or approved API integration','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.getyourguide',false,'activities and tours via approved partner programme','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.discovercars',false,'car hire affiliate offer and attribution where approved','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.welcome-pickups',false,'airport transfer partner flow','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb),
 ('travenexa','travel.airalo',false,'eSIM referral or partner fulfilment where approved','{"enabled":false,"requiresVerifiedCredentials":true}'::jsonb)
ON CONFLICT(product_key,provider_key) DO UPDATE SET
 required=excluded.required,purpose=excluded.purpose,config=excluded.config;

COMMIT;
