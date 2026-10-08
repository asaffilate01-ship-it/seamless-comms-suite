-- Register Merqano as a landlord SaaS governed by Omniqora SaaS Factory.
-- Uses existing factory tables; no external workspace is activated by this migration.

BEGIN;

insert into public.product_catalogue
  (product_key, name, product_role, deployment_mode, implementation_status, description)
values
  ('merqano','Merqano','landlord','external','external_product','Multi-shop commerce landlord for isolated branded merchant tenants.')
on conflict (product_key) do update set
  name=excluded.name,
  product_role=excluded.product_role,
  description=excluded.description;

insert into public.service_catalogue
  (service_key, name, family, owner_product_key, provisioning_mode, implementation_status, description)
values
  ('merqano.marketing','Merqano Marketing','marketing','merqano','external','external_product','First-party marketing capability for Merqano commerce tenants.'),
  ('merqano.marktpass','MarktPass for Merqano','compliance','merqano','external','external_product','Market-access and compliance gating for commerce products.'),
  ('merqano.merqora','Merqora Marketplace Growth','marketplace','merqano','external','external_product','Marketplace growth connection for Amazon and other channels.'),
  ('merqano.omniqora-ai','Omniqora AI for Merqano','intelligence','omniqora','automatic','built_main','Tenant-scoped AI/intelligence entitlement for Merqano.')
on conflict (service_key) do update set
  name=excluded.name,
  family=excluded.family,
  owner_product_key=excluded.owner_product_key,
  provisioning_mode=excluded.provisioning_mode,
  implementation_status=excluded.implementation_status,
  description=excluded.description;

COMMIT;
