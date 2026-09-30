-- Childcare provider public service area and distance search.
BEGIN;

ALTER TABLE public.childcare_provider_profiles
  ADD COLUMN IF NOT EXISTS public_area text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS service_radius_km numeric NOT NULL DEFAULT 10
    CHECK(service_radius_km>0 AND service_radius_km<=500),
  ADD COLUMN IF NOT EXISTS accepts_private_care boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_funded_care boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_age_months integer CHECK(min_age_months IS NULL OR min_age_months>=0),
  ADD COLUMN IF NOT EXISTS max_age_months integer CHECK(max_age_months IS NULL OR max_age_months>=0),
  ADD CONSTRAINT childcare_provider_age_range_ck
    CHECK(max_age_months IS NULL OR min_age_months IS NULL OR max_age_months>=min_age_months);

CREATE INDEX IF NOT EXISTS childcare_provider_geo_idx
  ON public.childcare_provider_profiles(tenant_id,tenant_product_id,status)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_childcare_providers(
  _tenant uuid,
  _tenant_product uuid,
  _latitude double precision,
  _longitude double precision,
  _radius_km numeric DEFAULT 25,
  _age_months integer DEFAULT NULL,
  _funded boolean DEFAULT NULL,
  _language text DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS TABLE(
  vendor_id uuid,
  provider_profile_id uuid,
  vendor_name text,
  provider_type text,
  public_area text,
  distance_km numeric,
  service_radius_km numeric,
  service_age_groups text[],
  languages text[],
  max_children integer,
  accepts_private_care boolean,
  accepts_funded_care boolean,
  currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $childcare_search$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _latitude NOT BETWEEN -90 AND 90 OR _longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid_origin';
  END IF;
  IF _radius_km<=0 OR _radius_km>500 THEN RAISE EXCEPTION 'invalid_radius'; END IF;

  IF NOT public.is_tenant_member(_tenant,auth.uid())
     AND NOT EXISTS(
       SELECT 1 FROM public.customer_portal_users cu
       WHERE cu.tenant_id=_tenant
         AND cu.tenant_product_id=_tenant_product
         AND cu.user_id=auth.uid()
         AND cu.status='active'
     ) THEN
    RAISE EXCEPTION 'childcare_search_access_denied';
  END IF;

  RETURN QUERY
  WITH candidates AS(
    SELECT
      p.id AS provider_profile_id,
      p.vendor_id,
      v.name AS vendor_name,
      p.provider_type,
      p.public_area,
      p.service_radius_km,
      p.service_age_groups,
      p.languages,
      p.max_children,
      p.accepts_private_care,
      p.accepts_funded_care,
      v.currency,
      (
        6371.0 * acos(
          LEAST(1.0,GREATEST(-1.0,
            cos(radians(_latitude))
            * cos(radians(p.latitude))
            * cos(radians(p.longitude)-radians(_longitude))
            + sin(radians(_latitude))*sin(radians(p.latitude))
          ))
        )
      )::numeric AS distance_km
    FROM public.childcare_provider_profiles p
    JOIN public.marketplace_vendors v
      ON v.id=p.vendor_id AND v.tenant_id=p.tenant_id
    WHERE p.tenant_id=_tenant
      AND p.tenant_product_id=_tenant_product
      AND p.status='active'
      AND v.status='active'
      AND p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL
      AND (_age_months IS NULL OR (
        (p.min_age_months IS NULL OR p.min_age_months<=_age_months)
        AND (p.max_age_months IS NULL OR p.max_age_months>=_age_months)
      ))
      AND (_funded IS NULL OR NOT _funded OR p.accepts_funded_care)
      AND (_language IS NULL OR _language=ANY(p.languages))
  )
  SELECT
    c.vendor_id,c.provider_profile_id,c.vendor_name,c.provider_type,c.public_area,
    round(c.distance_km,2),c.service_radius_km,c.service_age_groups,c.languages,
    c.max_children,c.accepts_private_care,c.accepts_funded_care,c.currency
  FROM candidates c
  WHERE c.distance_km<=LEAST(_radius_km,c.service_radius_km)
  ORDER BY c.distance_km,c.vendor_name
  LIMIT LEAST(GREATEST(_limit,1),200);
END;
$childcare_search$;

REVOKE EXECUTE ON FUNCTION public.search_childcare_providers(
  uuid,uuid,double precision,double precision,numeric,integer,boolean,text,integer
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_childcare_providers(
  uuid,uuid,double precision,double precision,numeric,integer,boolean,text,integer
) TO authenticated,service_role;

COMMIT;
