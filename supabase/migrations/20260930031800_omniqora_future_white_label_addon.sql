-- Ensure the full-white-label option is automatically available to future landlord products.
BEGIN;

CREATE OR REPLACE FUNCTION public.platform_seed_default_branding_addon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $seed_branding$
BEGIN
  IF NEW.kind IN ('vertical_landlord','standalone','product_variant')
     AND NEW.product_key<>'omniqora' THEN
    INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
    SELECT NEW.product_key,'branding.white_label',false
    WHERE EXISTS(
      SELECT 1 FROM public.platform_modules WHERE module_key='branding.white_label'
    )
    ON CONFLICT(product_key,module_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$seed_branding$;

DROP TRIGGER IF EXISTS platform_seed_default_branding_addon
  ON public.platform_products;
CREATE TRIGGER platform_seed_default_branding_addon
AFTER INSERT OR UPDATE OF kind ON public.platform_products
FOR EACH ROW EXECUTE FUNCTION public.platform_seed_default_branding_addon();

COMMIT;
