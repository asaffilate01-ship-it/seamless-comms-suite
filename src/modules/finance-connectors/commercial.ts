/**
 * SaaS Factory finance commercial ownership.
 *
 * Commercial ownership is not evidence of a signed contract, a regulated permission,
 * an earning, or a transfer. Actual legal entity IDs are supplied by authorised finance ops.
 */
export type FinanceCommercialParty = "zoryn_pay" | "omniqora";
export type CommercialRevenueKind =
  | "lender_referral_commission" | "lender_renewal_commission"
  | "checkout_provider_share" | "payment_platform_margin"
  | "trade_credit_referral_commission" | "personal_credit_referral_commission"
  | "finance_connector_subscription" | "finance_connector_setup_fee";
export type FinanceTransactionVolumeKind = "funding_principal" | "checkout_gmv" | "lender_collections";

export const FINANCE_COMMERCIAL_OWNER = Object.freeze({
  lenderRevenue: "zoryn_pay" as const,
  paymentFinanceRevenue: "zoryn_pay" as const,
  tradeFinanceRevenue: "zoryn_pay" as const,
  personalFinanceRevenue: "zoryn_pay" as const,
  connectorTechnologyRevenue: "omniqora" as const,
  connectorHostingRevenue: "omniqora" as const,
});
export const FINANCE_REVENUE_OWNER: Readonly<Record<CommercialRevenueKind, FinanceCommercialParty>> = {
  lender_referral_commission: "zoryn_pay",
  lender_renewal_commission: "zoryn_pay",
  checkout_provider_share: "zoryn_pay",
  payment_platform_margin: "zoryn_pay",
  trade_credit_referral_commission: "zoryn_pay",
  personal_credit_referral_commission: "zoryn_pay",
  finance_connector_subscription: "omniqora",
  finance_connector_setup_fee: "omniqora",
};

export const FINANCE_ADDON_PLANS = [
  { key: "finance_connect_access", name: "Finance Connect Access", pricing: "quote_required" as const,
    audience: "saas_tenant" as const, includes: ["candidate_centre","integration_status"] },
  { key: "finance_connect_pro", name: "Finance Connect Pro", pricing: "quote_required" as const,
    audience: "saas_tenant" as const, includes: ["connector_access","application_draft_management","reports","reconciliation_exports"] },
  { key: "finance_connect_enterprise", name: "Finance Connect Enterprise", pricing: "quote_required" as const,
    audience: "saas_tenant" as const, includes: ["connector_access","tenant_brand_scopes","api_access","support","reconciliation_exports"] },
] as const;

export function ownerOfFinanceRevenue(kind:CommercialRevenueKind):FinanceCommercialParty{
  return FINANCE_REVENUE_OWNER[kind];
}
export function isGroupFinanceTurnover(value:{kind:CommercialRevenueKind | FinanceTransactionVolumeKind}):boolean {
  return value.kind in FINANCE_REVENUE_OWNER;
}
export function assertCommercialPayee(input:{kind:CommercialRevenueKind;payee:FinanceCommercialParty}):void{
  if(ownerOfFinanceRevenue(input.kind)!==input.payee)
    throw new Error("Revenue ownership conflict: lender and finance commissions belong to Zoryn Pay; software subscriptions to Omniqora");
}
/** Never infer earned finance income from loan principal, shopper GMV, or a candidate provider slot. */
export function recognisedCommercialIncome(input:{
 kind:CommercialRevenueKind | FinanceTransactionVolumeKind;
 amountMinor:number;
 status:"candidate"|"quoted"|"accrued"|"settled"|"reversed"|"invoiced"|"paid";
 contractVerified:boolean;
}):number {
  if(!Number.isSafeInteger(input.amountMinor) || input.amountMinor<0)throw new Error("Money must be nonnegative integer minor units");
  if(!isGroupFinanceTurnover(input)||!input.contractVerified)return 0;
  if(input.kind==="finance_connector_subscription"||input.kind==="finance_connector_setup_fee")
    return input.status==="invoiced"||input.status==="paid"?input.amountMinor:0;
  return input.status==="settled"?input.amountMinor:0;
}
