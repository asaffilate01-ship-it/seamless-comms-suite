import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Badge } from "@/components/ui/badge";
import {
  Inbox, Workflow, Users2, ShieldCheck, Sparkles, CreditCard, Calendar, FileSignature,
  Handshake, LineChart, Bell, Lock, GitBranch, Globe, Building2,
} from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { translations } from "@/lib/translations";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Product — Konnevia" },
      { name: "description", content: "Cases, workflows, consent, partners, AI controls, portal links, analytics — every capability of the Konnevia platform." },
      { property: "og:title", content: "Product — Konnevia" },
      { property: "og:description", content: "The end-to-end platform behind the Konnevia WhatsApp workflow engine." },
    ],
  }),
  component: Features,
});

function Features() {
  const t = useT();
  const { lang } = useI18n();
  const i = (translations[lang] as any).features.i as Record<string, [string, string]>;

  const groups = [
    { title: t("features.g1"), items: [
      { icon: Inbox, k: "inbox" }, { icon: Workflow, k: "timeline" },
      { icon: Calendar, k: "sched" }, { icon: Bell, k: "sla" },
    ]},
    { title: t("features.g2"), items: [
      { icon: Sparkles, k: "ai" }, { icon: GitBranch, k: "wf" }, { icon: FileSignature, k: "tmpl" },
    ]},
    { title: t("features.g3"), items: [
      { icon: CreditCard, k: "pay" }, { icon: Handshake, k: "third" }, { icon: LineChart, k: "rev" },
    ]},
    { title: t("features.g4"), items: [
      { icon: Users2, k: "roles" }, { icon: Lock, k: "consent" }, { icon: ShieldCheck, k: "audit" },
    ]},
    { title: t("features.g5"), items: [
      { icon: Building2, k: "tenant" }, { icon: Globe, k: "wl" }, { icon: ShieldCheck, k: "eu" },
    ]},
  ];

  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{t("features.badge")}</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">{t("features.title")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("features.sub")}
          </p>
        </div>

        <div className="mt-14 space-y-16">
          {groups.map((g) => (
            <div key={g.title}>
              <h2 className="font-display text-2xl font-semibold">{g.title}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const [name, desc] = i[it.k];
                  return (
                    <div key={it.k} className="rounded-2xl border border-border bg-card p-6">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="mt-4 font-semibold">{name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
