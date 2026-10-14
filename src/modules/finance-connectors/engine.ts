import { FINANCE_PROVIDER_KEYS, FINANCE_PROVIDERS, FINANCE_PLACEMENTS, type FinanceFamily } from "./catalogue";

/**
 * This guard is intentionally stricter than general Omniqora provider selection.
 * A configured/active provider binding alone NEVER enables regulated finance.
 */
export type FinanceBinding = Readonly<{
  tenantId:string;productKey:string;providerKey:string;
  environment:"development"|"staging"|"production";
  status:"configured"|"active"|"degraded"|"disabled"|"failed";
  lastVerifiedAt:string|null; legalEntityId?:string; merchantAccount?:string;
  contracted:boolean; complianceApproved:boolean; countryApproved:boolean;
  categoryApproved:boolean; settlementApproved:boolean;
  exactProgrammes:readonly string[];
  regulatedCreditBrokerApproved?:boolean; consumerDutyJourneyApproved?:boolean;
}>;
export type FinanceTransaction = Readonly<{
  tenantId:string;productKey:string;brand?:string;providerKey:string;
  legalEntityId:string;merchantAccount?:string;countryCode:string;
  currency:string;merchantCountryCode:string;category:string;
  audience:"business"|"consumer"; programme:string;
  sourceVerified:boolean; hasCustomerConsent:boolean;
  isCrossMerchantBasket:boolean; sellerOfRecordApproved:boolean;
  providerReturnedMethod:boolean; verifiedOrderTotal:boolean;
}>;
export type FinanceGate={
  allowed:boolean;reasonCodes:string[];providerFamily:FinanceFamily|null;
};
export function evaluateFinanceTransaction(
  input:FinanceTransaction,binding:FinanceBinding|null,
  now=new Date()
):FinanceGate{
 const reasons:string[]=[];
 const provider=FINANCE_PROVIDERS.find(x=>x.key===input.providerKey);
 if(!provider||!FINANCE_PROVIDER_KEYS.has(input.providerKey))return {allowed:false,reasonCodes:["unknown_provider"],providerFamily:null};
 const matches=FINANCE_PLACEMENTS.some(p=>p.productKey===input.productKey&&
   (!p.brand||p.brand.toLowerCase()===input.brand?.toLowerCase())&&p.financeFamilies.includes(provider.family));
 if(!matches)reasons.push("product_or_brand_not_mapped");
 if(input.countryCode!=="GB"||input.merchantCountryCode!=="GB"||input.currency!=="GBP")reasons.push("unsupported_market");
 if(input.audience==="consumer"&&provider.family!=="consumer_checkout"&&provider.family!=="personal_finance")reasons.push("audience_mismatch");
 if(input.audience==="business"&&(provider.family==="consumer_checkout"||provider.family==="personal_finance"))reasons.push("audience_mismatch");
 if(!input.sourceVerified||(provider.family==="consumer_checkout"||provider.family==="b2b_terms")&&!input.verifiedOrderTotal)reasons.push("unverified_source_order_or_sales");
 if(!input.hasCustomerConsent)reasons.push("consent_missing");
 if(input.isCrossMerchantBasket&&!input.sellerOfRecordApproved)reasons.push("marketplace_seller_of_record_unapproved");
 if(!binding)reasons.push("binding_missing");
 else {
  if(binding.tenantId!==input.tenantId||binding.productKey!==input.productKey||
    binding.providerKey!==input.providerKey)reasons.push("binding_scope_mismatch");
  if(binding.status!=="active"||binding.environment!=="production")reasons.push("production_binding_inactive");
  const verified=binding.lastVerifiedAt?Date.parse(binding.lastVerifiedAt):NaN;
  if(!Number.isFinite(verified)||verified>now.getTime()||now.getTime()-verified>86400000)
    reasons.push("provider_verification_stale");
  if(!binding.contracted)reasons.push("provider_contract_missing");
  if(!binding.complianceApproved)reasons.push("regulatory_review_missing");
  if(provider.family==="personal_finance"&&(!binding.regulatedCreditBrokerApproved||!binding.consumerDutyJourneyApproved))reasons.push("personal_credit_broking_authorisation_missing");
  if(!binding.countryApproved||!binding.categoryApproved)reasons.push("merchant_market_or_category_not_approved");
  if(!binding.settlementApproved)reasons.push("funds_flow_not_approved");
  if(!binding.exactProgrammes.includes(input.programme))reasons.push("programme_not_approved");
  if(!input.legalEntityId||binding.legalEntityId!==input.legalEntityId)reasons.push("legal_entity_mismatch");
  if(provider.family==="consumer_checkout" && (!input.merchantAccount||binding.merchantAccount!==input.merchantAccount))
    reasons.push("merchant_account_mismatch");
 }
 if(provider.rail==="adyen"&&!input.providerReturnedMethod)reasons.push("adyen_method_not_returned");
 // Explicitly never synthesize merchant eligibility, instalments, rates or lending offers.
 return {allowed:reasons.length===0,reasonCodes:reasons,providerFamily:provider.family};
}
export function invoiceTotalPence(lines:ReadonlyArray<{qty:number;unitPence:number}>,expected:number){
 if(!Number.isSafeInteger(expected)||expected<=0||lines.length===0||lines.length>100)throw new Error("Invalid order");
 let sum=0;
 for(const line of lines){
  if(!Number.isSafeInteger(line.qty)||line.qty<1||!Number.isSafeInteger(line.unitPence)||line.unitPence<0)
   throw new Error("Invalid line item");
  sum+=line.qty*line.unitPence;
  if(!Number.isSafeInteger(sum))throw new Error("Amount overflow");
 }
 if(sum!==expected)throw new Error("Checkout itemisation mismatch");
 return sum;
}
export function verifiedCheckoutMethods(methodsFromAcquirer:readonly string[],allowedByMerchant:readonly string[]){
 if(!Array.isArray(methodsFromAcquirer)||!Array.isArray(allowedByMerchant))return [];
 const allowed=new Set(allowedByMerchant);
 return [...new Set(methodsFromAcquirer.filter(m=>typeof m==="string"&&allowed.has(m)))];
}
export interface FinanceConnector {
 providerKey:string; capability:"discover"|"prequalify"|"apply"|"offers"|"checkout";
 execute(input:unknown):Promise<unknown>;
}
export function disabledFinanceConnector(providerKey:string):FinanceConnector{
 return {providerKey,capability:"discover",execute:async()=>{throw new Error("Finance connector is not contracted or activated");}};
}
