/** Commercial packaging: plan anchors, allowances and modular add-ons. */

export type CurrencyCode = "GBP" | "EUR" | "USD" | "AED" | "PKR";

export const currencies: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: "EUR", symbol: "€", label: "EUR" },
  { code: "GBP", symbol: "£", label: "GBP" },
  { code: "USD", symbol: "$", label: "USD" },
  { code: "AED", symbol: "AED ", label: "AED" },
  { code: "PKR", symbol: "PKR ", label: "PKR" },
];

export type PlanKey = "starter" | "growth" | "pro" | "scale" | "enterprise";

export type Plan = {
  key: PlanKey;
  /** Monthly anchor per currency; null = custom quote. */
  price: Record<CurrencyCode, number | null>;
  users: number | null;
  channels: number | null;
  highlight?: boolean;
};

export const plans: Plan[] = [
  {
    key: "starter",
    price: { GBP: 39, EUR: 45, USD: 49, AED: 179, PKR: 8900 },
    users: 2,
    channels: 2,
  },
  {
    key: "growth",
    price: { GBP: 99, EUR: 109, USD: 119, AED: 399, PKR: 19900 },
    users: 5,
    channels: 5,
    highlight: true,
  },
  {
    key: "pro",
    price: { GBP: 249, EUR: 269, USD: 299, AED: 999, PKR: 49900 },
    users: 15,
    channels: 10,
  },
  {
    key: "scale",
    price: { GBP: 499, EUR: 549, USD: 599, AED: 1999, PKR: 99900 },
    users: 40,
    channels: 25,
  },
  {
    key: "enterprise",
    price: { GBP: null, EUR: null, USD: null, AED: null, PKR: null },
    users: null,
    channels: null,
  },
];

export type AddonKey =
  | "webchat"
  | "commerce"
  | "ai"
  | "payments"
  | "email"
  | "voice"
  | "partner"
  | "embedded"
  | "onboarding"
  | "residency";

/** Add-on monthly anchors (EUR-indexed, converted with the same ratios as plans). */
export const addonPrices: Record<AddonKey, Record<CurrencyCode, number | null>> = {
  webchat: { GBP: 19, EUR: 22, USD: 24, AED: 89, PKR: 4400 },
  commerce: { GBP: 39, EUR: 45, USD: 49, AED: 179, PKR: 8900 },
  ai: { GBP: 29, EUR: 32, USD: 35, AED: 129, PKR: 6400 },
  payments: { GBP: 25, EUR: 29, USD: 32, AED: 115, PKR: 5900 },
  email: { GBP: 15, EUR: 18, USD: 19, AED: 69, PKR: 3400 },
  voice: { GBP: 35, EUR: 39, USD: 42, AED: 155, PKR: 7900 },
  partner: { GBP: 449, EUR: 499, USD: 549, AED: 1799, PKR: 89900 },
  embedded: { GBP: null, EUR: null, USD: null, AED: null, PKR: null },
  onboarding: { GBP: null, EUR: null, USD: null, AED: null, PKR: null },
  residency: { GBP: null, EUR: null, USD: null, AED: null, PKR: null },
};

export const addonOrder: AddonKey[] = [
  "webchat",
  "commerce",
  "ai",
  "payments",
  "email",
  "voice",
  "partner",
  "embedded",
  "onboarding",
  "residency",
];

export function formatPrice(value: number | null, currency: CurrencyCode, customLabel: string): string {
  if (value === null) return customLabel;
  const meta = currencies.find((c) => c.code === currency)!;
  const grouped = value >= 1000 ? value.toLocaleString("en-US") : String(value);
  return `${meta.symbol}${grouped}`;
}
