-- Merqano launch blueprints in Omniqora SaaS Factory.
insert into public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata)
values
 ('merqano.alstero','Merqano · Alstero','Professional instruments commerce tenant with regulated-commerce AI profile.','GB','commerce','active','{"externalTenantKey":"alstero","aiProfile":"regulated-commerce"}'::jsonb),
 ('merqano.kalethon','Merqano · Kalëthon','Premium retail commerce tenant.','GB','commerce','active','{"externalTenantKey":"kalethon","aiProfile":"premium-retail"}'::jsonb),
 ('merqano.dulcis','Merqano · Dulcis','Premium retail commerce tenant.','GB','commerce','active','{"externalTenantKey":"dulcis","aiProfile":"premium-retail"}'::jsonb),
 ('merqano.meyzaar','Merqano · Meyzaar','Premium retail commerce tenant.','GB','commerce','active','{"externalTenantKey":"meyzaar","aiProfile":"premium-retail"}'::jsonb)
on conflict(blueprint_key) do update set name=excluded.name,description=excluded.description,metadata=excluded.metadata,status='active';

insert into public.blueprint_products(blueprint_key,product_key,required,config)
select b,'merqano',true,c from (values
 ('merqano.alstero','{"externalTenantKey":"alstero","aiProfile":"regulated-commerce"}'::jsonb),
 ('merqano.kalethon','{"externalTenantKey":"kalethon","aiProfile":"premium-retail"}'::jsonb),
 ('merqano.dulcis','{"externalTenantKey":"dulcis","aiProfile":"premium-retail"}'::jsonb),
 ('merqano.meyzaar','{"externalTenantKey":"meyzaar","aiProfile":"premium-retail"}'::jsonb)
) x(b,c) on conflict(blueprint_key,product_key) do update set config=excluded.config,required=true;

insert into public.blueprint_services(blueprint_key,service_key,required,config)
select b,s,r,'{}'::jsonb from (values
 ('merqano.alstero','merqano.omniqora-ai',false),('merqano.alstero','merqano.marktpass',true),('merqano.alstero','merqano.marketing',false),('merqano.alstero','merqano.merqora',false),
 ('merqano.kalethon','merqano.omniqora-ai',false),('merqano.kalethon','merqano.marktpass',false),('merqano.kalethon','merqano.marketing',false),('merqano.kalethon','merqano.merqora',false),
 ('merqano.dulcis','merqano.omniqora-ai',false),('merqano.dulcis','merqano.marktpass',false),('merqano.dulcis','merqano.marketing',false),('merqano.dulcis','merqano.merqora',false),
 ('merqano.meyzaar','merqano.omniqora-ai',false),('merqano.meyzaar','merqano.marktpass',false),('merqano.meyzaar','merqano.marketing',false),('merqano.meyzaar','merqano.merqora',false)
) x(b,s,r) on conflict(blueprint_key,service_key) do update set required=excluded.required;
