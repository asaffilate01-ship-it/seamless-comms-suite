import { createFileRoute } from "@tanstack/react-router";
import { MarketingFooter, MarketingNav } from "@/components/marketing/nav";
import { useI18nSafe } from "@/lib/i18n";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzerklärung — OmniQora" },
      {
        name: "description",
        content:
          "Wie OmniQora personenbezogene Daten in WhatsApp-Workflows verarbeitet: Rechtsgrundlagen, Auftragsverarbeitung, Speicherfristen und Betroffenenrechte nach DSGVO.",
      },
      { property: "og:title", content: "Datenschutzerklärung — OmniQora" },
      { property: "og:description", content: "DSGVO-Informationen zur Datenverarbeitung in OmniQora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Datenschutz,
});

const sections = {
  de: [
    ["1. Verantwortlicher", "OmniQora GmbH, Musterstraße 1, 10115 Berlin, hallo@omniqora.com. Datenschutzbeauftragter: dsb@omniqora.com."],
    ["2. Zwecke und Rechtsgrundlagen", "Bereitstellung der Plattform, Vertragsdurchführung und Support: Art. 6 Abs. 1 lit. b DSGVO. Betrieb, Sicherheit, Missbrauchserkennung und Protokollierung: Art. 6 Abs. 1 lit. f DSGVO. Marketing-Nachrichten über WhatsApp nur mit ausdrücklicher Einwilligung: Art. 6 Abs. 1 lit. a DSGVO, jederzeit widerruflich."],
    ["3. Kategorien von Daten", "Kontostammdaten (Name, E-Mail, Rolle), Kommunikationsdaten aus WhatsApp-Konversationen (Telefonnummer/WA-ID, Nachrichteninhalte, Zeitstempel, Zustellstatus), Fall- und Workflow-Daten, Protokoll- und Auditdaten, technische Metadaten."],
    ["4. Auftragsverarbeitung", "Für Kundenunternehmen ist OmniQora Auftragsverarbeiter nach Art. 28 DSGVO; der Kunde bleibt Verantwortlicher für die Inhalte seiner Konversationen. Ein AV-Vertrag inklusive Subunternehmerliste wird bereitgestellt."],
    ["5. Empfänger und Drittlandtransfer", "WhatsApp Business Platform (Meta Platforms Ireland Ltd.) verarbeitet Nachrichten zwingend zur Übermittlung; Transfers in die USA erfolgen auf Basis von Standardvertragsklauseln und dem EU-US Data Privacy Framework. Hosting und Datenbank werden in der EU (Frankfurt) betrieben."],
    ["6. Sensible Daten", "Gesundheits-, Finanz- und andere besonders schützenswerte Daten werden nicht über WhatsApp-Anhänge erhoben. Stattdessen werden gesicherte Portal-Links verwendet. Berufsgeheimnisträger (§ 203 StGB) werden vertraglich und technisch eingebunden."],
    ["7. Speicherdauer", "Konversations- und Falldaten werden für die Dauer der Geschäftsbeziehung und anschließend gemäß gesetzlichen Aufbewahrungsfristen (§ 147 AO, § 257 HGB) gespeichert. Konfigurierbare Löschfristen pro Mandant, standardmäßig 24 Monate für Chatinhalte."],
    ["8. Cookies und lokale Speicherung", "Es werden ausschließlich technisch notwendige Cookies und Local-Storage-Einträge verwendet (Sitzung, Spracheinstellung) — § 25 Abs. 2 TTDSG. Kein Tracking ohne Einwilligung."],
    ["9. Betroffenenrechte", "Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21) sowie Beschwerde bei einer Aufsichtsbehörde (Art. 77). Anfragen an dsb@omniqora.com."],
    ["10. Sicherheit", "Verschlüsselung in Transit und at rest, mandantenstrenge Zugriffskontrolle über Row-Level-Security, rollenbasierte Berechtigungen, revisionssichere Audit-Logs, Signaturprüfung eingehender WhatsApp-Webhooks."],
  ],
  en: [
    ["1. Controller", "OmniQora GmbH, Musterstraße 1, 10115 Berlin, Germany, hallo@omniqora.com. Data protection officer: dsb@omniqora.com."],
    ["2. Purposes and legal bases", "Providing the platform, performing the contract and support: Art. 6(1)(b) GDPR. Operations, security, abuse detection and logging: Art. 6(1)(f) GDPR. WhatsApp marketing messages only with explicit consent: Art. 6(1)(a) GDPR, revocable at any time."],
    ["3. Categories of data", "Account data (name, email, role), communication data from WhatsApp conversations (phone number/WA ID, message content, timestamps, delivery status), case and workflow data, log and audit data, technical metadata."],
    ["4. Processing on behalf of customers", "For business customers OmniQora acts as processor under Art. 28 GDPR; the customer remains controller for conversation content. A DPA including the sub-processor list is provided."],
    ["5. Recipients and international transfers", "The WhatsApp Business Platform (Meta Platforms Ireland Ltd.) necessarily processes messages for delivery; US transfers rely on Standard Contractual Clauses and the EU-US Data Privacy Framework. Hosting and database run in the EU (Frankfurt)."],
    ["6. Sensitive data", "Health, financial and other special-category data is never collected through WhatsApp attachments. Secure portal links are used instead. Professionals bound by secrecy (§ 203 StGB) are onboarded with contractual and technical safeguards."],
    ["7. Retention", "Conversation and case data is retained for the duration of the business relationship and afterwards per statutory retention periods (§ 147 AO, § 257 HGB). Per-tenant configurable deletion, default 24 months for chat content."],
    ["8. Cookies and local storage", "Only strictly necessary cookies and local storage entries are used (session, language preference) under § 25(2) TTDSG. No tracking without consent."],
    ["9. Your rights", "Access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), portability (Art. 20), objection (Art. 21) and the right to lodge a complaint with a supervisory authority (Art. 77). Requests to dsb@omniqora.com."],
    ["10. Security", "Encryption in transit and at rest, strict tenant isolation via row-level security, role-based permissions, tamper-evident audit logs, signature verification of inbound WhatsApp webhooks."],
  ],
} as const;

function Datenschutz() {
  const de = (useI18nSafe()?.lang ?? "de") === "de";
  const list = de ? sections.de : sections.en;
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">
          {de ? "Datenschutzerklärung" : "Privacy policy"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {de ? "Stand: laufende Fassung. Gilt für omniqora.com und die OmniQora-Plattform." : "Current version. Applies to omniqora.com and the OmniQora platform."}
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
            ? "Hinweis: Dieser Text ist eine Vorlage und muss vor dem Livegang juristisch geprüft und an die tatsächlichen Verarbeitungen angepasst werden."
            : "Note: this text is a template and must be reviewed by counsel and adapted to your actual processing before going live."}
        </p>
      </article>
      <MarketingFooter />
    </div>
  );
}
