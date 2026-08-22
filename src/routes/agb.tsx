import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/promo/legal-page";

export const Route = createFileRoute("/agb")({
  head: () => ({
    meta: [
      { title: "AGB / Terms — OmniQora" },
      {
        name: "description",
        content:
          "Allgemeine Geschäftsbedingungen für die Nutzung von OmniQora: Vertragsschluss, Leistungen, Preise, Laufzeiten, Verfügbarkeit und Haftung im B2B-Kontext.",
      },
      { property: "og:title", content: "AGB / Terms — OmniQora" },
      { property: "og:description", content: "Allgemeine Geschäftsbedingungen von OmniQora (B2B)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc="terms" />,
});
