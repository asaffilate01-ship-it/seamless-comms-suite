export type BillingInterval="monthly"|"annual"|"usage"|"one_time";

export type PlatformPlan={
  key:string;
  productKey:string;
  name:string;
  currency:string;
  interval:BillingInterval;
  priceMinor:number;
  active:boolean;
  trialDays?:number|null;
  metadata:Record<string,unknown>;
};

export type PlanModule={
  planKey:string;
  moduleKey:string;
  included:boolean;
  limits:Record<string,number|string|boolean|null>;
  config:Record<string,unknown>;
};

export type TenantSubscription={
  id:string;
  tenantId:string;
  tenantProductId:string;
  planKey:string;
  provider?:string|null;
  providerSubscriptionRef?:string|null;
  status:"trialing"|"active"|"past_due"|"paused"|"cancelled"|"ended";
  startsAt:string;
  currentPeriodStart?:string|null;
  currentPeriodEnd?:string|null;
  trialEndsAt?:string|null;
  cancelAt?:string|null;
};

export type ModuleAddon={
  key:string;
  moduleKey:string;
  productKey?:string|null;
  name:string;
  currency:string;
  interval:BillingInterval;
  priceMinor:number;
  active:boolean;
  includedLimits:Record<string,number|string|boolean|null>;
};

export const BILLING_EVENT_TYPES={
  subscriptionStarted:"billing.subscription.started",
  subscriptionChanged:"billing.subscription.changed",
  subscriptionCancelled:"billing.subscription.cancelled",
  subscriptionPastDue:"billing.subscription.past_due",
  addonEnabled:"billing.addon.enabled",
  addonDisabled:"billing.addon.disabled",
  usageRated:"billing.usage.rated",
} as const;
