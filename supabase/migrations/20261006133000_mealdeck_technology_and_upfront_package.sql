-- Revise service/setup terms only. The r2 territory fee reduction is never applied again.
BEGIN;

CREATE OR REPLACE FUNCTION public.network_mealdeck_current_pricing() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{
  "offerVersion": "2026-10-06-r3",
  "franchiseFeeVersion": "2026-10-06-r2",
  "feeMin": 3750,
  "feeMax": 12500,
  "franchiseFeePaymentTiming": "upfront",
  "royaltyStatus": "quote_required",
  "royaltyPercent": null,
  "royaltyDisplay": "To be confirmed in written quote",
  "marketingPercent": 1.5,
  "techFeePerOrder": 0.35,
  "techIncludesHaccora": true,
  "techFeeBasis": "per_completed_order",
  "techOrderDefinition": "One completed customer order per kitchen, regardless of brand count or ordering channel; cancelled and fully refunded orders are excluded.",
  "accountancyFeePerMonth": 100,
  "boughtInSupplyMarkupPercent": 0,
  "manufacturedSupplyMarkupPercent": 15,
  "manufacturedSupplyCostBasis": "fully_costed_production",
  "manufacturedSupplyFormula": "(ingredients + labour + other allocated production costs) × 1.15",
  "equipmentOpeningSuppliesFee": 15000,
  "equipmentOpeningSuppliesPaymentTiming": "upfront",
  "setupPackageScope": "Equipment, opening packaging and opening supplies per location",
  "setupPackageExclusions": "Premises works and deposits, professional costs and working capital",
  "cardProcessingFeeDescription": "Card processing fees charged by third parties",
  "feesExcludeVatWhereApplicable": true
}'::jsonb;
$$;
REVOKE ALL ON FUNCTION public.network_mealdeck_current_pricing() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.network_mealdeck_current_offer() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{
  "brands": "Shared MealDeck brand portfolio",
  "positioning": "Turnkey MealDeck multi-brand kitchen franchise, with the location, brand portfolio, equipment, supplies, technology and central support brought together for an agreed launch.",
  "featuredMarkets": [
    {
      "name": "Luton",
      "status": "taken",
      "note": "LU4 8NU"
    },
    {
      "name": "St Albans",
      "status": "taken",
      "note": "AL1 3JU"
    },
    {
      "name": "Bedford",
      "status": "taken"
    },
    {
      "name": "Milton Keynes",
      "status": "taken"
    },
    {
      "name": "Islington / Camden",
      "status": "taken",
      "note": "N7 8XH"
    }
  ],
  "franchisorProvides": [
    "Shared MealDeck brand portfolio, with location menus agreed for launch",
    "Location and territory assessment",
    "Agreed equipment and opening supplies package",
    "All technology including Haccora food safety tools",
    "Central compliance and administration support",
    "Training and ongoing operational support",
    "Marketing programme",
    "Scoped accountancy service",
    "Central production and supply"
  ],
  "franchiseeFunds": [
    "Reduced base franchise fee and £15,000 equipment/opening-supplies package upfront",
    "Premises and deposits",
    "Staff and payroll",
    "Utilities",
    "Ongoing stock and packaging",
    "Agreed royalty and marketing charges",
    "35p technology per completed order",
    "£100 monthly accountancy",
    "Card processing fees charged by third parties",
    "Courier delivery charges and aggregator commissions",
    "Local operating costs and working capital"
  ],
  "operatorResponsibilities": "The franchisee runs and staffs the kitchen, follows food safety and service standards, and funds premises, payroll, utilities and the agreed operating charges."
}'::jsonb||jsonb_build_object('pricing',public.network_mealdeck_current_pricing());
$$;
REVOKE ALL ON FUNCTION public.network_mealdeck_current_offer() FROM PUBLIC,anon,authenticated;

-- Preserve prior offers and accepted snapshots. Only the current programme's service/setup
-- offer changes; fee amounts, fee-version markers, royalties and existing contracts are untouched.
UPDATE public.network_programmes
SET tech_fee_minor_per_order=35,updated_at=now(),
 offer=offer||jsonb_build_object(
  'pricingHistory',COALESCE(offer->'pricingHistory','{}'::jsonb)||jsonb_build_object(
   '2026-10-06-r3',jsonb_build_object(
    'previousPricing',offer->'pricing',
    'previousOffer',offer-'pricingHistory',
    'previousTechFeeMinorPerOrder',tech_fee_minor_per_order,
    'appliedAt',now()
   )
  )
 )||(public.network_mealdeck_current_offer()-'featuredMarkets')
WHERE programme_key='mealdeck-england-wales' AND product_key='mealdeck'
 AND offer->'pricing'->>'franchiseFeeVersion'='2026-10-06-r2'
 AND COALESCE(offer->'pricing'->>'offerVersion','2026-10-06-r2')='2026-10-06-r2'
 AND NOT(COALESCE(offer->'pricingHistory','{}'::jsonb)?'2026-10-06-r3');

-- New programmes use the r3 offer and copy already-reduced r2 template fees verbatim.
-- Existing records and custom prices remain unchanged when seeding is repeated.
CREATE OR REPLACE FUNCTION public.network_seed_mealdeck_programme(_tenant uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p uuid;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Network expansion access denied';
 END IF;
 INSERT INTO public.network_programmes(
  tenant_id,product_key,programme_key,name,model_type,status,currency,
  fee_min_minor,fee_max_minor,royalty_bps,royalty_status,marketing_bps,tech_fee_minor_per_order,supply_markup_bps,offer
 ) VALUES(
  _tenant,'mealdeck','mealdeck-england-wales','MealDeck England & Wales','franchise','active','GBP',
  375000,1250000,NULL,'quote_required',150,35,0,public.network_mealdeck_current_offer()
 ) ON CONFLICT(tenant_id,programme_key) DO NOTHING;
 SELECT id INTO p FROM public.network_programmes WHERE tenant_id=_tenant AND programme_key='mealdeck-england-wales';

 INSERT INTO public.network_territories(tenant_id,programme_id,territory_code,name,region,status,fee_minor,currency,is_sellable,public_note,metadata)
 SELECT _tenant,p,t.territory_code,t.name,t.region,COALESCE(t.metadata->>'publicStatus','available'),t.fee_minor,t.currency,
  COALESCE((t.metadata->>'isSellable')::boolean,true),t.metadata->>'publicNote',t.metadata
 FROM public.network_territory_templates t WHERE t.template_key='mealdeck-england-wales'
 ON CONFLICT(programme_id,territory_code) DO NOTHING;
 RETURN p;
END;$$;
REVOKE ALL ON FUNCTION public.network_seed_mealdeck_programme(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.network_seed_mealdeck_programme(uuid) TO authenticated,service_role;

COMMIT;

