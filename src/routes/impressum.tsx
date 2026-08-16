import { createFileRoute } from "@tanstack/react-router";
import { MarketingFooter, MarketingNav } from "@/components/marketing/nav";
import { useI18nSafe } from "@/lib/i18n";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum — Konnevia" },
      { name: "description", content: "Anbieterkennzeichnung nach § 5 DDG für Konnevia, die WhatsApp-Workflow-Plattform für deutsche Unternehmen." },
      { property: "og:title", content: "Impressum — Konnevia" },
      { property: "og:description", content: "Anbieterkennzeichnung nach § 5 DDG für Konnevia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Impressum,
});

function Impressum() {
  const de = (useI18nSafe()?.lang ?? "de") === "de";
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">{de ? "Impressum" : "Legal notice"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {de ? "Angaben gemäß § 5 DDG (vormals § 5 TMG)." : "Provider information under § 5 DDG (German Digital Services Act)."}
        </p>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <div>
            <h2 className="text-base font-semibold text-foreground">{de ? "Anbieter" : "Provider"}</h2>
            <p className="mt-2">
              Konnevia GmbH<br />
              Musterstraße 1<br />
              10115 Berlin<br />
              {de ? "Deutschland" : "Germany"}
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{de ? "Kontakt" : "Contact"}</h2>
            <p className="mt-2">
              E-Mail: hallo@konnevia.de<br />
              {de ? "Telefon" : "Phone"}: +49 30 000000-0
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{de ? "Vertretungsberechtigte" : "Managing directors"}</h2>
            <p className="mt-2">Geschäftsführung: N. N.</p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{de ? "Register und Steuern" : "Register and tax"}</h2>
            <p className="mt-2">
              {de ? "Handelsregister" : "Commercial register"}: Amtsgericht Berlin-Charlottenburg, HRB 000000 B<br />
              {de ? "Umsatzsteuer-ID gemäß § 27a UStG" : "VAT ID under § 27a UStG"}: DE000000000
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {de ? "Verantwortlich für redaktionelle Inhalte" : "Responsible for editorial content"}
            </h2>
            <p className="mt-2">N. N., Adresse wie oben.</p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {de ? "Streitschlichtung" : "Dispute resolution"}
            </h2>
            <p className="mt-2">
              {de
                ? "Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Konnevia richtet sich ausschließlich an Unternehmen (B2B)."
                : "We are not obliged and not willing to take part in consumer dispute resolution proceedings. Konnevia is a business-to-business service."}
            </p>
          </div>
          <p className="rounded-md border border-warning/30 bg-warning/10 p-4 text-warning-foreground">
            {de
              ? "Hinweis: Diese Angaben sind Platzhalter und müssen vor dem Livegang durch die echten Unternehmensdaten ersetzt werden."
              : "Note: these details are placeholders and must be replaced with real company data before going live."}
          </p>
        </section>
      </article>
      <MarketingFooter />
    </div>
  );
}
