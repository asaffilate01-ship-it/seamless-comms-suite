-- Read-only, operator-run inventory of deployed Dishbee family catalogue.
-- Execute in the actual Omniqora Factory database (NOT Dishbee operations).
-- A complete catalogue is never proof of runtime, merchant or production acceptance.
WITH expected_products(product_key, expected_role, expected_parent) AS (
 VALUES
 ('dishbee','landlord',NULL::text),
 ('dishbee-one','experience','dishbee'),
 ('dishbee-plus','experience','dishbee'),
 ('dishbee-stay','experience','dishbee'),
 ('mealdeck','experience','dishbee')
), product_gaps AS (
 SELECT e.product_key AS key,
 CASE WHEN p.product_key IS NULL THEN 'missing'
      WHEN p.product_role IS DISTINCT FROM e.expected_role THEN 'role_mismatch'
      WHEN p.parent_product_key IS DISTINCT FROM e.expected_parent THEN 'parent_mismatch'
      WHEN p.status <> 'active' THEN 'inactive'
      ELSE NULL END AS reason
 FROM expected_products e LEFT JOIN public.product_catalogue p USING(product_key)
), expected_services(service_key) AS (
 VALUES ('dishbee.one'),('dishbee.hive'),('dishbee.hive-kiosk'),
 ('dishbee.stay'),('dishbee.stay.connect'),('dishbee.buzz'),
 ('dishbee.court-connect'),('dishbee-plus.subscription')
), service_gaps AS (
 SELECT e.service_key AS key,
 CASE WHEN s.service_key IS NULL THEN 'missing'
      WHEN s.status <> 'active' THEN 'inactive' ELSE NULL END AS reason
 FROM expected_services e LEFT JOIN public.service_catalogue s USING(service_key)
), expected_blueprints(blueprint_key) AS (
 VALUES ('restaurant-uk'),('mealdeck-uk'),('dishbee-one-uk'),
 ('dishbee-hive-uk'),('dishbee-plus-uk'),('dishbee-stay-connect-uk'),
 ('dishbee-stay-uk'),('dishbee-court-uk'),('dishbee-court-connect-uk')
), blueprint_gaps AS (
 SELECT e.blueprint_key AS key,
 CASE WHEN b.blueprint_key IS NULL THEN 'missing'
      WHEN b.status <> 'active' THEN 'inactive' ELSE NULL END AS reason
 FROM expected_blueprints e LEFT JOIN public.tenant_blueprints b USING(blueprint_key)
), expected_links(product_key,service_key) AS (
 VALUES ('dishbee-one','dishbee.one'),('dishbee-plus','dishbee-plus.subscription'),
 ('dishbee-stay','dishbee.stay'),('mealdeck','dishbee.hive')
), link_gaps AS (
 SELECT e.product_key||' -> '||e.service_key AS key,
 CASE WHEN ps.product_key IS NULL THEN 'missing' ELSE NULL END AS reason
 FROM expected_links e LEFT JOIN public.product_services ps
   ON ps.product_key=e.product_key AND ps.service_key=e.service_key
)
SELECT
 (SELECT coalesce(jsonb_agg(jsonb_build_object('key',key,'reason',reason) ORDER BY key),'[]'::jsonb)
    FROM product_gaps WHERE reason IS NOT NULL) AS product_gaps,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('key',key,'reason',reason) ORDER BY key),'[]'::jsonb)
    FROM service_gaps WHERE reason IS NOT NULL) AS service_gaps,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('key',key,'reason',reason) ORDER BY key),'[]'::jsonb)
    FROM blueprint_gaps WHERE reason IS NOT NULL) AS blueprint_gaps,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('key',key,'reason',reason) ORDER BY key),'[]'::jsonb)
    FROM link_gaps WHERE reason IS NOT NULL) AS entitlement_gaps,
 ((SELECT count(*) FROM product_gaps WHERE reason IS NOT NULL)=0 AND
  (SELECT count(*) FROM service_gaps WHERE reason IS NOT NULL)=0 AND
  (SELECT count(*) FROM blueprint_gaps WHERE reason IS NOT NULL)=0 AND
  (SELECT count(*) FROM link_gaps WHERE reason IS NOT NULL)=0) AS catalogue_deployed,
 (SELECT count(*) FROM public.tenant_products) AS assigned_tenant_products,
 (SELECT count(*) FROM public.product_connections WHERE product_key='dishbee') AS dishbee_connections,
 false AS production_accepted;
