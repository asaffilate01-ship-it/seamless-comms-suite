-- Revise current MealDeck offers. Signed agreements, application answers and invoices are untouched.
BEGIN;

-- An undecided royalty must be stored as NULL, never as an apparently agreed 0% rate.
ALTER TABLE public.network_programmes ADD COLUMN IF NOT EXISTS royalty_status text NOT NULL DEFAULT 'agreed';
ALTER TABLE public.network_programmes ALTER COLUMN royalty_bps DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.network_programmes'::regclass AND conname='network_programmes_royalty_state_check') THEN
  ALTER TABLE public.network_programmes ADD CONSTRAINT network_programmes_royalty_state_check CHECK(
   (royalty_status='agreed' AND royalty_bps IS NOT NULL) OR
   (royalty_status='quote_required' AND royalty_bps IS NULL)
  );
 END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.network_mealdeck_current_pricing() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{
  "franchiseFeeVersion":"2026-10-06-r2",
  "feeMin":3750,"feeMax":12500,
  "royaltyStatus":"quote_required","royaltyPercent":null,"royaltyDisplay":"To be confirmed in written quote",
  "marketingPercent":1.5,"techFeePerMonth":199,"accountancyFeePerMonth":100,
  "boughtInSupplyMarkupPercent":0,"manufacturedSupplyMarkupPercent":15,
  "manufacturedSupplyCostBasis":"fully_costed_production",
  "manufacturedSupplyFormula":"(ingredients + labour + other allocated production costs) × 1.15",
  "equipmentOpeningSuppliesEstimate":15000,"setupEstimateStatus":"indicative",
  "setupEstimateScope":"Equipment, opening packaging and opening supplies per location",
  "setupEstimateExclusions":"Premises works and deposits, separately quoted technology hardware/setup, professional costs and working capital",
  "feesExcludeVatWhereApplicable":true
 }'::jsonb;
$$;
REVOKE ALL ON FUNCTION public.network_mealdeck_current_pricing() FROM PUBLIC,anon,authenticated;

-- Archive and halve each record's own prior price. The row marker and audit make this replay safe.
UPDATE public.network_territory_templates
SET fee_minor=round(fee_minor::numeric/2)::bigint,
 metadata=metadata||jsonb_build_object(
  'franchiseFeeVersion','2026-10-06-r2',
  'franchiseFeeRevisions',COALESCE(metadata->'franchiseFeeRevisions','{}'::jsonb)||jsonb_build_object(
   '2026-10-06-r2',jsonb_build_object('previousFeeMinor',fee_minor,'revisedFeeMinor',round(fee_minor::numeric/2)::bigint,'reductionPercent',50,'appliedAt',now())
  )
 )
WHERE template_key='mealdeck-england-wales'
 AND COALESCE(metadata->>'franchiseFeeVersion','legacy') IN('legacy','2026-10-06')
 AND NOT(COALESCE(metadata->'franchiseFeeRevisions','{}'::jsonb)?'2026-10-06-r2');

UPDATE public.network_territories t
SET fee_minor=round(t.fee_minor::numeric/2)::bigint,updated_at=now(),
 metadata=t.metadata||jsonb_build_object(
  'franchiseFeeVersion','2026-10-06-r2',
  'franchiseFeeRevisions',COALESCE(t.metadata->'franchiseFeeRevisions','{}'::jsonb)||jsonb_build_object(
   '2026-10-06-r2',jsonb_build_object('previousFeeMinor',t.fee_minor,'revisedFeeMinor',round(t.fee_minor::numeric/2)::bigint,'reductionPercent',50,'appliedAt',now())
  )
 )
FROM public.network_programmes p
WHERE t.programme_id=p.id AND p.programme_key='mealdeck-england-wales' AND p.product_key='mealdeck'
 AND COALESCE(p.offer->'pricing'->>'franchiseFeeVersion','legacy') IN('legacy','2026-10-06')
 AND COALESCE(t.metadata->>'franchiseFeeVersion','legacy') IN('legacy','2026-10-06')
 AND NOT(COALESCE(t.metadata->'franchiseFeeRevisions','{}'::jsonb)?'2026-10-06-r2');

-- The old scalar supply field represented one universal markup. The revised supply categories live
-- in offer.pricing; zeroing the retired scalars prevents stacking old per-order/blanket charges.
UPDATE public.network_programmes
SET fee_min_minor=375000,fee_max_minor=1250000,
 royalty_bps=NULL,royalty_status='quote_required',marketing_bps=150,
 tech_fee_minor_per_order=0,supply_markup_bps=0,updated_at=now(),
 offer=offer||jsonb_build_object(
  'pricingHistory',COALESCE(offer->'pricingHistory','{}'::jsonb)||jsonb_build_object(
   '2026-10-06-r2',jsonb_build_object(
    'previousFeeMinMinor',fee_min_minor,'previousFeeMaxMinor',fee_max_minor,
    'previousRoyaltyBps',royalty_bps,'previousMarketingBps',marketing_bps,
    'previousTechFeeMinorPerOrder',tech_fee_minor_per_order,'previousSupplyMarkupBps',supply_markup_bps,
    'previousPricing',offer->'pricing','appliedAt',now()
   )
  ),
  'pricing',public.network_mealdeck_current_pricing()
 )
WHERE programme_key='mealdeck-england-wales' AND product_key='mealdeck'
 AND COALESCE(offer->'pricing'->>'franchiseFeeVersion','legacy') IN('legacy','2026-10-06')
 AND NOT(COALESCE(offer->'pricingHistory','{}'::jsonb)?'2026-10-06-r2');

-- Seed missing records only. Reseeding must not reverse this revision or erase custom prices,
-- territory reservations, operational state or an existing programme's commercial decisions.
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
  375000,1250000,NULL,'quote_required',150,0,0,
  jsonb_build_object(
   'brands','15+ and growing','positioning','One kitchen. 15+ brands. One technology platform. One protected territory.',
   'pricing',public.network_mealdeck_current_pricing(),
   'featuredMarkets',jsonb_build_array(
    jsonb_build_object('name','Luton','status','taken','note','LU4 8NU'),
    jsonb_build_object('name','St Albans','status','taken','note','AL1 3JU'),
    jsonb_build_object('name','Bedford','status','taken'),
    jsonb_build_object('name','Milton Keynes','status','taken'),
    jsonb_build_object('name','Islington / Camden','status','taken','note','N7 8XH')
   ),
   'franchisorProvides',jsonb_build_array('MealDeck brand portfolio','agreed equipment package','Dishbee ordering and kitchen systems','Haccora food safety tools','delivery integrations','training','marketing','administration and ongoing support','scoped accountancy service','central production and supply'),
   'franchiseeFunds',jsonb_build_array('base franchise fee','agreed equipment and opening stock package','technology hardware and setup where quoted','premises and deposits','staff and payroll','utilities','ongoing stock and packaging','agreed franchise and service charges','local operating costs and working capital')
  )
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
