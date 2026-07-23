import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileText, MapPin, Lock, Users, ScrollText } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { translations } from "@/lib/translations";

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

const icons = [MapPin, Lock, ShieldCheck, FileText, Users, ScrollText];

function Compliance() {
  const t = useT();
  const { lang } = useI18n();
  const c = (translations[lang] as any).compliance as {
    cards: [string, string][];
    classCols: string[];
    classRows: [string, string, string][];
    germanItems: [string, string][];
  };
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{t("compliance.badge")}</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">{t("compliance.title")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("compliance.sub")}
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {c.cards.map(([title, desc], idx) => {
            const Icon = icons[idx];
            return (
              <div key={title} className="rounded-2xl border border-border bg-card p-6">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">{t("compliance.classTitle")}</h2>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>{c.classCols.map((col) => <th key={col} className="py-2">{col}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.classRows.map(([a, b, cc]) => (
                  <tr key={a}><td className="py-2 font-medium">{a}</td><td>{b}</td><td className="text-muted-foreground">{cc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">{t("compliance.germanTitle")}</h2>
            <ul className="mt-4 space-y-3 text-sm text-foreground/85">
              {c.germanItems.map(([b, rest]) => (
                <li key={b}><b>{b}</b> {rest}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          {t("compliance.footnote")}
        </p>
      </section>
      <MarketingFooter />
    </div>
  );
}
