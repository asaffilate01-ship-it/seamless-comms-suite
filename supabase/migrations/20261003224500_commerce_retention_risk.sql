BEGIN;

-- Follow-up to marketplace_growth_ops_gaps.
-- Scheduled/recurring orders, substitutions, referrals, memberships, vendor capacity,
-- risk/disputes and store credit already exist in 20261003211000. Do not fork them.
-- The remaining donor capability promoted here is product-neutral favourites/reorder.

CREATE TABLE IF NOT EXISTS public.commerce_customer_favourites(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  customer_ref text NOT NULL,
  favourite_type text NOT NULL CHECK(favourite_type IN('vendor','listing','order')),
  favourite_ref text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key,customer_ref,favourite_type,favourite_ref)
);

ALTER TABLE public.commerce_customer_favourites ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.commerce_customer_favourites TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.commerce_customer_favourites TO authenticated;

DROP POLICY IF EXISTS "commerce favourites read" ON public.commerce_customer_favourites;
CREATE POLICY "commerce favourites read" ON public.commerce_customer_favourites
  FOR SELECT TO authenticated
  USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "commerce favourites write" ON public.commerce_customer_favourites;
CREATE POLICY "commerce favourites write" ON public.commerce_customer_favourites
  FOR ALL TO authenticated
  USING(public.can_write(tenant_id,auth.uid()))
  WITH CHECK(public.can_write(tenant_id,auth.uid()));

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,
  provisioning_mode,status,implementation_status,metadata
) VALUES (
  'omniqora.favourites',
  'Favourites & Reorder',
  'Reusable customer favourites for vendors, listings and prior orders.',
  'commerce','omniqora',true,'automatic','active','built_main',
  '{"supports":["vendor","listing","order"],"reorderSource":"order"}'::jsonb
)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('omniqora.favourites','omniqora.marketplace',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-plus','omniqora.favourites',true,false),
('dishbee-one','omniqora.favourites',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required;

COMMIT;
