import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — LoungeConnect" },
      { name: "description", content: "Transparent tiers for embedded add-on, standalone SaaS, and partner/white-label edition. Usage-priced WhatsApp messaging, seats and AI actions." },
      { property: "og:title", content: "Pricing — LoungeConnect" },
      { property: "og:description", content: "Standalone, embedded and partner pricing for the LoungeConnect WhatsApp workflow platform." },
    ],
  }),
  component: Pricing,
});

const tiers = [
  {
    name: "Starter", price: "€49", suffix: "/mo per tenant", tag: "Standalone",
    tagline: "One number, one team, one workflow pack.",
    features: ["1 WhatsApp number", "3 staff seats", "1 workflow pack", "500 conversations / mo", "Portal links, consent log", "Community support"],
    excluded: ["Partner tenants", "SSO / SAML", "Break-glass audit"],
    cta: "Start free trial", highlight: false,
  },
  {
    name: "Growth", price: "€99", suffix: "/mo per tenant", tag: "Standalone",
    tagline: "Multi-team, multi-workflow, real analytics.",
    features: ["2 numbers", "10 seats", "All workflow packs", "3,000 conversations / mo", "Approvals & SLAs", "Standard SLAs, email support"],
    excluded: ["Partner tenants", "Custom domain"],
    cta: "Start free trial", highlight: true,
  },
  {
    name: "Scale", price: "€249", suffix: "/mo per tenant", tag: "Standalone",
    tagline: "Regulated, high-volume, audit-ready.",
    features: ["5 numbers", "Unlimited seats", "SSO / SAML, SCIM", "10,000 conversations / mo", "Break-glass & DSGVO exports", "Priority support & DPA"],
    excluded: [],
    cta: "Talk to sales", highlight: false,
  },
];

const addons = [
  { name: "Embedded add-on", desc: "Turns on inside a LoungeTech product using SSO and entitlements.", price: "€29 / €69 / €149 mo" },
  { name: "Partner edition", desc: "Multi-tenant console for agencies and consultants with commission ledger.", price: "from €499 / mo" },
  { name: "AI actions", desc: "Beyond bundled quota — pooled across the tenant, transparent per-action pricing.", price: "€0.008 / action" },
  { name: "Meta pass-through", desc: "WhatsApp conversation charges billed at cost + 0 markup, itemised.", price: "Meta rate card" },
];

function Pricing() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Transparent · No lock-in</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">Pricing that reflects work done.</h1>
          <p className="mt-3 text-muted-foreground">
            Base tenant fee + pooled quotas + Meta pass-through. Upgrade or downgrade any month; usage is
            metered idempotently with an on-invoice ledger.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-6 ${
                t.highlight ? "border-primary bg-card shadow-glow ring-1 ring-primary/30" : "border-border bg-card"
              }`}
            >
              {t.highlight && (
                <Badge className="absolute -top-3 left-6 bg-primary text-primary-foreground hover:bg-primary">
                  Most popular
                </Badge>
              )}
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl font-semibold">{t.name}</h3>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{t.tag}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
              <div className="mt-6">
                <span className="font-display text-4xl font-semibold">{t.price}</span>
                <span className="ml-1 text-sm text-muted-foreground">{t.suffix}</span>
              </div>
              <Button className="mt-6 w-full" variant={t.highlight ? "default" : "outline"}>{t.cta}</Button>
              <ul className="mt-6 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span>{f}</span>
                  </li>
                ))}
                {t.excluded.map((f) => (
                  <li key={f} className="flex gap-2 text-muted-foreground">
                    <X className="mt-0.5 h-4 w-4 shrink-0" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Add-ons & pass-through</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {addons.map((a) => (
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
              <h3 className="font-display text-xl font-semibold">Enterprise & public sector</h3>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Sovereign hosting options, custom DPA, procurement questionnaires, TISAX/BSI questionnaire
                support, DACH-only data residency, dedicated CS.
              </p>
            </div>
            <Link to="/compliance"><Button variant="outline">Compliance overview</Button></Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
