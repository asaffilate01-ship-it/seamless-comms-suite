import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { translations } from "@/lib/translations";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Konnevia" },
      { name: "description", content: "Transparent tiers for embedded add-on, standalone SaaS, and partner/white-label edition. Usage-priced WhatsApp messaging, seats and AI actions." },
      { property: "og:title", content: "Pricing — Konnevia" },
      { property: "og:description", content: "Standalone, embedded and partner pricing for the Konnevia WhatsApp workflow platform." },
    ],
  }),
  component: Pricing,
});

const prices = ["€49", "€99", "€249"];

function Pricing() {
  const t = useT();
  const { lang } = useI18n();
  const p = (translations[lang] as any).pricing as {
    tiers: { name: string; tagline: string; features: string[]; excluded: string[]; cta: string }[];
    addons: { name: string; desc: string; price: string }[];
  };

  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{t("pricing.badge")}</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">{t("pricing.title")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("pricing.sub")}
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {p.tiers.map((tier, idx) => {
            const highlight = idx === 1;
            return (
              <div
                key={tier.name}
                className={`relative rounded-2xl border p-6 ${
                  highlight ? "border-primary bg-card shadow-glow ring-1 ring-primary/30" : "border-border bg-card"
                }`}
              >
                {highlight && (
                  <Badge className="absolute -top-3 left-6 bg-primary text-primary-foreground hover:bg-primary">
                    {t("pricing.most")}
                  </Badge>
                )}
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl font-semibold">{tier.name}</h3>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("pricing.standalone")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
                <div className="mt-6">
                  <span className="font-display text-4xl font-semibold">{prices[idx]}</span>
                  <span className="ml-1 text-sm text-muted-foreground">{t("pricing.perTenant")}</span>
                </div>
                <Button className="mt-6 w-full" variant={highlight ? "default" : "outline"}>{tier.cta}</Button>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span>{f}</span>
                    </li>
                  ))}
                  {tier.excluded.map((f) => (
                    <li key={f} className="flex gap-2 text-muted-foreground">
                      <X className="mt-0.5 h-4 w-4 shrink-0" /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">{t("pricing.addonsTitle")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {p.addons.map((a) => (
              <div key={a.name} className="flex items-start justify-between rounded-xl border border-border bg-card p-5">
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.desc}</p>
                </div>
                <div className="whitespace-nowrap font-display text-sm font-semibold text-primary">{a.price}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-surface-2 p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h3 className="font-display text-xl font-semibold">{t("pricing.enterpriseTitle")}</h3>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("pricing.enterpriseSub")}
              </p>
            </div>
            <Link to="/compliance"><Button variant="outline">{t("pricing.complianceOverview")}</Button></Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
