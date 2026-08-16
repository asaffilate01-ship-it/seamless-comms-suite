import { createFileRoute } from "@tanstack/react-router";
import { MarketingFooter, MarketingNav } from "@/components/marketing/nav";
import { useI18nSafe } from "@/lib/i18n";

export const Route = createFileRoute("/agb")({
  head: () => ({
    meta: [
      { title: "AGB — Konnevia" },
      {
        name: "description",
        content:
          "Allgemeine Geschäftsbedingungen für die Nutzung von Konnevia: Vertragsschluss, Leistungen, Preise, Laufzeiten, Verfügbarkeit und Haftung im B2B-Kontext.",
      },
      { property: "og:title", content: "AGB — Konnevia" },
      { property: "og:description", content: "Allgemeine Geschäftsbedingungen von Konnevia (B2B)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Agb,
});

const clauses = {
  de: [
    ["1. Geltungsbereich", "Diese Bedingungen gelten für alle Verträge zwischen der Konnevia GmbH und Unternehmen im Sinne des § 14 BGB über die Nutzung der Konnevia-Plattform (SaaS), der eingebetteten Add-on-Variante und der Partner-Edition."],
    ["2. Leistungsgegenstand", "Konnevia stellt eine mandantenfähige Software zur Steuerung von Kundenkommunikation über die WhatsApp Business Platform bereit, inklusive Postfach, Fällen, Workflows, KI-Unterstützung mit menschlicher Freigabe, Rollen und Audit-Protokollen."],
    ["3. Vertragsschluss und Testphase", "Der Vertrag kommt mit Freischaltung des Arbeitsbereichs zustande. Testphasen enden automatisch und gehen nur nach ausdrücklicher Bestellung in ein kostenpflichtiges Abonnement über."],
    ["4. Preise und Zahlung", "Es gilt die zum Bestellzeitpunkt gültige Preisliste, monatlich oder jährlich im Voraus. Nutzungsabhängige Bestandteile (z. B. WhatsApp-Konversationen) werden nachschüssig abgerechnet. Alle Preise netto zzgl. USt."],
    ["5. Pflichten des Kunden", "Der Kunde verantwortet Inhalte, Einwilligungen der Endkunden, die Einhaltung der Meta-Richtlinien sowie die Verwaltung seiner Nutzer und Rollen. Zugangsdaten und API-Token sind vertraulich zu behandeln."],
    ["6. Verfügbarkeit", "Zielverfügbarkeit 99,5 % im Monatsmittel, ausgenommen angekündigte Wartungsfenster und Störungen bei Meta oder anderen Drittanbietern."],
    ["7. Auftragsverarbeitung", "Ergänzend gilt der Auftragsverarbeitungsvertrag nach Art. 28 DSGVO, der Bestandteil dieses Vertrags ist."],
    ["8. Laufzeit und Kündigung", "Monatsabonnements sind zum Monatsende kündbar, Jahresabonnements mit 30 Tagen Frist zum Laufzeitende. Nach Vertragsende werden Daten auf Wunsch exportiert und anschließend fristgerecht gelöscht."],
    ["9. Haftung", "Haftung unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Personenschäden und nach Produkthaftungsgesetz; im Übrigen beschränkt auf den typischen vorhersehbaren Schaden, höchstens die in zwölf Monaten gezahlten Entgelte."],
    ["10. Schlussbestimmungen", "Es gilt deutsches Recht. Gerichtsstand ist Berlin. Änderungen dieser Bedingungen werden mindestens 30 Tage vorher mitgeteilt."],
  ],
  en: [
    ["1. Scope", "These terms apply to all contracts between Konnevia GmbH and business customers (§ 14 BGB) for the Konnevia platform (SaaS), the embedded add-on and the partner edition."],
    ["2. Services", "Konnevia provides multi-tenant software to run customer communication over the WhatsApp Business Platform, including inbox, cases, workflows, AI assistance with human approval, roles and audit logs."],
    ["3. Formation and trials", "The contract is concluded when the workspace is activated. Trials end automatically and only convert to a paid subscription upon an explicit order."],
    ["4. Prices and payment", "The price list valid at the time of order applies, billed monthly or annually in advance. Usage-based components (e.g. WhatsApp conversations) are billed in arrears. All prices are net plus VAT."],
    ["5. Customer obligations", "The customer is responsible for content, end-customer consent, compliance with Meta policies and the management of its users and roles. Credentials and API tokens must be kept confidential."],
    ["6. Availability", "Target availability is 99.5% monthly average, excluding announced maintenance windows and incidents at Meta or other third parties."],
    ["7. Data processing", "The Art. 28 GDPR data processing agreement applies in addition and forms part of this contract."],
    ["8. Term and termination", "Monthly subscriptions may be cancelled at the end of the month, annual subscriptions with 30 days' notice to the end of the term. On termination data is exported on request and then deleted within the agreed period."],
    ["9. Liability", "Unlimited liability for intent, gross negligence, personal injury and under product liability law; otherwise limited to typical foreseeable damage, capped at the fees paid in the preceding twelve months."],
    ["10. Final provisions", "German law applies. Place of jurisdiction is Berlin. Changes to these terms are announced at least 30 days in advance."],
  ],
} as const;

function Agb() {
  const de = (useI18nSafe()?.lang ?? "de") === "de";
  const list = de ? clauses.de : clauses.en;
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">
          {de ? "Allgemeine Geschäftsbedingungen" : "Terms of service"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {de ? "Für Unternehmenskunden (B2B)." : "For business customers (B2B)."}
        </p>
        <div className="mt-8 space-y-7">
          {list.map(([heading, body]) => (
            <section key={heading}>
              <h2 className="text-base font-semibold text-foreground">{heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          {de
            ? "Hinweis: Vorlage — vor dem Livegang juristisch prüfen lassen."
            : "Note: template — have counsel review before going live."}
        </p>
      </article>
      <MarketingFooter />
    </div>
  );
}
