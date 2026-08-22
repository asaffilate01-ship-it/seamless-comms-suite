import { useEffect, useState } from "react";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import {
  addonOrder,
  addonPrices,
  currencies,
  formatPrice,
  plans,
  type CurrencyCode,
} from "@/lib/pricing-data";
import { pricingContent, type PricingCopy } from "@/lib/pricing-content";
import type { PromoLang } from "@/lib/promo-content";
import { detectCurrency } from "@/lib/detect-locale";

const CURRENCY_KEY = "omniqora.currency";

function defaultCurrency(lang: PromoLang): CurrencyCode {
  if (lang === "en") return "GBP";
  if (lang === "tr") return "USD";
  if (lang === "ar") return "AED";
  return "EUR";
}

export function PricingSection({
  lang,
  onCta,
}: {
  lang: PromoLang;
  onCta?: () => void;
}) {
  const copy: PricingCopy = pricingContent[lang] ?? pricingContent.de;
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency(lang));

  /** Geofence: pick the visitor's currency after hydration (GBP in the UK,
   *  EUR in Europe, USD in the USA and rest of world), unless they chose one. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENCY_KEY) as CurrencyCode | null;
      if (saved && currencies.some((c) => c.code === saved)) {
        setCurrency(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    setCurrency(detectCurrency());
  }, []);

  const chooseCurrency = (code: CurrencyCode) => {
    setCurrency(code);
    try {
      localStorage.setItem(CURRENCY_KEY, code);
    } catch {
      /* ignore */
    }
  };

  return (
    <section id="pricing" className="scroll-mt-28 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.sub}</p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-full border border-border/70 bg-card/70 p-1 backdrop-blur">
            {currencies.map((cur) => {
              const active = cur.code === currency;
              return (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => setCurrency(cur.code)}
                  aria-pressed={active}
                  className={[
                    "rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {cur.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {plans.map((plan) => {
            const p = copy.plans[plan.key];
            const isEnterprise = plan.key === "enterprise";
            return (
              <article
                key={plan.key}
                className={[
                  "relative flex flex-col rounded-2xl border bg-card p-6 shadow-elegant transition-all duration-300 hover:-translate-y-1 hover:shadow-premium",
                  plan.highlight ? "border-primary/60 ring-1 ring-primary/25" : "border-border/70 hover:border-primary/35",
                ].join(" ")}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 start-6 inline-flex items-center gap-1 rounded-full bg-gradient-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-glow">
                    <Sparkles className="h-3 w-3" />
                    {copy.most}
                  </span>
                )}
                <h3 className="font-display text-lg font-semibold text-foreground">{p.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{p.fit}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-display text-3xl font-semibold text-foreground">
                    {formatPrice(plan.price[currency], currency, copy.custom)}
                  </span>
                  {!isEnterprise && <span className="text-xs text-muted-foreground">{copy.perMonth}</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                    {plan.users ?? copy.unlimited} {copy.users}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    {plan.channels ?? copy.unlimited} {copy.channels}
                  </span>
                </div>
                <ul className="mt-5 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onCta}
                  className={[
                    "mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold transition",
                    plan.highlight
                      ? "bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95"
                      : "border border-border text-foreground hover:border-primary/40 hover:text-primary",
                  ].join(" ")}
                >
                  {isEnterprise ? copy.ctaEnterprise : copy.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </article>
            );
          })}
        </div>

        <div className="mt-16">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="font-display text-2xl font-semibold text-foreground">{copy.addonsTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.addonsSub}</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {addonOrder.map((key) => {
              const a = copy.addons[key];
              const price = addonPrices[key][currency];
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-elegant transition-colors hover:border-primary/35"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">{a.name}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.desc}</p>
                  </div>
                  <div className="whitespace-nowrap text-end font-display text-sm font-semibold text-primary">
                    {price === null ? (
                      copy.onRequest
                    ) : (
                      <>
                        <span className="block text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                          {copy.fromLabel}
                        </span>
                        {formatPrice(price, currency, copy.onRequest)}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-border/70 bg-surface-2 p-6 sm:p-8">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-primary">{copy.rulesTitle}</h4>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {copy.rules.map((r) => (
              <li key={r} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">{copy.note}</p>
        </div>
      </div>
    </section>
  );
}
