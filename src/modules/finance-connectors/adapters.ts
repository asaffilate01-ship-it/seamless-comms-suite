/**
 * Server-only connector interface. All 23 adapters are intentionally inert until
 * an individually certified implementation is installed under a signed provider contract.
 * This file must never fetch provider endpoints from arbitrary tenant-supplied URLs.
 */
import {FINANCE_PROVIDERS,type FinanceFamily} from "./catalogue";
export type FundingPrequalification={tenantId:string;merchantId:string;periodsAvailable:number;consentRef:string};
export type FundingApplication={tenantId:string;merchantId:string;requestedAmountPence:number;consentRef:string;idempotencyKey:string};
export type PersonalLoanReferral={tenantId:string;productKey:string;subjectToken:string;consentReference:string;brokerPermissionsVerified:true;customerRedirectOnly:true};
export type PersonalLoanResult={providerReference:string;redirectUrl:string;expiresAt:string;sourceVerified:true};
export type CheckoutDiscovery={tenantId:string;merchantId:string;orderId:string;countryCode:"GB";currency:"GBP";totalPence:number};
export type TradeTermRequest={tenantId:string;buyerId:string;sellerId:string;invoiceId:string;amountPence:number};
export type ProviderOutcome<T>={providerReference:string;receivedAt:string;status:"pending"|"accepted"|"rejected";details:T};
export type ConnectorContracts={
 merchant_capital:{
  prequalify(input:FundingPrequalification):Promise<ProviderOutcome<unknown>>;
  apply(input:FundingApplication):Promise<ProviderOutcome<unknown>>;
  offers(applicationReference:string):Promise<ProviderOutcome<unknown>[]>;
 };
 consumer_checkout:{
  discover(input:CheckoutDiscovery):Promise<ReadonlyArray<{paymentMethod:string;providerReference:string}>>;
  begin(input:CheckoutDiscovery):Promise<ProviderOutcome<unknown>>;
 };
 b2b_terms:{
  request(input:TradeTermRequest):Promise<ProviderOutcome<unknown>>;
 };
 personal_finance:{
  quote(input:PersonalLoanReferral):Promise<PersonalLoanResult[]>;
 };
};
export type ProviderConnector={
 key:string;family:FinanceFamily;certified:false;
 isOperational():false;
 prequalify?(input:FundingPrequalification):Promise<ProviderOutcome<unknown>>;
 apply?(input:FundingApplication):Promise<ProviderOutcome<unknown>>;
 offers?(reference:string):Promise<ProviderOutcome<unknown>[]>;
 discover?(input:CheckoutDiscovery):Promise<ReadonlyArray<{paymentMethod:string;providerReference:string}>>;
 begin?(input:CheckoutDiscovery):Promise<ProviderOutcome<unknown>>;
 request?(input:TradeTermRequest):Promise<ProviderOutcome<unknown>>;
 quote?(input:PersonalLoanReferral):Promise<PersonalLoanResult[]>;
};
function unavailable(key:string):never{throw new Error("Finance provider "+key+" not contracted, certified or active");}
export const CONNECTOR_STUBS:readonly ProviderConnector[]=FINANCE_PROVIDERS.map(provider=>{
 const base={key:provider.key,family:provider.family,certified:false as const,isOperational:()=>false as const};
 if(provider.family==="merchant_capital"){
  return {...base,prequalify:async()=>unavailable(provider.key),apply:async()=>unavailable(provider.key),
   offers:async()=>unavailable(provider.key)};
 }
 if(provider.family==="consumer_checkout"){
  return {...base,discover:async()=>unavailable(provider.key),begin:async()=>unavailable(provider.key)};
 }
 if(provider.family==="personal_finance")return {...base,quote:async()=>unavailable(provider.key)};
 return {...base,request:async()=>unavailable(provider.key)};
});
export function connectorFor(key:string):ProviderConnector{
 const connector=CONNECTOR_STUBS.find(c=>c.key===key);
 if(!connector)throw new Error("Unknown or unsupported finance provider");
 return connector;
}
