-- Extend the existing FormationGenie catalogue without provisioning tenants or enabling billing.
begin;
update public.product_catalogue set metadata=metadata || '{"repository":"https://github.com/asaffilate01-ship-it/formation-genie-magic","systemOfRecord":"FormationGenie corporate workspace","connectionContract":"tenant-snapshot-v4","rollout":"configuration-and-staging-required"}'::jsonb, updated_at=now()
where product_key='formationgenie';
update public.service_catalogue set metadata=metadata || '{"filingProviderEnabled":false,"identityProviderEnabled":false,"humanApprovalRequired":true,"provisioning":"external-manual-workspace-binding"}'::jsonb, updated_at=now()
where service_key='formationgenie.secretarial';
insert into public.product_services(product_key,service_key,default_enabled,required,metadata) values
 ('omniqora-accounts','formationgenie.secretarial',false,false,'{"scope":"optional external company-secretarial service","runtime":"company-mapping-and-receiver-required"}'),
 ('formationgenie','omniqora.analytics',false,false,'{"scope":"minimal aggregate data only","runtime":"not-connected"}'),
 ('formationgenie','omniqora.connect',false,false,'{"scope":"consented reminders and notifications","runtime":"consumer-required"}'),
 ('formationgenie','omniqora.intelligence-runtime',false,false,'{"scope":"review-only recommendations","runtime":"adapter-required","noFilingAuthority":true}')
on conflict(product_key,service_key) do update set metadata=public.product_services.metadata || excluded.metadata;
insert into public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata) values
 ('formationgenie-business-gb','FormationGenie UK business','One business workspace linked to one Omniqora tenant. Corporate records stay in FormationGenie.','GB','business-services','active','{"product":"formationgenie","workspaceMode":"business","provisioning":"manual","launchEvidenceRequired":true}'),
 ('formationgenie-practice-gb','FormationGenie accountancy practice','One practice workspace linked to one Omniqora tenant. Client companies have scoped approvals, not platform administration.','GB','business-services','active','{"product":"formationgenie","workspaceMode":"practice","provisioning":"manual","launchEvidenceRequired":true}')
on conflict(blueprint_key) do update set name=excluded.name,description=excluded.description,metadata=excluded.metadata;
insert into public.blueprint_products(blueprint_key,product_key,required,config) values
 ('formationgenie-business-gb','formationgenie',true,'{"externalWorkspaceRequired":true,"workspaceMode":"business"}'),
 ('formationgenie-practice-gb','formationgenie',true,'{"externalWorkspaceRequired":true,"workspaceMode":"practice"}')
on conflict(blueprint_key,product_key) do update set required=excluded.required,config=excluded.config;
insert into public.blueprint_services(blueprint_key,service_key,required,config) values
 ('formationgenie-business-gb','formationgenie.secretarial',true,'{"provisioning":"external","liveFiling":false}'),
 ('formationgenie-practice-gb','formationgenie.secretarial',true,'{"provisioning":"external","liveFiling":false}')
on conflict(blueprint_key,service_key) do update set required=excluded.required,config=excluded.config;
commit;
