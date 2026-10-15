-- Shared property-to-requirements matching capability for supported
-- property SaaS products. This is a guarded catalogue/blueprint integration;
-- property listings, buyers and viewings remain in their source applications.
BEGIN;
INSERT INTO public.service_catalogue
 (service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata)
VALUES
 ('omniqora.property-matching','Property Matching & Requirements Intelligence',
 'Source-scoped property matching, transparent shortlist explanations, and reviewed follow-up proposals for estate/letting agencies.',
 'property','omniqora',true,'manual','beta','catalogue_only',
 '{"authority":"source-listings","source_products":["gabley","propconnect","immoviq","sharedbricks","hmo-hub","domureva","axiom"],"data_policy":"customer_supplied_property_criteria_only","autonomous_housing_decisions":false,"source_adapter_required":true}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 metadata=public.service_catalogue.metadata||EXCLUDED.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required)
VALUES ('omniqora.property-matching','omniqora.identity',true),
       ('omniqora.property-matching','omniqora.crm',false)
ON CONFLICT(service_key,depends_on_service_key) DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
SELECT p.product_key,'omniqora.property-matching',false,false,
 jsonb_build_object('enablement','explicit_approved_pilot','source_listing_authority','external','automatic_outreach',false)
FROM public.product_catalogue p
WHERE p.product_key=ANY(ARRAY['gabley','propconnect','immoviq','sharedbricks','hmo-hub','domureva','axiom'])
ON CONFLICT (product_key,service_key) DO NOTHING;

-- Authorised estate/letting agencies are tenants of Gabley, not separate
-- product landlords. This template creates no tenant by itself.
INSERT INTO public.tenant_blueprints
 (blueprint_key,name,description,country_code,category,status,metadata)
VALUES
 ('gabley.agency-uk','Gabley · Estate & Lettings Agency (UK)',
 'Agency workspace with optional permission-scoped listing matching and human-reviewed viewings.',
 'GB','property','draft',
 '{"externalTenantBindingRequired":true,"sourceDataAuthority":"gabley","matchingMode":"read_only_draft","automaticLeadOutreach":false,"autoProvision":false}'::jsonb)
ON CONFLICT(blueprint_key) DO NOTHING;
INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES('gabley.agency-uk','gabley',true,
 '{"sourceAdapterRequired":true,"autoProvision":false,"region":"GB","propertyMatching":"optional"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO NOTHING;
INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES('gabley.agency-uk','omniqora.property-matching',false,
 '{"approvalRequired":true,"sourceAdapterRequired":true,"outboundMessages":"human_approval"}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO NOTHING;
COMMIT;
