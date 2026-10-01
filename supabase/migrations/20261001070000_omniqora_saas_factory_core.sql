-- Omniqora SaaS Factory: central product, add-on, entitlement, branding,
-- billing and cross-product event control plane.
BEGIN;

CREATE TABLE IF NOT EXISTS public.omniqora_platform_admins(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_organisations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legal_name text,
  country_code text NOT NULL DEFAULT 'GB',
  currency text NOT NULL DEFAULT 'GBP',
  timezone text NOT NULL DEFAULT 'Europe/London',
  billing_email text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_organisation_members(
  organisation_id uuid NOT NULL REFERENCES public.omniqora_organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','billing','member')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organisation_id,user_id)
);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.omniqora_organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.omniqora_product_catalogue(
  product_key text PRIMARY KEY CHECK(product_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'saas',
  runtime_key text,
  owner_label text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  default_unit_amount_pence integer NOT NULL DEFAULT 0 CHECK(default_unit_amount_pence>=0),
  currency text NOT NULL DEFAULT 'GBP',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_service_catalogue(
  service_key text PRIMARY KEY CHECK(service_key ~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Other',
  provider_key text NOT NULL DEFAULT 'omniqora',
  runtime_key text,
  service_kind text NOT NULL DEFAULT 'addon'
    CHECK(service_kind IN ('base','platform','addon','bundle','usage','one_off')),
  billing_basis text NOT NULL DEFAULT 'flat'
    CHECK(billing_basis IN ('flat','per_location','per_brand','per_seat','usage','one_off')),
  recurring boolean NOT NULL DEFAULT true,
  default_unit_amount_pence integer NOT NULL DEFAULT 0 CHECK(default_unit_amount_pence>=0),
  currency text NOT NULL DEFAULT 'GBP',
  provisioning_key text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_service_dependencies(
  service_key text NOT NULL REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE CASCADE,
  depends_on_service_key text NOT NULL REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(service_key,depends_on_service_key),
  CHECK(service_key<>depends_on_service_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_product_default_services(
  product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(product_key,service_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_tenant_products(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key),
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('requested','provisioning','active','suspended','cancelled')),
  plan_key text NOT NULL DEFAULT 'core',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_tenant_ref text,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_product_members(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key,user_id)
);

CREATE TABLE IF NOT EXISTS public.omniqora_tenant_services(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.omniqora_service_catalogue(service_key),
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('requested','active','suspended','cancelled')),
  quantity integer NOT NULL DEFAULT 1 CHECK(quantity>0),
  unit_amount_pence integer NOT NULL DEFAULT 0 CHECK(unit_amount_pence>=0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,service_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_tenant_branding(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  display_name text,
  logo_url text,
  dark_logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  font_family text,
  support_phone text,
  support_email text,
  social_urls jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_url text,
  privacy_url text,
  email_domain text,
  email_from_name text,
  email_from_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_tenant_domains(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE SET NULL,
  hostname text NOT NULL UNIQUE,
  domain_type text NOT NULL DEFAULT 'web'
    CHECK(domain_type IN ('web','portal','api','tracking','email')),
  primary_domain boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK(verification_status IN ('pending','verifying','verified','failed')),
  ssl_status text NOT NULL DEFAULT 'pending'
    CHECK(ssl_status IN ('pending','provisioning','active','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_blueprints(
  blueprint_key text PRIMARY KEY CHECK(blueprint_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  country_code text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_blueprint_products(
  blueprint_key text NOT NULL REFERENCES public.omniqora_blueprints(blueprint_key) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(blueprint_key,product_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_blueprint_services(
  blueprint_key text NOT NULL REFERENCES public.omniqora_blueprints(blueprint_key) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(blueprint_key,service_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_tenant_subscriptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'omniqora',
  external_customer_ref text,
  external_subscription_ref text,
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('trialing','active','past_due','cancel_at_period_end','cancelled')),
  base_plan text NOT NULL DEFAULT 'core',
  currency text NOT NULL DEFAULT 'GBP',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_subscription_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.omniqora_tenant_subscriptions(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK(item_type IN ('base','location','brand','addon','usage')),
  item_key text NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 1 CHECK(quantity>0),
  unit_amount_pence integer NOT NULL DEFAULT 0 CHECK(unit_amount_pence>=0),
  active_from timestamptz NOT NULL DEFAULT now(),
  cancel_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(subscription_id,item_type,item_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_change_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type text NOT NULL CHECK(change_type IN (
    'add_product','remove_product','add_addon','remove_addon','add_location','remove_location'
  )),
  target_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','awaiting_payment','completed','rejected')),
  quoted_amount_pence integer,
  landlord_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  completed_at timestamptz,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_connector_instances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  service_key text REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE CASCADE,
  provider text NOT NULL,
  capability text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK(status IN ('not_configured','testing','connected','degraded','disabled')),
  secret_ref text,
  external_account_ref text,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_health_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,service_key,provider,capability)
);

CREATE TABLE IF NOT EXISTS public.omniqora_provisioning_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  service_key text REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed','blocked','cancelled')),
  blocking boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.omniqora_event_outbox(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','sent','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS omniqora_event_outbox_product_status_idx
  ON public.omniqora_event_outbox(target_product_key,status,next_attempt_at);
CREATE INDEX IF NOT EXISTS omniqora_jobs_status_idx
  ON public.omniqora_provisioning_jobs(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS omniqora_tenant_services_status_idx
  ON public.omniqora_tenant_services(tenant_id,status);

CREATE TABLE IF NOT EXISTS public.omniqora_customer_360(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text,
  email text,
  phone_e164 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS omniqora_customer_360_phone_uq
  ON public.omniqora_customer_360(tenant_id,phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS omniqora_customer_360_email_uq
  ON public.omniqora_customer_360(tenant_id,lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.omniqora_customer_product_links(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_360_id uuid NOT NULL REFERENCES public.omniqora_customer_360(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE CASCADE,
  external_customer_ref text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,product_key,external_customer_ref)
);

CREATE OR REPLACE FUNCTION public.omniqora_is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.omniqora_platform_admins p WHERE p.user_id=auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.omniqora_is_org_member(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.omniqora_organisation_members m
    WHERE m.organisation_id=target AND m.user_id=auth.uid() AND m.active
  )
$$;

CREATE OR REPLACE FUNCTION public.omniqora_can_manage_tenant(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.omniqora_is_platform_admin()
  OR public.has_tenant_role(target,auth.uid(),ARRAY['owner','admin']::public.app_role[])
$$;

CREATE OR REPLACE FUNCTION public.omniqora_has_service(target uuid,p_service_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $
  SELECT EXISTS(
    SELECT 1 FROM public.omniqora_tenant_services s
    WHERE s.tenant_id=target AND s.service_key=p_service_key AND s.status='active'
  )
$;

REVOKE ALL ON FUNCTION public.omniqora_is_platform_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.omniqora_is_org_member(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.omniqora_can_manage_tenant(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.omniqora_has_service(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_is_platform_admin(),
  public.omniqora_is_org_member(uuid),public.omniqora_can_manage_tenant(uuid),
  public.omniqora_has_service(uuid,text)
TO authenticated,service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'omniqora_platform_admins','omniqora_organisations','omniqora_organisation_members',
    'omniqora_product_catalogue','omniqora_service_catalogue','omniqora_service_dependencies',
    'omniqora_product_default_services','omniqora_tenant_products','omniqora_product_members',
    'omniqora_tenant_services','omniqora_tenant_branding','omniqora_tenant_domains',
    'omniqora_blueprints','omniqora_blueprint_products','omniqora_blueprint_services',
    'omniqora_tenant_subscriptions','omniqora_subscription_items','omniqora_change_requests',
    'omniqora_connector_instances','omniqora_provisioning_jobs','omniqora_event_outbox',
    'omniqora_customer_360','omniqora_customer_product_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE POLICY "platform admins read self" ON public.omniqora_platform_admins
  FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE POLICY "organisation visible" ON public.omniqora_organisations
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.omniqora_is_org_member(id)
    OR EXISTS(SELECT 1 FROM public.tenants t WHERE t.organisation_id=id AND public.is_tenant_member(t.id,auth.uid()))
  );
CREATE POLICY "org membership visible" ON public.omniqora_organisation_members
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.omniqora_is_org_member(organisation_id)
  );

CREATE POLICY "products readable" ON public.omniqora_product_catalogue
  FOR SELECT TO authenticated USING(active OR public.omniqora_is_platform_admin());
CREATE POLICY "services readable" ON public.omniqora_service_catalogue
  FOR SELECT TO authenticated USING(active OR public.omniqora_is_platform_admin());
CREATE POLICY "dependencies readable" ON public.omniqora_service_dependencies
  FOR SELECT TO authenticated USING(true);
CREATE POLICY "product defaults readable" ON public.omniqora_product_default_services
  FOR SELECT TO authenticated USING(true);
CREATE POLICY "blueprints readable" ON public.omniqora_blueprints
  FOR SELECT TO authenticated USING(active OR public.omniqora_is_platform_admin());
CREATE POLICY "blueprint products readable" ON public.omniqora_blueprint_products
  FOR SELECT TO authenticated USING(true);
CREATE POLICY "blueprint services readable" ON public.omniqora_blueprint_services
  FOR SELECT TO authenticated USING(true);

CREATE POLICY "tenant products visible" ON public.omniqora_tenant_products
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid())
  );
CREATE POLICY "product members visible" ON public.omniqora_product_members
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid()) OR user_id=auth.uid()
  );
CREATE POLICY "product members manageable" ON public.omniqora_product_members
  FOR ALL TO authenticated USING(public.omniqora_can_manage_tenant(tenant_id))
  WITH CHECK(public.omniqora_can_manage_tenant(tenant_id));

CREATE POLICY "tenant services visible" ON public.omniqora_tenant_services
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid())
  );
CREATE POLICY "branding visible" ON public.omniqora_tenant_branding
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid())
  );
CREATE POLICY "branding manageable" ON public.omniqora_tenant_branding
  FOR ALL TO authenticated USING(public.omniqora_can_manage_tenant(tenant_id))
  WITH CHECK(public.omniqora_can_manage_tenant(tenant_id));
CREATE POLICY "domains visible" ON public.omniqora_tenant_domains
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid())
  );
CREATE POLICY "domains manageable" ON public.omniqora_tenant_domains
  FOR ALL TO authenticated USING(public.omniqora_can_manage_tenant(tenant_id))
  WITH CHECK(public.omniqora_can_manage_tenant(tenant_id));

CREATE POLICY "subscriptions visible" ON public.omniqora_tenant_subscriptions
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
  );
CREATE POLICY "subscription items visible" ON public.omniqora_subscription_items
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
  );
CREATE POLICY "change requests visible" ON public.omniqora_change_requests
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
  );
CREATE POLICY "change requests create" ON public.omniqora_change_requests
  FOR INSERT TO authenticated WITH CHECK(
    requested_by=auth.uid() AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
  );

CREATE POLICY "connectors visible" ON public.omniqora_connector_instances
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
  );
CREATE POLICY "jobs platform read" ON public.omniqora_provisioning_jobs
  FOR SELECT TO authenticated USING(public.omniqora_is_platform_admin());
CREATE POLICY "events platform read" ON public.omniqora_event_outbox
  FOR SELECT TO authenticated USING(public.omniqora_is_platform_admin());

CREATE POLICY "customer360 read" ON public.omniqora_customer_360
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid()) OR auth_user_id=auth.uid()
  );
CREATE POLICY "customer360 manage" ON public.omniqora_customer_360
  FOR ALL TO authenticated USING(public.omniqora_can_manage_tenant(tenant_id))
  WITH CHECK(public.omniqora_can_manage_tenant(tenant_id));
CREATE POLICY "customer links read" ON public.omniqora_customer_product_links
  FOR SELECT TO authenticated USING(
    public.omniqora_is_platform_admin() OR public.is_tenant_member(tenant_id,auth.uid())
  );

GRANT SELECT ON public.omniqora_product_catalogue,public.omniqora_service_catalogue,
  public.omniqora_service_dependencies,public.omniqora_product_default_services,
  public.omniqora_blueprints,public.omniqora_blueprint_products,public.omniqora_blueprint_services,
  public.omniqora_tenant_products,public.omniqora_product_members,public.omniqora_tenant_services,
  public.omniqora_tenant_branding,public.omniqora_tenant_domains,
  public.omniqora_tenant_subscriptions,public.omniqora_subscription_items,
  public.omniqora_change_requests,public.omniqora_connector_instances,
  public.omniqora_customer_360,public.omniqora_customer_product_links
TO authenticated;
GRANT INSERT ON public.omniqora_change_requests TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.omniqora_product_members,public.omniqora_tenant_branding,
  public.omniqora_tenant_domains,public.omniqora_customer_360
TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_emit_event(
  p_tenant uuid,p_event_type text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key text; v_count integer:=0;
BEGIN
  FOR v_key IN
    SELECT product_key FROM public.omniqora_tenant_products
    WHERE tenant_id=p_tenant AND status IN ('provisioning','active')
  LOOP
    INSERT INTO public.omniqora_event_outbox(tenant_id,target_product_key,event_type,payload)
    VALUES(p_tenant,v_key,p_event_type,coalesce(p_payload,'{}'::jsonb));
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_emit_event(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_set_service(
  p_tenant uuid,p_service_key text,p_enabled boolean,p_config jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_dep text; v_blocker text; v_price integer; v_currency text; v_subscription uuid;
BEGIN
  IF NOT public.omniqora_is_platform_admin() THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  SELECT default_unit_amount_pence,currency INTO v_price,v_currency
  FROM public.omniqora_service_catalogue WHERE service_key=p_service_key AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_not_found'; END IF;

  IF p_enabled THEN
    FOR v_dep IN
      SELECT depends_on_service_key FROM public.omniqora_service_dependencies
      WHERE service_key=p_service_key AND required
    LOOP
      PERFORM public.omniqora_set_service(p_tenant,v_dep,true,'{}'::jsonb);
    END LOOP;

    INSERT INTO public.omniqora_tenant_services(
      tenant_id,service_key,status,quantity,unit_amount_pence,config,activated_at,cancelled_at,updated_at
    ) VALUES(
      p_tenant,p_service_key,'active',1,v_price,coalesce(p_config,'{}'::jsonb),now(),null,now()
    )
    ON CONFLICT(tenant_id,service_key) DO UPDATE SET
      status='active',quantity=greatest(public.omniqora_tenant_services.quantity,1),
      unit_amount_pence=excluded.unit_amount_pence,
      config=public.omniqora_tenant_services.config||excluded.config,
      activated_at=coalesce(public.omniqora_tenant_services.activated_at,now()),
      cancelled_at=null,updated_at=now();

    SELECT id INTO v_subscription FROM public.omniqora_tenant_subscriptions WHERE tenant_id=p_tenant;
    IF v_subscription IS NULL THEN
      INSERT INTO public.omniqora_tenant_subscriptions(
        tenant_id,status,base_plan,currency,current_period_start
      ) VALUES(p_tenant,'active','core',v_currency,now())
      RETURNING id INTO v_subscription;
    END IF;

    INSERT INTO public.omniqora_subscription_items(
      tenant_id,subscription_id,item_type,item_key,quantity,unit_amount_pence,active_from,cancel_at
    ) VALUES(p_tenant,v_subscription,'addon',p_service_key,1,v_price,now(),null)
    ON CONFLICT(subscription_id,item_type,item_key) DO UPDATE SET
      quantity=1,unit_amount_pence=excluded.unit_amount_pence,cancel_at=null;

    INSERT INTO public.omniqora_provisioning_jobs(
      tenant_id,service_key,job_type,status,payload,completed_at
    ) VALUES(p_tenant,p_service_key,'service.activate','completed',
      jsonb_build_object('serviceKey',p_service_key),now());

    IF p_service_key='omniqora.rrci' THEN
      INSERT INTO public.addon_entitlements(tenant_id,addon,status,valid_until,billing_reference,updated_at)
      VALUES(p_tenant,'rrci','active',now()+interval '10 years','omniqora-control-plane',now())
      ON CONFLICT(tenant_id,addon) DO UPDATE SET
        status='active',valid_until=now()+interval '10 years',
        billing_reference='omniqora-control-plane',updated_at=now();
    END IF;

    PERFORM public.omniqora_emit_event(
      p_tenant,'service.activated',jsonb_build_object('serviceKey',p_service_key,'config',coalesce(p_config,'{}'::jsonb))
    );
  ELSE
    SELECT d.service_key INTO v_blocker
    FROM public.omniqora_service_dependencies d
    JOIN public.omniqora_tenant_services ts
      ON ts.tenant_id=p_tenant AND ts.service_key=d.service_key AND ts.status='active'
    WHERE d.depends_on_service_key=p_service_key AND d.required LIMIT 1;
    IF v_blocker IS NOT NULL THEN RAISE EXCEPTION 'service_required_by:%',v_blocker; END IF;

    UPDATE public.omniqora_tenant_services
    SET status='cancelled',cancelled_at=now(),updated_at=now()
    WHERE tenant_id=p_tenant AND service_key=p_service_key;

    UPDATE public.omniqora_subscription_items si
    SET cancel_at=coalesce(si.cancel_at,now())
    FROM public.omniqora_tenant_subscriptions s
    WHERE s.id=si.subscription_id AND s.tenant_id=p_tenant
      AND si.item_type='addon' AND si.item_key=p_service_key;

    INSERT INTO public.omniqora_provisioning_jobs(
      tenant_id,service_key,job_type,status,payload,completed_at
    ) VALUES(p_tenant,p_service_key,'service.deactivate','completed',
      jsonb_build_object('serviceKey',p_service_key),now());

    IF p_service_key='omniqora.rrci' THEN
      UPDATE public.addon_entitlements
      SET status='cancelled',valid_until=now(),updated_at=now()
      WHERE tenant_id=p_tenant AND addon='rrci';
    END IF;

    PERFORM public.omniqora_emit_event(
      p_tenant,'service.deactivated',jsonb_build_object('serviceKey',p_service_key)
    );
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_set_service(uuid,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_set_service(uuid,text,boolean,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.omniqora_attach_product(
  p_tenant uuid,p_product_key text,p_config jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_service text; v_price integer; v_currency text; v_subscription uuid;
BEGIN
  IF NOT public.omniqora_is_platform_admin() THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  SELECT default_unit_amount_pence,currency INTO v_price,v_currency
  FROM public.omniqora_product_catalogue WHERE product_key=p_product_key AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;

  INSERT INTO public.omniqora_tenant_products(
    tenant_id,product_key,status,config,activated_at,cancelled_at,updated_at
  ) VALUES(p_tenant,p_product_key,'active',coalesce(p_config,'{}'::jsonb),now(),null,now())
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET
    status='active',config=public.omniqora_tenant_products.config||excluded.config,
    activated_at=coalesce(public.omniqora_tenant_products.activated_at,now()),
    cancelled_at=null,updated_at=now();

  INSERT INTO public.omniqora_tenant_branding(
    tenant_id,product_key,display_name
  ) SELECT p_tenant,p_product_key,t.name FROM public.tenants t WHERE t.id=p_tenant
  ON CONFLICT(tenant_id,product_key) DO NOTHING;

  SELECT id INTO v_subscription FROM public.omniqora_tenant_subscriptions WHERE tenant_id=p_tenant;
  IF v_subscription IS NULL THEN
    INSERT INTO public.omniqora_tenant_subscriptions(
      tenant_id,status,base_plan,currency,current_period_start
    ) VALUES(p_tenant,'active','core',v_currency,now())
    RETURNING id INTO v_subscription;
  END IF;

  INSERT INTO public.omniqora_subscription_items(
    tenant_id,subscription_id,item_type,item_key,quantity,unit_amount_pence,active_from,cancel_at
  ) VALUES(p_tenant,v_subscription,'base',p_product_key,1,v_price,now(),null)
  ON CONFLICT(subscription_id,item_type,item_key) DO UPDATE SET
    quantity=1,unit_amount_pence=excluded.unit_amount_pence,cancel_at=null;

  FOR v_service IN
    SELECT service_key FROM public.omniqora_product_default_services
    WHERE product_key=p_product_key AND required
  LOOP
    PERFORM public.omniqora_set_service(p_tenant,v_service,true,'{}'::jsonb);
  END LOOP;

  INSERT INTO public.omniqora_provisioning_jobs(
    tenant_id,product_key,job_type,status,payload,completed_at
  ) VALUES(p_tenant,p_product_key,'product.activate','completed',
    jsonb_build_object('productKey',p_product_key,'config',coalesce(p_config,'{}'::jsonb)),now());

  PERFORM public.omniqora_emit_event(
    p_tenant,'product.activated',jsonb_build_object('productKey',p_product_key,'config',coalesce(p_config,'{}'::jsonb))
  );
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_attach_product(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_attach_product(uuid,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.omniqora_set_branding(
  p_tenant uuid,p_product_key text,p_branding jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.omniqora_can_manage_tenant(p_tenant) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.omniqora_tenant_products
    WHERE tenant_id=p_tenant AND product_key=p_product_key AND status<>'cancelled'
  ) THEN RAISE EXCEPTION 'tenant_product_not_found'; END IF;

  INSERT INTO public.omniqora_tenant_branding(
    tenant_id,product_key,display_name,logo_url,dark_logo_url,favicon_url,
    primary_color,secondary_color,accent_color,font_family,support_phone,support_email,
    social_urls,terms_url,privacy_url,email_domain,email_from_name,email_from_address,metadata,updated_at
  ) VALUES(
    p_tenant,p_product_key,nullif(p_branding->>'displayName',''),nullif(p_branding->>'logoUrl',''),
    nullif(p_branding->>'darkLogoUrl',''),nullif(p_branding->>'faviconUrl',''),
    nullif(p_branding->>'primaryColor',''),nullif(p_branding->>'secondaryColor',''),
    nullif(p_branding->>'accentColor',''),nullif(p_branding->>'fontFamily',''),
    nullif(p_branding->>'supportPhone',''),nullif(p_branding->>'supportEmail',''),
    coalesce(p_branding->'socialUrls','{}'::jsonb),nullif(p_branding->>'termsUrl',''),
    nullif(p_branding->>'privacyUrl',''),nullif(p_branding->>'emailDomain',''),
    nullif(p_branding->>'emailFromName',''),nullif(p_branding->>'emailFromAddress',''),
    coalesce(p_branding->'metadata','{}'::jsonb),now()
  )
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET
    display_name=coalesce(excluded.display_name,public.omniqora_tenant_branding.display_name),
    logo_url=coalesce(excluded.logo_url,public.omniqora_tenant_branding.logo_url),
    dark_logo_url=coalesce(excluded.dark_logo_url,public.omniqora_tenant_branding.dark_logo_url),
    favicon_url=coalesce(excluded.favicon_url,public.omniqora_tenant_branding.favicon_url),
    primary_color=coalesce(excluded.primary_color,public.omniqora_tenant_branding.primary_color),
    secondary_color=coalesce(excluded.secondary_color,public.omniqora_tenant_branding.secondary_color),
    accent_color=coalesce(excluded.accent_color,public.omniqora_tenant_branding.accent_color),
    font_family=coalesce(excluded.font_family,public.omniqora_tenant_branding.font_family),
    support_phone=coalesce(excluded.support_phone,public.omniqora_tenant_branding.support_phone),
    support_email=coalesce(excluded.support_email,public.omniqora_tenant_branding.support_email),
    social_urls=public.omniqora_tenant_branding.social_urls||excluded.social_urls,
    terms_url=coalesce(excluded.terms_url,public.omniqora_tenant_branding.terms_url),
    privacy_url=coalesce(excluded.privacy_url,public.omniqora_tenant_branding.privacy_url),
    email_domain=coalesce(excluded.email_domain,public.omniqora_tenant_branding.email_domain),
    email_from_name=coalesce(excluded.email_from_name,public.omniqora_tenant_branding.email_from_name),
    email_from_address=coalesce(excluded.email_from_address,public.omniqora_tenant_branding.email_from_address),
    metadata=public.omniqora_tenant_branding.metadata||excluded.metadata,updated_at=now();

  PERFORM public.omniqora_emit_event(
    p_tenant,'branding.updated',jsonb_build_object('productKey',p_product_key,'branding',p_branding)
  );
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_set_branding(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_set_branding(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_set_domain(
  p_tenant uuid,p_product_key text,p_hostname text,p_domain_type text DEFAULT 'web',p_primary boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_host text; v_id uuid; v_owner uuid;
BEGIN
  IF NOT public.omniqora_can_manage_tenant(p_tenant) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_domain_type NOT IN ('web','portal','api','tracking','email') THEN RAISE EXCEPTION 'invalid_domain_type'; END IF;
  v_host:=split_part(lower(trim(regexp_replace(coalesce(p_hostname,''),'^https?://','','i'))),'/',1);
  IF v_host='' THEN RAISE EXCEPTION 'hostname_required'; END IF;
  SELECT tenant_id INTO v_owner FROM public.omniqora_tenant_domains WHERE hostname=v_host;
  IF v_owner IS NOT NULL AND v_owner<>p_tenant THEN RAISE EXCEPTION 'domain_already_claimed'; END IF;

  IF p_primary THEN
    UPDATE public.omniqora_tenant_domains SET primary_domain=false,updated_at=now()
    WHERE tenant_id=p_tenant AND product_key IS NOT DISTINCT FROM p_product_key AND domain_type=p_domain_type;
  END IF;

  INSERT INTO public.omniqora_tenant_domains(
    tenant_id,product_key,hostname,domain_type,primary_domain,verification_status,ssl_status
  ) VALUES(p_tenant,p_product_key,v_host,p_domain_type,p_primary,'pending','pending')
  ON CONFLICT(hostname) DO UPDATE SET
    product_key=excluded.product_key,domain_type=excluded.domain_type,
    primary_domain=excluded.primary_domain,verification_status='pending',ssl_status='pending',updated_at=now()
  RETURNING id INTO v_id;

  PERFORM public.omniqora_emit_event(
    p_tenant,'domain.updated',jsonb_build_object('productKey',p_product_key,'hostname',v_host,'domainType',p_domain_type,'primary',p_primary)
  );
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_set_domain(uuid,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_set_domain(uuid,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_provision_tenant(
  p_organisation_name text,p_organisation_slug text,p_name text,p_slug text,
  p_country_code text DEFAULT 'GB',p_currency text DEFAULT 'GBP',p_timezone text DEFAULT 'Europe/London',
  p_product_keys text[] DEFAULT '{}'::text[],p_blueprint_key text DEFAULT null,
  p_service_keys text[] DEFAULT '{}'::text[],p_branding jsonb DEFAULT '{}'::jsonb,
  p_primary_domain text DEFAULT null,p_settings jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_org uuid; v_tenant uuid; v_key text;
  v_products text[]:=coalesce(p_product_keys,'{}'::text[]);
  v_services text[]:=coalesce(p_service_keys,'{}'::text[]);
BEGIN
  IF NOT public.omniqora_is_platform_admin() THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  IF nullif(trim(p_organisation_name),'') IS NULL OR nullif(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR p_organisation_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN RAISE EXCEPTION 'invalid_slug'; END IF;
  IF EXISTS(SELECT 1 FROM public.tenants WHERE slug=p_slug) THEN RAISE EXCEPTION 'tenant_slug_exists'; END IF;

  IF p_blueprint_key IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.omniqora_blueprints WHERE blueprint_key=p_blueprint_key AND active)
    THEN RAISE EXCEPTION 'blueprint_not_found'; END IF;
    FOR v_key IN SELECT product_key FROM public.omniqora_blueprint_products
      WHERE blueprint_key=p_blueprint_key AND required
    LOOP
      IF NOT v_key=ANY(v_products) THEN v_products:=array_append(v_products,v_key); END IF;
    END LOOP;
    FOR v_key IN SELECT service_key FROM public.omniqora_blueprint_services
      WHERE blueprint_key=p_blueprint_key AND required
    LOOP
      IF NOT v_key=ANY(v_services) THEN v_services:=array_append(v_services,v_key); END IF;
    END LOOP;
  END IF;
  IF cardinality(v_products)=0 THEN RAISE EXCEPTION 'at_least_one_product_required'; END IF;

  SELECT id INTO v_org FROM public.omniqora_organisations WHERE slug=p_organisation_slug;
  IF v_org IS NULL THEN
    INSERT INTO public.omniqora_organisations(
      name,slug,country_code,currency,timezone,metadata
    ) VALUES(
      trim(p_organisation_name),p_organisation_slug,upper(p_country_code),upper(p_currency),p_timezone,
      jsonb_build_object('createdBy','omniqora-saas-factory')
    ) RETURNING id INTO v_org;
  END IF;

  INSERT INTO public.tenants(
    organisation_id,name,slug,status,country_code,currency,timezone,settings
  ) VALUES(
    v_org,trim(p_name),p_slug,'provisioning',upper(p_country_code),upper(p_currency),p_timezone,
    coalesce(p_settings,'{}'::jsonb)||jsonb_build_object('blueprintKey',p_blueprint_key)
  ) RETURNING id INTO v_tenant;

  FOR v_key IN SELECT DISTINCT unnest(v_products) LOOP
    PERFORM public.omniqora_attach_product(v_tenant,v_key,
      CASE WHEN p_blueprint_key IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('blueprintKey',p_blueprint_key) END);
    PERFORM public.omniqora_set_branding(v_tenant,v_key,p_branding);
  END LOOP;

  FOR v_key IN SELECT DISTINCT unnest(v_services) LOOP
    PERFORM public.omniqora_set_service(v_tenant,v_key,true,'{}'::jsonb);
  END LOOP;

  IF nullif(trim(p_primary_domain),'') IS NOT NULL THEN
    PERFORM public.omniqora_set_domain(v_tenant,null,p_primary_domain,'web',true);
  END IF;

  UPDATE public.tenants SET status='ready',updated_at=now() WHERE id=v_tenant;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(v_tenant,auth.uid(),'omniqora.tenant.provisioned','tenant',v_tenant::text,
    jsonb_build_object('organisationId',v_org,'products',v_products,'services',v_services,'blueprintKey',p_blueprint_key));

  PERFORM public.omniqora_emit_event(v_tenant,'tenant.provisioned',
    jsonb_build_object('organisationId',v_org,'tenantId',v_tenant,'products',v_products,'blueprintKey',p_blueprint_key));
  RETURN v_tenant;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_provision_tenant(
  text,text,text,text,text,text,text,text[],text,text[],jsonb,text,jsonb
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_provision_tenant(
  text,text,text,text,text,text,text,text[],text,text[],jsonb,text,jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_request_change(
  p_tenant uuid,p_change_type text,p_target_key text,p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_tenant_role(p_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_change_type NOT IN ('add_product','remove_product','add_addon','remove_addon','add_location','remove_location')
  THEN RAISE EXCEPTION 'invalid_change_type'; END IF;
  INSERT INTO public.omniqora_change_requests(
    tenant_id,requested_by,change_type,target_key,metadata
  ) VALUES(p_tenant,auth.uid(),p_change_type,p_target_key,coalesce(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_request_change(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_request_change(uuid,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_decide_change(
  p_request uuid,p_decision text,p_quote integer DEFAULT null,p_notes text DEFAULT null
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.omniqora_change_requests%rowtype; v_enable boolean;
BEGIN
  IF NOT public.omniqora_is_platform_admin() THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  SELECT * INTO v FROM public.omniqora_change_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF p_decision NOT IN ('approved','rejected','awaiting_payment','completed') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  IF p_decision='completed' THEN
    IF v.change_type IN ('add_addon','remove_addon') THEN
      v_enable:=v.change_type='add_addon';
      PERFORM public.omniqora_set_service(v.tenant_id,v.target_key,v_enable,
        coalesce(v.metadata,'{}'::jsonb)||jsonb_build_object('changeRequestId',v.id));
      IF v_enable AND p_quote IS NOT NULL THEN
        UPDATE public.omniqora_tenant_services SET unit_amount_pence=greatest(p_quote,0),updated_at=now()
        WHERE tenant_id=v.tenant_id AND service_key=v.target_key;
        UPDATE public.omniqora_subscription_items si SET unit_amount_pence=greatest(p_quote,0)
        FROM public.omniqora_tenant_subscriptions s
        WHERE s.id=si.subscription_id AND s.tenant_id=v.tenant_id
          AND si.item_type='addon' AND si.item_key=v.target_key AND si.cancel_at IS NULL;
      END IF;
    ELSIF v.change_type='add_product' THEN
      PERFORM public.omniqora_attach_product(v.tenant_id,v.target_key,coalesce(v.metadata,'{}'::jsonb));
    ELSIF v.change_type='remove_product' THEN
      UPDATE public.omniqora_tenant_products
      SET status='cancelled',cancelled_at=now(),updated_at=now()
      WHERE tenant_id=v.tenant_id AND product_key=v.target_key;
      UPDATE public.omniqora_subscription_items si SET cancel_at=coalesce(si.cancel_at,now())
      FROM public.omniqora_tenant_subscriptions s
      WHERE s.id=si.subscription_id AND s.tenant_id=v.tenant_id
        AND si.item_type='base' AND si.item_key=v.target_key;
      PERFORM public.omniqora_emit_event(v.tenant_id,'product.deactivated',jsonb_build_object('productKey',v.target_key));
    END IF;
  END IF;

  UPDATE public.omniqora_change_requests SET
    status=p_decision,quoted_amount_pence=coalesce(p_quote,quoted_amount_pence),
    landlord_notes=coalesce(p_notes,landlord_notes),
    approved_by=CASE WHEN p_decision IN ('approved','awaiting_payment','completed') THEN auth.uid() ELSE approved_by END,
    approved_at=CASE WHEN p_decision IN ('approved','awaiting_payment','completed') THEN coalesce(approved_at,now()) ELSE approved_at END,
    completed_at=CASE WHEN p_decision='completed' THEN now() ELSE completed_at END
  WHERE id=p_request;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_decide_change(uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_decide_change(uuid,text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_factory_catalogue()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.omniqora_is_platform_admin() THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  RETURN jsonb_build_object(
    'products',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key',p.product_key,'name',p.name,'description',p.description,'category',p.category,
        'runtimeKey',p.runtime_key,'metadata',p.metadata,'pricePence',p.default_unit_amount_pence,
        'currency',p.currency,'defaultServices',coalesce((
          SELECT jsonb_agg(d.service_key ORDER BY d.service_key)
          FROM public.omniqora_product_default_services d WHERE d.product_key=p.product_key
        ),'[]'::jsonb)
      ) ORDER BY p.sort_order,p.name)
      FROM public.omniqora_product_catalogue p WHERE p.active
    ),'[]'::jsonb),
    'services',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key',s.service_key,'name',s.name,'description',s.description,'category',s.category,
        'kind',s.service_kind,'billingBasis',s.billing_basis,'pricePence',s.default_unit_amount_pence,
        'currency',s.currency,'runtimeKey',s.runtime_key,'metadata',s.metadata,'requires',coalesce((
          SELECT jsonb_agg(d.depends_on_service_key ORDER BY d.depends_on_service_key)
          FROM public.omniqora_service_dependencies d WHERE d.service_key=s.service_key AND d.required
        ),'[]'::jsonb)
      ) ORDER BY s.category,s.name)
      FROM public.omniqora_service_catalogue s WHERE s.active
    ),'[]'::jsonb),
    'blueprints',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key',b.blueprint_key,'name',b.name,'description',b.description,'category',b.category,
        'countryCode',b.country_code,'defaults',b.defaults,'metadata',b.metadata,
        'products',coalesce((SELECT jsonb_agg(jsonb_build_object('key',bp.product_key,'required',bp.required))
          FROM public.omniqora_blueprint_products bp WHERE bp.blueprint_key=b.blueprint_key),'[]'::jsonb),
        'services',coalesce((SELECT jsonb_agg(jsonb_build_object('key',bs.service_key,'required',bs.required))
          FROM public.omniqora_blueprint_services bs WHERE bs.blueprint_key=b.blueprint_key),'[]'::jsonb)
      ) ORDER BY b.sort_order,b.name)
      FROM public.omniqora_blueprints b WHERE b.active
    ),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.omniqora_factory_catalogue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_factory_catalogue() TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_tenant_control(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.omniqora_is_platform_admin() THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  RETURN jsonb_build_object(
    'tenant',(SELECT to_jsonb(t) FROM public.tenants t WHERE t.id=p_tenant),
    'organisation',(SELECT to_jsonb(o) FROM public.omniqora_organisations o
      JOIN public.tenants t ON t.organisation_id=o.id WHERE t.id=p_tenant),
    'products',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'key',tp.product_key,'name',pc.name,'status',tp.status,'planKey',tp.plan_key,'config',tp.config
    ) ORDER BY pc.sort_order) FROM public.omniqora_tenant_products tp
      JOIN public.omniqora_product_catalogue pc ON pc.product_key=tp.product_key
      WHERE tp.tenant_id=p_tenant),'[]'::jsonb),
    'services',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'key',ts.service_key,'name',sc.name,'category',sc.category,'status',ts.status,'config',ts.config,
      'pricePence',ts.unit_amount_pence
    ) ORDER BY sc.category,sc.name) FROM public.omniqora_tenant_services ts
      JOIN public.omniqora_service_catalogue sc ON sc.service_key=ts.service_key
      WHERE ts.tenant_id=p_tenant),'[]'::jsonb),
    'branding',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.omniqora_tenant_branding b WHERE b.tenant_id=p_tenant),'[]'::jsonb),
    'domains',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM public.omniqora_tenant_domains d WHERE d.tenant_id=p_tenant),'[]'::jsonb),
    'jobs',coalesce((SELECT jsonb_agg(to_jsonb(j) ORDER BY j.created_at DESC)
      FROM (SELECT * FROM public.omniqora_provisioning_jobs WHERE tenant_id=p_tenant ORDER BY created_at DESC LIMIT 100) j),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.omniqora_tenant_control(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_tenant_control(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.server_omniqora_tenant_manifest(p_tenant uuid,p_product_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
  THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.omniqora_tenant_products
    WHERE tenant_id=p_tenant AND product_key=p_product_key AND status IN ('provisioning','active'))
  THEN RAISE EXCEPTION 'tenant_product_not_active'; END IF;
  RETURN jsonb_build_object(
    'tenant',(SELECT jsonb_build_object(
      'id',t.id,'organisationId',t.organisation_id,'name',t.name,'slug',t.slug,'status',t.status,
      'countryCode',t.country_code,'currency',t.currency,'timezone',t.timezone,'settings',t.settings
    ) FROM public.tenants t WHERE t.id=p_tenant),
    'product',(SELECT jsonb_build_object('key',p.product_key,'planKey',p.plan_key,'config',p.config)
      FROM public.omniqora_tenant_products p WHERE p.tenant_id=p_tenant AND p.product_key=p_product_key),
    'branding',(SELECT to_jsonb(b) FROM public.omniqora_tenant_branding b
      WHERE b.tenant_id=p_tenant AND b.product_key=p_product_key),
    'domains',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM public.omniqora_tenant_domains d
      WHERE d.tenant_id=p_tenant AND (d.product_key IS NULL OR d.product_key=p_product_key)),'[]'::jsonb),
    'services',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'key',s.service_key,'category',c.category,'runtimeKey',c.runtime_key,'config',s.config
    ) ORDER BY s.service_key) FROM public.omniqora_tenant_services s
      JOIN public.omniqora_service_catalogue c ON c.service_key=s.service_key
      WHERE s.tenant_id=p_tenant AND s.status='active'),'[]'::jsonb),
    'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'userId',m.user_id,'role',m.role,'config',m.config
    )) FROM public.omniqora_product_members m
      WHERE m.tenant_id=p_tenant AND m.product_key=p_product_key AND m.active),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.server_omniqora_tenant_manifest(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_omniqora_tenant_manifest(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.server_find_auth_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_user uuid;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
  THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email)=lower(trim(p_email)) LIMIT 1;
  RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION public.server_find_auth_user_by_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_find_auth_user_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.server_claim_omniqora_events(
  p_product_key text,p_worker text,p_limit integer DEFAULT 50
) RETURNS SETOF public.omniqora_event_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
  THEN RAISE EXCEPTION 'service_role_required'; END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.omniqora_event_outbox
    WHERE target_product_key=p_product_key AND status IN ('pending','failed')
      AND next_attempt_at<=now() AND attempts<8
      AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
    ORDER BY id LIMIT greatest(1,least(coalesce(p_limit,50),200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.omniqora_event_outbox e
  SET status='processing',attempts=e.attempts+1,locked_at=now(),locked_by=p_worker
  FROM picked WHERE e.id=picked.id RETURNING e.*;
END $$;
REVOKE ALL ON FUNCTION public.server_claim_omniqora_events(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_claim_omniqora_events(text,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.server_finish_omniqora_event(
  p_event bigint,p_success boolean,p_error text DEFAULT null
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_attempts integer;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
  THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT attempts INTO v_attempts FROM public.omniqora_event_outbox WHERE id=p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  UPDATE public.omniqora_event_outbox SET
    status=CASE WHEN p_success THEN 'sent' WHEN v_attempts>=8 THEN 'dead' ELSE 'failed' END,
    sent_at=CASE WHEN p_success THEN now() ELSE sent_at END,
    last_error=CASE WHEN p_success THEN null ELSE left(coalesce(p_error,'event_delivery_failed'),1000) END,
    next_attempt_at=CASE WHEN p_success OR v_attempts>=8 THEN next_attempt_at ELSE now()+interval '5 minutes' END,
    locked_at=null,locked_by=null
  WHERE id=p_event;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.server_finish_omniqora_event(bigint,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_finish_omniqora_event(bigint,boolean,text) TO service_role;

COMMIT;
