-- Reusable Childcare industry layer.
-- Sensitive safeguarding/incident casework remains in Compliance/Support, not ordinary portal tables.
BEGIN;

INSERT INTO public.platform_modules(
  module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities
) VALUES(
  'childcare.core',
  'Omniqora Childcare',
  'childcare',
  '1.0.0-preview',
  'preview',
  'hybrid',
  ARRAY['crm.core','marketplace.core','bookings.core','documents.core','compliance.core','platform.audit'],
  ARRAY['children','guardians','providers','placements','attendance','funding','training','matching','safeguarding_bridge']
)
ON CONFLICT(module_key) DO UPDATE SET
  name=EXCLUDED.name,
  module_kind=EXCLUDED.module_kind,
  version=EXCLUDED.version,
  status=EXCLUDED.status,
  ui_mode=EXCLUDED.ui_mode,
  dependencies=EXCLUDED.dependencies,
  capabilities=EXCLUDED.capabilities,
  updated_at=now();

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT 'kindelo','childcare.core',true
WHERE EXISTS(SELECT 1 FROM public.platform_products WHERE product_key='kindelo')
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=true;

CREATE TABLE IF NOT EXISTS public.childcare_children(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  external_ref text,
  first_name text NOT NULL,
  last_name text,
  date_of_birth date NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS childcare_children_external_uq
  ON public.childcare_children(tenant_id,tenant_product_id,external_ref)
  WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS childcare_children_product_idx
  ON public.childcare_children(tenant_id,tenant_product_id,status,date_of_birth);

CREATE TABLE IF NOT EXISTS public.childcare_guardian_links(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.childcare_children(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  can_book boolean NOT NULL DEFAULT true,
  can_view_funding boolean NOT NULL DEFAULT true,
  can_manage_child boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id,crm_person_id)
);
CREATE INDEX IF NOT EXISTS childcare_guardian_links_person_idx
  ON public.childcare_guardian_links(tenant_id,crm_person_id,child_id);

CREATE TABLE IF NOT EXISTS public.childcare_provider_profiles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'childminder'
    CHECK(provider_type IN ('childminder','nursery','care_agency','other')),
  regulator_ref text,
  registration_ref text,
  service_age_groups text[] NOT NULL DEFAULT '{}',
  max_children integer CHECK(max_children IS NULL OR max_children>0),
  languages text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','onboarding','review','active','suspended','closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_product_id,vendor_id)
);
CREATE INDEX IF NOT EXISTS childcare_provider_profiles_status_idx
  ON public.childcare_provider_profiles(tenant_id,tenant_product_id,status);

CREATE TABLE IF NOT EXISTS public.childcare_placements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.childcare_children(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  starts_on date NOT NULL,
  ends_on date,
  funded_hours_per_week numeric CHECK(funded_hours_per_week IS NULL OR funded_hours_per_week>=0),
  private_hours_per_week numeric CHECK(private_hours_per_week IS NULL OR private_hours_per_week>=0),
  status text NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','active','paused','ended','cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE INDEX IF NOT EXISTS childcare_placements_child_idx
  ON public.childcare_placements(tenant_id,child_id,status,starts_on);
CREATE INDEX IF NOT EXISTS childcare_placements_vendor_idx
  ON public.childcare_placements(tenant_id,vendor_id,status,starts_on);

CREATE TABLE IF NOT EXISTS public.childcare_attendance(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL REFERENCES public.childcare_placements(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  check_in_at timestamptz,
  check_out_at timestamptz,
  attended_minutes integer CHECK(attended_minutes IS NULL OR attended_minutes>=0),
  absence_reason text,
  confirmed_by_guardian_at timestamptz,
  confirmed_by_provider_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(placement_id,attendance_date),
  CHECK(check_out_at IS NULL OR check_in_at IS NULL OR check_out_at>=check_in_at)
);
CREATE INDEX IF NOT EXISTS childcare_attendance_date_idx
  ON public.childcare_attendance(tenant_id,attendance_date,placement_id);

CREATE TABLE IF NOT EXISTS public.childcare_funding_cases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.childcare_children(id) ON DELETE CASCADE,
  guardian_crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE RESTRICT,
  funding_type text NOT NULL,
  authority text,
  eligibility_ref text,
  approved_hours_per_week numeric CHECK(approved_hours_per_week IS NULL OR approved_hours_per_week>=0),
  hourly_rate_minor bigint CHECK(hourly_rate_minor IS NULL OR hourly_rate_minor>=0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','checking','eligible','ineligible','approved','active','closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on)
);
CREATE INDEX IF NOT EXISTS childcare_funding_cases_child_idx
  ON public.childcare_funding_cases(tenant_id,child_id,status);

CREATE TABLE IF NOT EXISTS public.childcare_funding_claims(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  funding_case_id uuid NOT NULL REFERENCES public.childcare_funding_cases(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  claimed_minutes integer NOT NULL DEFAULT 0 CHECK(claimed_minutes>=0),
  claimed_minor bigint NOT NULL DEFAULT 0 CHECK(claimed_minor>=0),
  paid_minor bigint NOT NULL DEFAULT 0 CHECK(paid_minor>=0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','submitted','accepted','part_paid','paid','rejected','cancelled')),
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(funding_case_id,period_start,period_end),
  CHECK(period_end>=period_start),
  CHECK(paid_minor<=claimed_minor)
);
CREATE INDEX IF NOT EXISTS childcare_funding_claims_status_idx
  ON public.childcare_funding_claims(tenant_id,status,period_start);

CREATE TABLE IF NOT EXISTS public.childcare_training_records(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  training_key text NOT NULL,
  title text NOT NULL,
  issuer text,
  completed_on date,
  expires_on date,
  document_id uuid REFERENCES public.platform_documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'declared'
    CHECK(status IN ('declared','evidence_uploaded','verified','expired','rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id,training_key,completed_on),
  CHECK(expires_on IS NULL OR completed_on IS NULL OR expires_on>=completed_on)
);
CREATE INDEX IF NOT EXISTS childcare_training_vendor_idx
  ON public.childcare_training_records(tenant_id,vendor_id,status,expires_on);

CREATE OR REPLACE FUNCTION public.is_childcare_guardian(
  _tenant uuid,
  _child uuid,
  _user uuid,
  _require_manage boolean DEFAULT false,
  _require_funding boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $child_guardian$
  SELECT EXISTS(
    SELECT 1
    FROM public.childcare_children c
    JOIN public.childcare_guardian_links g
      ON g.child_id=c.id AND g.tenant_id=c.tenant_id
    JOIN public.customer_portal_users cu
      ON cu.tenant_id=c.tenant_id
      AND cu.tenant_product_id=c.tenant_product_id
      AND cu.crm_person_id=g.crm_person_id
      AND cu.user_id=_user
      AND cu.status='active'
    WHERE c.id=_child
      AND c.tenant_id=_tenant
      AND (NOT _require_manage OR g.can_manage_child)
      AND (NOT _require_funding OR g.can_view_funding)
  );
$child_guardian$;

REVOKE EXECUTE ON FUNCTION public.is_childcare_guardian(uuid,uuid,uuid,boolean,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_childcare_guardian(uuid,uuid,uuid,boolean,boolean)
  TO authenticated,service_role;

DO $childcare_rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'childcare_children','childcare_guardian_links','childcare_provider_profiles',
    'childcare_placements','childcare_attendance','childcare_funding_cases',
    'childcare_funding_claims','childcare_training_records'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','childcare staff read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'childcare staff read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','childcare staff write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))',
      'childcare staff write',t
    );
  END LOOP;
END
$childcare_rls$;

-- Parent/guardian read access: own linked children and operational records only.
DROP POLICY IF EXISTS "childcare guardian child read" ON public.childcare_children;
CREATE POLICY "childcare guardian child read"
ON public.childcare_children FOR SELECT TO authenticated
USING(public.is_childcare_guardian(tenant_id,id,auth.uid(),false,false));

DROP POLICY IF EXISTS "childcare guardian link read" ON public.childcare_guardian_links;
CREATE POLICY "childcare guardian link read"
ON public.childcare_guardian_links FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1
    FROM public.childcare_children c
    WHERE c.id=child_id
      AND c.tenant_id=childcare_guardian_links.tenant_id
      AND public.is_childcare_guardian(c.tenant_id,c.id,auth.uid(),false,false)
  )
);

DROP POLICY IF EXISTS "childcare guardian placement read" ON public.childcare_placements;
CREATE POLICY "childcare guardian placement read"
ON public.childcare_placements FOR SELECT TO authenticated
USING(public.is_childcare_guardian(tenant_id,child_id,auth.uid(),false,false));

DROP POLICY IF EXISTS "childcare guardian attendance read" ON public.childcare_attendance;
CREATE POLICY "childcare guardian attendance read"
ON public.childcare_attendance FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1
    FROM public.childcare_placements p
    WHERE p.id=placement_id
      AND p.tenant_id=childcare_attendance.tenant_id
      AND public.is_childcare_guardian(p.tenant_id,p.child_id,auth.uid(),false,false)
  )
);

DROP POLICY IF EXISTS "childcare guardian funding read" ON public.childcare_funding_cases;
CREATE POLICY "childcare guardian funding read"
ON public.childcare_funding_cases FOR SELECT TO authenticated
USING(public.is_childcare_guardian(tenant_id,child_id,auth.uid(),false,true));

DROP POLICY IF EXISTS "childcare guardian claim read" ON public.childcare_funding_claims;
CREATE POLICY "childcare guardian claim read"
ON public.childcare_funding_claims FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1
    FROM public.childcare_funding_cases f
    WHERE f.id=funding_case_id
      AND f.tenant_id=childcare_funding_claims.tenant_id
      AND public.is_childcare_guardian(f.tenant_id,f.child_id,auth.uid(),false,true)
  )
);

-- Provider read access: own provider profile, placements, attendance and training.
DROP POLICY IF EXISTS "childcare provider profile read" ON public.childcare_provider_profiles;
CREATE POLICY "childcare provider profile read"
ON public.childcare_provider_profiles FOR SELECT TO authenticated
USING(public.has_marketplace_vendor_access(
  tenant_id,vendor_id,auth.uid(),
  ARRAY['vendor_owner','vendor_admin','vendor_staff','vendor_viewer']
));

DROP POLICY IF EXISTS "childcare provider placement read" ON public.childcare_placements;
CREATE POLICY "childcare provider placement read"
ON public.childcare_placements FOR SELECT TO authenticated
USING(public.has_marketplace_vendor_access(
  tenant_id,vendor_id,auth.uid(),
  ARRAY['vendor_owner','vendor_admin','vendor_staff','vendor_viewer']
));

DROP POLICY IF EXISTS "childcare provider attendance read" ON public.childcare_attendance;
CREATE POLICY "childcare provider attendance read"
ON public.childcare_attendance FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1
    FROM public.childcare_placements p
    WHERE p.id=placement_id
      AND p.tenant_id=childcare_attendance.tenant_id
      AND public.has_marketplace_vendor_access(
        p.tenant_id,p.vendor_id,auth.uid(),
        ARRAY['vendor_owner','vendor_admin','vendor_staff','vendor_viewer']
      )
  )
);

DROP POLICY IF EXISTS "childcare provider training read" ON public.childcare_training_records;
CREATE POLICY "childcare provider training read"
ON public.childcare_training_records FOR SELECT TO authenticated
USING(public.has_marketplace_vendor_access(
  tenant_id,vendor_id,auth.uid(),
  ARRAY['vendor_owner','vendor_admin','vendor_staff','vendor_viewer']
));

DO $childcare_touch$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'childcare_children','childcare_guardian_links','childcare_provider_profiles',
    'childcare_placements','childcare_attendance','childcare_funding_cases',
    'childcare_funding_claims','childcare_training_records'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END
$childcare_touch$;

COMMIT;
