import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/workflow-packs")({
  head: () => ({
    meta: [
      { title: "Workflow packs — Konnevia" },
      { name: "description", content: "Preinstalled workflow packs for LoungeBeauty, LoungeTrades, LoungeCare, LoungeEstate, LoungeHosp and LoungeAuto." },
      { property: "og:title", content: "Workflow packs — Konnevia" },
      { property: "og:description", content: "Vertical WhatsApp workflow packs bundled with Konnevia." },
    ],
  }),
  component: Packs,
});

const packs = [
  {
    name: "LoungeBeauty", tagline: "Appointments-first for studios & clinics.",
    flows: ["Termin buchen", "Reschedule / Cancel", "No-show recovery", "24h Erinnerung", "Bewertungs-Follow-up", "Gutschein-Verkauf"],
    metrics: [["71%", "conversion"], ["3.4 min", "avg. handle"], ["4.8 / 5", "CSAT"]],
  },
  {
    name: "LoungeTrades", tagline: "Emergency triage to invoice, one thread.",
    flows: ["Notfall-Triage", "Sicherer Foto-Upload", "Techniker-Dispatch", "Kostenvoranschlag", "Anfahrts-Update", "Rechnung & Zahlung"],
    metrics: [["58%", "conversion"], ["14.8 min", "avg. handle"], ["96%", "SLA hit"]],
  },
  {
    name: "LoungeCare", tagline: "Regulated healthcare messaging with § 203 in mind.",
    flows: ["Rezept-Nachbestellung", "Versichertenprüfung", "Ärztliche Freigabe", "Apotheken-Handover", "Zustellstatus", "Recall / Impftermin"],
    metrics: [["92%", "conversion"], ["2.1 min", "avg. handle"], ["Zero", "PII in chat"]],
  },
  {
    name: "LoungeEstate", tagline: "From viewing request to signed contract.",
    flows: ["Besichtigung", "Interessentenprofil", "Bonitätsformular", "Objektübergabe", "Wartungstickets", "Kaution & Rückgabe"],
    metrics: [["44%", "conversion"], ["5.7 min", "avg. handle"], ["+31%", "leads qualified"]],
  },
  {
    name: "LoungeHosp", tagline: "Reservations, deposits, groups, feedback.",
    flows: ["Reservierung", "Gruppenanfrage", "Deposit einziehen", "Vor-Ort Check-in", "Sonderwünsche", "Feedback-Loop"],
    metrics: [["48%", "no-show ↓"], ["2.6 min", "avg. handle"], ["+18%", "avg. ticket"]],
  },
  {
    name: "LoungeAuto", tagline: "Workshop intake to pickup, painless.",
    flows: ["Service-Intake", "Foto & VIN-Erfassung", "Kostenvoranschlag", "Ersatzwagen", "Abhol-Benachrichtigung", "Werkstatt-NPS"],
    metrics: [["63%", "digital intake"], ["4.2 min", "avg. handle"], ["4.6 / 5", "CSAT"]],
  },
];

function Packs() {
  const t = useT();
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{t("packs.badge")}</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">
            {t("packs.title")}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {t("packs.sub")}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {packs.map((p) => (
            <article key={p.name} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border bg-surface-2 px-6 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold">{p.name}</h2>
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10px]">{t("packs.preinstalled")}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
                {p.metrics.map(([v, l]) => (
                  <div key={l} className="px-3 py-4">
                    <div className="font-display text-lg font-semibold">{v}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              <ul className="grid grid-cols-2 gap-2 p-5 text-sm">
                {p.flows.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
