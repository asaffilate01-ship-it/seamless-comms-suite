import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/promo/legal-page";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum / Legal notice — OmniQora" },
      {
        name: "description",
        content:
          "Anbieterkennzeichnung für OmniQora — eine Handelsmarke der iTechLounge Ltd (UK) und der iTechLounge GmbH (Deutschland). Verfügbar in DE, EN, TR, AR und UK.",
      },
      { property: "og:title", content: "Impressum / Legal notice — OmniQora" },
      { property: "og:description", content: "Anbieterkennzeichnung und Unternehmensangaben zu OmniQora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc="imprint" />,
});
