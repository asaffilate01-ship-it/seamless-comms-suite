-- Kindelo UK as a first-class landlord product in Omniqora SaaS Factory.
-- Zero Kindelo production users/providers are moved or activated by this migration.
-- Keeps the pre-existing kindelo-uk (and kindelo-de) blueprints unchanged.
BEGIN;

UPDATE public.product_catalogue
SET name='Kindelo',
    description='UK childcare SaaS landlord with a first operating agency and optional isolated white-label tenants.',
    category='childcare',
    deployment_mode='external',
    metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
      'architecture','landlord-with-workspaces',
      'canonicalRepository','https://github.com/asaffilate01-ship-it/kindelo-uk.git',
      'controlPlane','omniqora',
      'dataPlane','external',
      'initialOperatingTenant','kindelo-uk',
      'defaultCountry','GB',
      'whiteLabelProvisioning','blocked-pending-tenant-isolation-and-regulatory-review',
      'regulatoryApprovalIsTenantSpecific',true,
      'licenceCannotBeShared',true,
      'nannyServiceRequiresSeparateLegalModel',true,
      'operationalSource','kindelo-uk'
    ),
    updated_at=now()
WHERE product_key='kindelo';

INSERT INTO public.service_catalogue
(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata)
VALUES
('kindelo.software','Kindelo Software Core','Childcare records, identity-scoped portal workflows and reporting.','childcare','kindelo',true,'external','beta','{"requiresVerifiedWorkspace":true}'),
('kindelo.parent-portal','Kindelo Parent Portal','Parent registration, enquiries and child-specific portal functions.','childcare','kindelo',true,'external','beta','{"requiresVerifiedWorkspace":true}'),
('kindelo.prospects','Kindelo Applicant Journey','Prospective childminder onboarding and document capture.','childcare','kindelo',true,'external','beta','{"agencyApprovalRequiredToRegisterProviders":true}'),
('kindelo.training','Kindelo Training Integration','SkillFinch course assignments, CPD and verified certificate evidence.','education','kindelo',true,'external','beta','{"skillfinchIntegration":"not-live"}'),
('kindelo.qa','Kindelo Quality Assurance','Professional visits, annual unannounced QA, safeguarding escalation and evidence.','compliance','kindelo',true,'external','beta','{"humanSignoffRequired":true}'),
('kindelo.white-label','Kindelo White Label','Tenant-owned domains, branded portals, entitlements and isolated records.','childcare','kindelo',true,'external','beta','{"requiresTenantIsolation":true,"status":"not-provisionable"}'),
('kindelo.nanny','Kindelo At Home','Nanny and home childcarer booking under separately approved legal arrangements.','childcare','kindelo',true,'external','beta','{"notChildminderAgencyRegistration":true}')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,
 description=EXCLUDED.description,
 family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,
 billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,
 status=EXCLUDED.status,
 metadata=EXCLUDED.metadata,
 updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required)
VALUES
 ('kindelo.parent-portal','kindelo.software',true),
 ('kindelo.prospects','kindelo.software',true),
 ('kindelo.training','kindelo.software',true),
 ('kindelo.qa','kindelo.software',true),
 ('kindelo.white-label','kindelo.software',true),
 ('kindelo.nanny','kindelo.software',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES
('kindelo','kindelo.software',false,false,'{"requiresConfirmedBackend":true}'),
('kindelo','kindelo.parent-portal',false,false,'{"requiresConfirmedBackend":true}'),
('kindelo','kindelo.prospects',false,false,'{"requiresConfirmedBackend":true}'),
('kindelo','kindelo.training',false,false,'{"requiresConfirmedBackend":true}'),
('kindelo','kindelo.qa',false,false,'{"requiresConfirmedBackend":true}'),
('kindelo','kindelo.white-label',false,false,'{"requiresConfirmedBackend":true}'),
('kindelo','kindelo.nanny',false,false,'{"requiresConfirmedBackend":true}')
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=false,
 required=false,
 metadata=EXCLUDED.metadata;

-- Optional white-label blueprint remains draft. Existing UK operator and Germany
-- blueprints remain untouched; this cannot create a registered childcare agency.
INSERT INTO public.tenant_blueprints
(blueprint_key,name,description,country_code,category,status,metadata)
VALUES
('kindelo-white-label-gb','Kindelo White Label · England',
 'Optional isolated software tenant for a childcare organisation. Statutory CMA registration is tenant-specific and never inherited from Kindelo.',
 'GB','childcare','draft','{"countryScope":"England","regulatoryStatus":"unverified","activation":"manual-after-evidence"}')
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=EXCLUDED.name,
 description=EXCLUDED.description,
 country_code=EXCLUDED.country_code,
 category=EXCLUDED.category,
 status='draft',
 metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES('kindelo-white-label-gb','kindelo',true,'{"provisioning":"blocked-pending-verification"}')
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES
('kindelo-white-label-gb','kindelo.software',true,'{"pending":true}'),
('kindelo-white-label-gb','kindelo.parent-portal',false,'{"pending":true}'),
('kindelo-white-label-gb','kindelo.prospects',false,'{"pending":true}'),
('kindelo-white-label-gb','kindelo.training',false,'{"pending":true}'),
('kindelo-white-label-gb','kindelo.qa',false,'{"pending":true}'),
('kindelo-white-label-gb','kindelo.white-label',false,'{"pending":true}')
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET
 required=EXCLUDED.required,config=EXCLUDED.config;

-- Scope tenant types within Kindelo; this does not create or activate tenants.
INSERT INTO public.product_workspace_types
(product_key,workspace_type,name,description,system_workspace,allow_multiple,default_services,metadata)
VALUES
('kindelo','landlord','Kindelo Landlord','Product policy, catalogue, commercial governance and provisioning oversight.',true,false,ARRAY[]::text[],'{"notOperatingAgency":true}'),
('kindelo','operator','Kindelo UK Operator','Kindelo-owned childcare operation; requires its own valid Ofsted registration.',false,true,ARRAY['kindelo.software'],'{"regulatoryApproval":"required-for-agency-functions"}'),
('kindelo','agency_tenant','Independent Childminder Agency','Separately registered agency operating a white-label Kindelo workspace.',false,true,ARRAY['kindelo.software'],'{"regulatoryApproval":"separate-ofsted-cma"}'),
('kindelo','software_tenant','Childcare Software Customer','Childcare organisation using software without Kindelo CMA registration.',false,true,ARRAY['kindelo.software'],'{"cannotClaimAgencyRegistration":true}'),
('kindelo','nanny_tenant','Nanny Agency / At Home','Separate parent-home childcare business with its own employment and suitability arrangements.',false,true,ARRAY['kindelo.software'],'{"notRegisteredAsCMA":true}')
ON CONFLICT(product_key,workspace_type) DO UPDATE SET
 name=EXCLUDED.name,
 description=EXCLUDED.description,
 system_workspace=EXCLUDED.system_workspace,
 allow_multiple=EXCLUDED.allow_multiple,
 default_services=EXCLUDED.default_services,
 metadata=EXCLUDED.metadata,
 updated_at=now();

COMMIT;
