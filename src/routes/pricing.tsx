import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PricingSection } from "@/components/promo/pricing-section";
import { useT, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing & add-ons — OmniQora" },
      {
        name: "description",
        content:
          "Five plans from Starter to Enterprise plus modular add-ons: web chat, commerce, AI, payments, business email, voice, partner white-label. Prices in GBP, EUR, USD, AED and PKR.",
      },
      { property: "og:title", content: "Pricing & add-ons — OmniQora" },
      {
        property: "og:description",
        content:
          "Transparent subscription tiers and modular add-ons for the OmniQora omnichannel workflow platform, priced in five currencies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const t = useT();
  const { lang } = useI18n();

  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-4 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            {t("pricing.badge")}
          </Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">{t("pricing.title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("pricing.sub")}</p>
        </div>
      </section>

      <PricingSection lang={lang === "de" ? "de" : "en"} />

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="rounded-2xl border border-border bg-surface-2 p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="font-display text-xl font-semibold">{t("pricing.enterpriseTitle")}</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("pricing.enterpriseSub")}</p>
            </div>
            <Link to="/compliance">
              <Button variant="outline">{t("pricing.complianceOverview")}</Button>
            </Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
