import { createFileRoute } from "@tanstack/react-router";
import { PromoHeader, PromoFooter } from "@/components/promo/promo-chrome";
import { usePromo } from "@/lib/promo-lang";
import { useCookieConsent } from "@/lib/cookie-consent";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie-Richtlinie — OmniQora" },
      {
        name: "description",
        content:
          "Welche Cookies OmniQora einsetzt, welche Einwilligung nach TTDSG § 25 erforderlich ist und wie Sie Ihre Auswahl jederzeit ändern.",
      },
      { property: "og:title", content: "Cookie-Richtlinie — OmniQora" },
      {
        property: "og:description",
        content: "Notwendige, statistische und Marketing-Cookies bei OmniQora – transparent erklärt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CookiePolicy,
});

function CookiePolicy() {
  const { c, dir, lang } = usePromo();
  const { consent, openSettings, reset } = useCookieConsent();
  const de = lang === "de";
  return (
    <div dir={dir} className="min-h-screen bg-background">
      <PromoHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-foreground">{c.cookies.policy}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{c.cookies.body}</p>

        <div className="mt-8 space-y-4">
          <Section title={c.cookies.necessary} desc={c.cookies.necessaryDesc} items={["omniqora.promo.lang", "omniqora.cookieConsent.v1", "omniqora.site.unlock"]} />
          <Section title={c.cookies.analytics} desc={c.cookies.analyticsDesc} items={de ? ["Derzeit nicht aktiv – wird erst nach Einwilligung geladen."] : ["Not active yet – loaded only after consent."]} />
          <Section title={c.cookies.marketing} desc={c.cookies.marketingDesc} items={de ? ["Derzeit nicht aktiv – wird erst nach Einwilligung geladen."] : ["Not active yet – loaded only after consent."]} />
        </div>

        <div className="mt-10 rounded-2xl border border-border/70 bg-surface-2 p-5">
          <h2 className="text-sm font-semibold text-foreground">{c.footer.cookieSettings}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {consent
              ? `${de ? "Ihre Auswahl" : "Your selection"}: ${c.cookies.necessary} ✓ · ${c.cookies.analytics} ${consent.analytics ? "✓" : "✕"} · ${c.cookies.marketing} ${consent.marketing ? "✓" : "✕"}`
              : de
                ? "Es liegt noch keine Auswahl vor."
                : "No selection stored yet."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openSettings}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {c.cookies.settings}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              {de ? "Einwilligung widerrufen" : "Withdraw consent"}
            </button>
          </div>
        </div>
      </main>
      <PromoFooter />
    </div>
  );
}

function Section({ title, desc, items }: { title: string; desc: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-elegant">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      <ul className="mt-3 space-y-1">
        {items.map((i) => (
          <li key={i} className="font-mono text-[11px] text-foreground/70">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
