import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/promo/legal-page";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutz / Privacy — OmniQora" },
      {
        name: "description",
        content:
          "Wie OmniQora personenbezogene Daten verarbeitet: Rechtsgrundlagen, Auftragsverarbeitung, Speicherfristen und Betroffenenrechte nach DSGVO und UK GDPR.",
      },
      { property: "og:title", content: "Datenschutz / Privacy — OmniQora" },
      { property: "og:description", content: "DSGVO- und UK-GDPR-Informationen zur Datenverarbeitung in OmniQora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc="privacy" />,
});
