import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileText, MapPin, Lock, Users, ScrollText } from "lucide-react";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance & security — LoungeConnect" },
      { name: "description", content: "GDPR, TTDSG and § 203 StGB by construction. EU data residency, RLS, audit trail, secure portal links and DSGVO subject rights." },
      { property: "og:title", content: "Compliance & security — LoungeConnect" },
      { property: "og:description", content: "German compliance posture, data classification and security controls of LoungeConnect." },
    ],
  }),
  component: Compliance,
});

function Compliance() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Trust · maintained by LoungeTech Digitallösungen GmbH</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">Compliance is a product decision, not a policy.</h1>
          <p className="mt-3 text-muted-foreground">
            The controls below are what the platform enforces or exposes to app owners. This page is
            not an independent certification — it describes capabilities, not audit outcomes.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: MapPin, t: "EU data residency", d: "Frankfurt (eu-central-1) by default. Message media and portal uploads stay in the EU." },
            { icon: Lock, t: "Row-level security", d: "Every table scoped by tenant, brand and role. Break-glass access uses a separate path with reason, expiry and review." },
            { icon: ShieldCheck, t: "WhatsApp Cloud API only", d: "Official Business Platform route via Meta or an authorised BSP. No unofficial scraping." },
            { icon: FileText, t: "DSGVO subject rights", d: "Export, rectification and erasure workflows for controllers, with per-purpose retention classes." },
            { icon: Users, t: "Consent & purpose", d: "Purpose-scoped consent, frequency caps, opt-out synchronised across channels and campaigns." },
            { icon: ScrollText, t: "Audit trail", d: "Every send, view, decision and AI action is logged with actor, timestamp, purpose and retention." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">Data classification</h2>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-2">Class</th><th>Examples</th><th>Default handling</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["Public", "Marketing copy, templates", "Standard storage"],
                  ["Business", "Contacts, cases, invoices", "RLS + audit"],
                  ["Sensitive", "IDs, insurance, health", "Secure portal only, short retention"],
                  ["Regulated", "§ 203 StGB material", "Encrypted, role-gated, break-glass required"],
                ].map(([a, b, c]) => (
                  <tr key={a}><td className="py-2 font-medium">{a}</td><td>{b}</td><td className="text-muted-foreground">{c}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">German specifics</h2>
            <ul className="mt-4 space-y-3 text-sm text-foreground/85">
              <li><b>TTDSG.</b> Consent UX and cookie posture aligned to § 25 TTDSG.</li>
              <li><b>§ 203 StGB.</b> Regulated professions get a hardened preset that keeps sensitive content out of the chat body.</li>
              <li><b>DPA.</b> Standard Auftragsverarbeitungsvertrag with subprocessor list, on request in German.</li>
              <li><b>Public sector.</b> DACH-only residency, questionnaire support and dedicated CS on Scale/Enterprise.</li>
            </ul>
          </div>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          This page is maintained by LoungeTech Digitallösungen GmbH to answer common questions about
          LoungeConnect. It is app-owned editable content — not an independent certification.
        </p>
      </section>
      <MarketingFooter />
    </div>
  );
}
