-- Gabley + DOMUREVA property intelligence, deal sourcing and regeneration factory catalogue.
-- Catalogue/blueprint registration only: this does not activate a tenant, ingest portal data,
-- grant access to external property sources or mark any external connection as live-verified.
BEGIN;

INSERT INTO public.product_catalogue(
  product_key,name,description,category,deployment_mode,status,
  product_role,parent_product_key,implementation_status,metadata
) VALUES
 ('gabley','Gabley','Multi-tenant estate agency, property operations, investor deal sourcing and transaction workspace.',
  'property','external','beta','landlord','omniqora','built_main',
  '{"repository":"asaffilate01-ship-it/remix-of-property-nexus","systemOfRecord":"Gabley property database","liveVerified":false,"factoryManaged":true,"dataBoundary":"product database remains authoritative"}'),
 ('domureva','DOMUREVA','Empty-home discovery, regeneration, council/public funding intelligence and application workflow.',
  'property-regeneration','external','beta','landlord','omniqora','built_main',
  '{"repository":"asaffilate01-ship-it/pixel-perfect-replica","systemOfRecord":"DOMUREVA case database","liveVerified":false,"factoryManaged":true,"dataBoundary":"product database remains authoritative"}')
ON CONFLICT(product_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,category=excluded.category,
 deployment_mode=excluded.deployment_mode,status=excluded.status,product_role=excluded.product_role,
 parent_product_key=excluded.parent_product_key,implementation_status=excluded.implementation_status,
 metadata=public.product_catalogue.metadata||excluded.metadata,updated_at=now();

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata
) VALUES
 ('omniqora.property-intelligence','Property Intelligence','Evidence-led property valuation context, comparables, price anomaly and market-signal analysis.','property-intelligence','omniqora',true,'automatic','beta','built_main',
  '{"humanReviewRequired":true,"noFormalValuationClaim":true,"sourceProvenanceRequired":true}'),
 ('omniqora.property-scout','Property Scout','Ranks authorised property opportunities against tenant-defined acquisition criteria.','property-intelligence','omniqora',true,'automatic','beta','built_main',
  '{"humanReviewRequired":true,"licensedSourcesOnly":true}'),
 ('omniqora.deal-detective','Deal Detective','Investigates why a property appears discounted and separates opportunity signals from material risks.','property-intelligence','omniqora',true,'automatic','beta','built_main',
  '{"humanReviewRequired":true,"riskFlagsAreNotLegalAdvice":true}'),
 ('omniqora.property-underwriter','Property Deal Underwriter','Models purchase price, works, holding/transaction costs, investor profit target and fee headroom.','property-intelligence','omniqora',true,'automatic','beta','built_main',
  '{"humanReviewRequired":true,"financialModelNotAdvice":true}'),
 ('omniqora.property-match','Property Buyer Match','Ranks buyer/investor profiles against property, budget, geography, strategy, funding and timetable.','matching','omniqora',true,'automatic','beta','built_main',
  '{"explainableRanking":true,"humanApprovalRequired":true}'),
 ('omniqora.vacancy-scout','Vacancy Scout','Combines authorised vacancy signals into a reviewable probability score without asserting occupancy as fact.','property-intelligence','omniqora',true,'automatic','beta','built_main',
  '{"probabilisticOnly":true,"humanVerificationRequired":true}'),
 ('gabley.deal-room','Gabley Deal Room','Seller opportunity, investor matching, disclosed fee, offer and transaction progression workspace.','property','gabley',true,'external','beta','built_main',
  '{"systemOfRecord":"gabley","noClientMoney":true,"feeDisclosureRequired":true}'),
 ('domureva.funding-intelligence','DOMUREVA Funding Intelligence','Reviewed council, public, retrofit and regeneration scheme eligibility and funding-stack analysis.','regeneration','domureva',true,'external','beta','built_main',
  '{"authorityDecisionFinal":true,"reviewedRulesOnly":true,"sourceProvenanceRequired":true}'),
 ('domureva.gabley-sync','DOMUREVA for Gabley','Scoped exchange of regeneration case references and reviewed funding assessments between DOMUREVA and Gabley.','integration','domureva',true,'external','beta','built_main',
  '{"direction":"bidirectional","noSharedDatabase":true,"reviewRequired":true}')
ON CONFLICT(service_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,family=excluded.family,
 owner_product_key=excluded.owner_product_key,billable=excluded.billable,
 provisioning_mode=excluded.provisioning_mode,status=excluded.status,
 implementation_status=excluded.implementation_status,
 metadata=public.service_catalogue.metadata||excluded.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
 ('omniqora.property-intelligence','omniqora.intelligence-runtime',true),
 ('omniqora.property-intelligence','omniqora.ai-governance',true),
 ('omniqora.property-scout','omniqora.property-intelligence',true),
 ('omniqora.property-scout','omniqora.intelligence-runtime',true),
 ('omniqora.deal-detective','omniqora.property-intelligence',true),
 ('omniqora.deal-detective','omniqora.rrci',true),
 ('omniqora.property-underwriter','omniqora.property-intelligence',true),
 ('omniqora.property-underwriter','omniqora.analytics',true),
 ('omniqora.property-match','omniqora.crm',true),
 ('omniqora.property-match','omniqora.marketplace',true),
 ('omniqora.property-match','omniqora.intelligence-runtime',true),
 ('omniqora.vacancy-scout','omniqora.property-intelligence',true),
 ('gabley.deal-room','omniqora.crm',true),
 ('gabley.deal-room','omniqora.property-match',true),
 ('domureva.funding-intelligence','omniqora.property-intelligence',true),
 ('domureva.funding-intelligence','omniqora.vacancy-scout',true),
 ('domureva.funding-intelligence','omniqora.intelligence-runtime',true),
 ('domureva.gabley-sync','omniqora.connectors',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=excluded.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata) VALUES
 ('gabley','gabley.deal-room',true,true,'{"surface":"deal-room"}'),
 ('gabley','omniqora.property-intelligence',false,false,'{"addon":"intelligence"}'),
 ('gabley','omniqora.property-scout',false,false,'{"addon":"scout"}'),
 ('gabley','omniqora.deal-detective',false,false,'{"addon":"deal-detective"}'),
 ('gabley','omniqora.property-underwriter',false,false,'{"addon":"underwriter"}'),
 ('gabley','omniqora.property-match',false,false,'{"addon":"match"}'),
 ('gabley','omniqora.vacancy-scout',false,false,'{"addon":"vacancy"}'),
 ('gabley','domureva.gabley-sync',false,false,'{"addon":"regeneration"}'),
 ('domureva','domureva.funding-intelligence',true,true,'{"surface":"funding"}'),
 ('domureva','omniqora.property-intelligence',true,false,'{"mode":"regeneration-context"}'),
 ('domureva','omniqora.vacancy-scout',true,false,'{"mode":"vacancy-discovery"}'),
 ('domureva','domureva.gabley-sync',false,false,'{"addon":"gabley"}')
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=excluded.default_enabled,required=excluded.required,metadata=excluded.metadata;

INSERT INTO public.service_product_dependencies(service_key,product_key,required,config) VALUES
 ('gabley.deal-room','gabley',true,'{}'),
 ('domureva.funding-intelligence','domureva',true,'{}'),
 ('domureva.gabley-sync','gabley',true,'{}'),
 ('domureva.gabley-sync','domureva',true,'{}')
ON CONFLICT(service_key,product_key) DO UPDATE SET required=excluded.required,config=excluded.config;

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata) VALUES
 ('gabley-uk-agency','Gabley · UK agency','Multi-tenant UK estate agency/property workspace with optional Omniqora property intelligence add-ons.','GB','property','active',
  '{"automaticActivation":false,"product":"gabley","locale":"en-GB"}'),
 ('domureva-uk-regeneration','DOMUREVA · UK regeneration','Empty-home and regeneration workspace with reviewed funding intelligence.','GB','property-regeneration','active',
  '{"automaticActivation":false,"product":"domureva","locale":"en-GB"}'),
 ('gabley-domureva-deals','Gabley + DOMUREVA · UK deals','Gabley deal sourcing with DOMUREVA regeneration/funding assessment connected through scoped adapters.','GB','property','active',
  '{"automaticActivation":false,"products":["gabley","domureva"],"noSharedDatabase":true}')
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,country_code=excluded.country_code,
 category=excluded.category,status=excluded.status,metadata=public.tenant_blueprints.metadata||excluded.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
 ('gabley-uk-agency','gabley',true,'{"mode":"landlord-saas"}'),
 ('domureva-uk-regeneration','domureva',true,'{"mode":"standalone"}'),
 ('gabley-domureva-deals','gabley',true,'{"mode":"host"}'),
 ('gabley-domureva-deals','domureva',true,'{"mode":"funding-addon"}')
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=excluded.required,config=excluded.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
 ('gabley-uk-agency','gabley.deal-room',true,'{}'),
 ('gabley-uk-agency','omniqora.property-intelligence',false,'{}'),
 ('gabley-uk-agency','omniqora.property-scout',false,'{}'),
 ('gabley-uk-agency','omniqora.deal-detective',false,'{}'),
 ('gabley-uk-agency','omniqora.property-underwriter',false,'{}'),
 ('gabley-uk-agency','omniqora.property-match',false,'{}'),
 ('domureva-uk-regeneration','domureva.funding-intelligence',true,'{}'),
 ('domureva-uk-regeneration','omniqora.property-intelligence',true,'{}'),
 ('domureva-uk-regeneration','omniqora.vacancy-scout',true,'{}'),
 ('gabley-domureva-deals','gabley.deal-room',true,'{}'),
 ('gabley-domureva-deals','omniqora.property-intelligence',true,'{}'),
 ('gabley-domureva-deals','omniqora.property-scout',true,'{}'),
 ('gabley-domureva-deals','omniqora.deal-detective',true,'{}'),
 ('gabley-domureva-deals','omniqora.property-underwriter',true,'{}'),
 ('gabley-domureva-deals','omniqora.property-match',true,'{}'),
 ('gabley-domureva-deals','omniqora.vacancy-scout',true,'{}'),
 ('gabley-domureva-deals','domureva.funding-intelligence',true,'{}'),
 ('gabley-domureva-deals','domureva.gabley-sync',true,'{}')
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=excluded.required,config=excluded.config;

COMMIT;
