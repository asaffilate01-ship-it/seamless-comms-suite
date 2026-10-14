/** Omniqora Finance Connectors, shared by every SaaS landlord. Catalogue is NOT live availability. */
export type FinanceFamily = "merchant_capital" | "consumer_checkout" | "b2b_terms" | "personal_finance";
export type IntegrationRail = "embedded_direct" | "adyen" | "direct_partner" | "multi_lender";
export type ProviderCandidate = Readonly<{
  key:string; name:string; family:FinanceFamily; rail:IntegrationRail;
  status:"candidate"; market:"GB"; purpose:string; contractRequired:true;
  requiresFinancialPromotionReview:boolean; onboarding:string;
}>;
function candidate(key:string,name:string,family:FinanceFamily,rail:IntegrationRail,purpose:string,
  requiresFinancialPromotionReview=true,onboarding="Commercial contract, technical certification and merchant approval"
):ProviderCandidate{
  return {key,name,family,rail,status:"candidate",market:"GB",purpose,contractRequired:true,
    requiresFinancialPromotionReview,onboarding};
}
export const FINANCE_PROVIDERS:readonly ProviderCandidate[]=[
 candidate("finance.youlend","YouLend","merchant_capital","embedded_direct","Revenue-linked merchant funding"),
 candidate("finance.liberis","Liberis","merchant_capital","embedded_direct","Merchant embedded working capital"),
 candidate("finance.wayflyer","Wayflyer","merchant_capital","embedded_direct","Growth and revenue-linked capital"),
 candidate("finance.iwoca","iwoca","merchant_capital","embedded_direct","SME business loans and credit"),
 candidate("finance.365-finance","365 Finance","merchant_capital","embedded_direct","Merchant cash advances"),
 candidate("finance.capify","Capify","merchant_capital","embedded_direct","SME cash advance or lending"),
 candidate("finance.funding-circle","Funding Circle","merchant_capital","embedded_direct","SME term loans"),
 candidate("finance.capitalise","Capitalise","merchant_capital","multi_lender","Business funding marketplace"),
 candidate("finance.swoop","Swoop Funding","merchant_capital","multi_lender","Business finance comparison"),
 candidate("finance.funding-options","Funding Options by Tide","merchant_capital","multi_lender","Business finance referral marketplace"),
 candidate("checkout.klarna","Klarna","consumer_checkout","adyen","Eligible checkout financing"),
 candidate("checkout.paypal-paylater","PayPal Pay Later","consumer_checkout","adyen","Pay in 3 / Pay in 30 where enabled"),
 candidate("checkout.paypal-credit","PayPal Credit","consumer_checkout","adyen","Revolving consumer credit; separate marketing rules"),
 candidate("checkout.clearpay","Clearpay","consumer_checkout","adyen","Four-payment retail instalments"),
 candidate("checkout.affirm","Affirm","consumer_checkout","adyen","Instalment checkout"),
 candidate("checkout.zopa","Zopa Retail Finance","consumer_checkout","direct_partner","Higher-ticket retail finance"),
 candidate("checkout.snap","Snap Finance","consumer_checkout","direct_partner","Retail instalment finance"),
 candidate("checkout.v12","V12 Retail Finance","consumer_checkout","direct_partner","Retail consumer finance"),
 candidate("checkout.novuna","Novuna Consumer Finance","consumer_checkout","direct_partner","Point-of-sale retail finance"),
 candidate("checkout.newpay","Newpay (NewDay)","consumer_checkout","direct_partner","Revolving consumer retail credit"),
 candidate("trade.kriya","Kriya","b2b_terms","direct_partner","B2B deferred payment at eligible checkout"),
 candidate("trade.billie","Billie","b2b_terms","direct_partner","B2B invoice financing"),
 candidate("trade.mondu","Mondu","b2b_terms","direct_partner","B2B trade terms"),
 candidate("personal.monevo","Monevo","personal_finance","multi_lender","Consumer personal-loan and credit comparison; subject to regulated broker approval"),
 candidate("personal.clearscore","ClearScore Partner API","personal_finance","multi_lender","Consumer credit eligibility and controlled lender redirect; subject to commercial approval")
];
export type Placement = Readonly<{
  productKey:string; brand?:string; financeFamilies:readonly FinanceFamily[];
  enabledByDefault:false; status:"candidate"; commercialUse:string;
  restrictions:readonly string[];
}>;
function placement(productKey:string,families:FinanceFamily[],commercialUse:string,
  restrictions:string[]=[],brand?:string):Placement{
  return {productKey,...(brand?{brand}:{}),financeFamilies:families,enabledByDefault:false,
    status:"candidate",commercialUse,restrictions};
}
/** Keep existing landlord->tenant boundaries. Tenants inherit candidates, not permissions. */
export const FINANCE_PLACEMENTS:readonly Placement[]=[
 placement("dishbee",["merchant_capital"],"Restaurant and cloud-kitchen working capital",["No automatic underwriting or aggregator transaction sweep"]),
 placement("dishbee",["consumer_checkout"],"Optional eligible hospitality orders",["No food BNPL without provider category approval","No cross-brand split without seller-of-record approval"]),
 placement("dishbee",["merchant_capital"],"Café 1 business funding",[],"Cafe 1"),
 placement("dishbee",["merchant_capital"],"ChefzHub individual kitchen funding",[],"ChefzHub"),
 placement("mealdeck",["merchant_capital"],"MealDeck operator working capital",[],"MealDeck"),
 placement("dishbee-plus",["consumer_checkout","b2b_terms"],"Eligible general marketplace sellers",["No restricted categories","Multi-seller checkout requires approved funds-flow"]),
 placement("merqano",["consumer_checkout","merchant_capital","b2b_terms"],"Retail storefronts, merchant capital and business buyers"),
 placement("merqano",["consumer_checkout"],"Dulcis occasion cakes where lender allows",["Food and made-to-order approval mandatory"],"Dulcis"),
 placement("merqano",["consumer_checkout"],"Eligible Kalëthon retail purchases",["No activation for subscriptions without provider approval"],"Kalëthon"),
 placement("merqano",["consumer_checkout"],"Meyzaar retail purchases",[],"Meyzaar"),
 placement("merqano",["consumer_checkout","b2b_terms"],"Alstero merchant catalogue",[],"Alstero"),
 placement("merqora",["consumer_checkout","merchant_capital","b2b_terms"],"Marketplace retail sellers"),
 placement("craftvaro",["consumer_checkout","merchant_capital","b2b_terms"],"Higher-value trade services and B2B purchases",["Service and deposits eligibility must be approved"]),
 placement("travenexa",["consumer_checkout","merchant_capital"],"Qualified travel orders and travel businesses",["Travel-sector and refund/cancellation approval","TraveNexa owns supplier/booking checkout"]),
 placement("travenexa",["consumer_checkout"],"FlightLounge travel checkout",["No independent supplier adapter"],"FlightLounge"),
 placement("travenexa",["consumer_checkout"],"MarocWays UK-bound travel checkout",["No independent supplier adapter"],"MarocWays"),
 placement("travenexa",["consumer_checkout"],"Route50 travel checkout",["No independent supplier adapter"],"Route50"),
 placement("eventplanr",["consumer_checkout","merchant_capital"],"Approved event suppliers and larger customer bookings",["Deposits, future fulfilment and cancellation rules"]),
 placement("formation-genie",["merchant_capital"],"Established formation clients only",["Newly formed companies not assumed eligible"]),
 placement("taxnuvia",["merchant_capital"],"Introductions for established business clients",["No automatic lending from advisory profiles"]),
 placement("lawquo",["merchant_capital"],"Firm/chambers business working capital",["Client funds and legal fees excluded from automatic sweeps"]),
 placement("kinderstars",["merchant_capital"],"Established childminder businesses",["UK childcare programme eligibility required"],"Kindelo"),
 placement("zoryn",["consumer_checkout","merchant_capital","b2b_terms","personal_finance"],"Zoryn Pay as merchant payment distribution",["Payments permissions, merchant contracts and credit-broking approval"])
];
export const FINANCE_PROVIDER_KEYS=new Set(FINANCE_PROVIDERS.map(p=>p.key));
export function recommendFinanceConnectors(productKey:string,brand?:string,market="GB"){
 if(market!=="GB")return [];
 const applicable=FINANCE_PLACEMENTS.filter(p=>p.productKey===productKey&&
   (!p.brand||(brand&&p.brand.toLowerCase()===brand.toLowerCase())));
 const families=new Set(applicable.flatMap(p=>p.financeFamilies));
 return FINANCE_PROVIDERS.filter(provider=>families.has(provider.family))
  .map(provider=>({...provider,eligibleForReview:true as const,live:false as const,
    restrictionNotes:[...new Set(applicable.flatMap(p=>p.restrictions))]}));
}
