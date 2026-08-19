import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle, ShieldCheck, Workflow, Sparkles, Building2, Handshake,
  CheckCircle2, ArrowRight, Lock, FileText, Clock,
} from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { translations } from "@/lib/translations";

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Konnevia — WhatsApp Workflow Platform for Germany" },
      {
        name: "description",
        content:
          "Turn WhatsApp into a compliant business process. Intake, cases, quotes, payments, third-party fulfilment. GDPR-first, made in Germany.",
      },
      { property: "og:title", content: "Konnevia — WhatsApp Workflow Platform for Germany" },
      {
        property: "og:description",
        content:
          "One WhatsApp workflow engine for Konnevia products, independent SMEs and partner agencies.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const t = useT();
  const { lang } = useI18n();
  const home = (translations[lang] as any).home as {
    opsCards: [string, string][];
    packs: { name: string; desc: string }[];
  };
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40" aria-hidden />
        <div className="absolute inset-x-0 top-0 -z-10 h-[500px] bg-gradient-to-b from-primary-soft/60 via-background to-background" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 md:pt-28">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                <ShieldCheck className="mr-1.5 h-3 w-3" /> {t("home.badge")}
              </Badge>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
                {t("home.heroLine1")}<br />
                <span className="text-primary">{t("home.heroLine2")}</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                {t("home.heroSub")}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/app">
                  <Button size="lg" className="h-11 px-6">
                    {t("home.ctaDemo")} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="h-11 px-6">{t("home.ctaPricing")}</Button>
                </Link>
              </div>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
                {[
                  { k: t("home.stat1k"), v: t("home.stat1v") },
                  { k: t("home.stat2k"), v: t("home.stat2v") },
                  { k: t("home.stat3k"), v: t("home.stat3v") },
                ].map((s) => (
                  <div key={s.v}>
                    <dt className="font-display text-2xl font-semibold text-foreground">{s.k}</dt>
                    <dd className="text-xs text-muted-foreground">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Chat mockup */}
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/15 via-transparent to-info/10 blur-2xl" />
              <Card className="overflow-hidden border-border/60 shadow-elegant">
                <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{t("home.chatTitle")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("home.chatSub")}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10px]">{t("home.chatCase")}</Badge>
                </div>
                <CardContent className="space-y-3 bg-[oklch(0.98_0.008_150)] p-4">
                  <Bubble side="in">Guten Tag, ich hätte gern einen Termin für eine Hautanalyse.</Bubble>
                  <Bubble side="ai">Hallo Anna 👋 Gern. Behandlungsart und Wunschzeit?</Bubble>
                  <Bubble side="in">Hautanalyse + Reinigung. Do. Nachmittag?</Bubble>
                  <Bubble side="out">Perfekt — 15:30 oder 16:15 wäre frei. ✅</Bubble>
                  <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-primary-foreground/80">
                    <span className="font-medium text-primary">System:</span>{" "}
                    <span className="text-foreground/70">Termin gebucht · Kalender aktualisiert · SMS-Erinnerung 24h vorher.</span>
                  </div>
                </CardContent>
              </Card>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <MiniStat icon={<Clock className="h-3.5 w-3.5" />} label={t("home.miniHandle")} value={t("home.miniHandleV")} />
                <MiniStat icon={<Lock className="h-3.5 w-3.5" />} label={t("home.miniSecure")} value={t("home.miniSecureV")} />
                <MiniStat icon={<FileText className="h-3.5 w-3.5" />} label={t("home.miniAudit")} value={t("home.miniAuditV")} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Surfaces */}
      <section className="border-y border-border/60 bg-surface-2">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="font-display text-sm font-medium uppercase tracking-widest text-primary">{t("home.surfacesEyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold md:text-4xl">{t("home.surfacesTitle")}</h2>
            <p className="mt-3 text-muted-foreground">
              {t("home.surfacesSub")}
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <SurfaceCard
              icon={<Building2 className="h-5 w-5" />}
              title={t("home.s1t")}
              price={t("home.s1p")}
              buyer={t("home.s1b")}
              bullets={[t("home.s1l1"), t("home.s1l2"), t("home.s1l3")]}
              tone="soft"
            />
            <SurfaceCard
              icon={<MessageCircle className="h-5 w-5" />}
              title={t("home.s2t")}
              price={t("home.s2p")}
              buyer={t("home.s2b")}
              bullets={[t("home.s2l1"), t("home.s2l2"), t("home.s2l3")]}
              tone="primary"
              mostLabel={t("home.s2most")}
            />
            <SurfaceCard
              icon={<Handshake className="h-5 w-5" />}
              title={t("home.s3t")}
              price={t("home.s3p")}
              buyer={t("home.s3b")}
              bullets={[t("home.s3l1"), t("home.s3l2"), t("home.s3l3")]}
              tone="soft"
            />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-10 md:grid-cols-3">
          <Pillar icon={<Workflow className="h-5 w-5" />} title={t("home.pillar1t")} body={t("home.pillar1b")} />
          <Pillar icon={<Sparkles className="h-5 w-5" />} title={t("home.pillar2t")} body={t("home.pillar2b")} />
          <Pillar icon={<ShieldCheck className="h-5 w-5" />} title={t("home.pillar3t")} body={t("home.pillar3b")} />
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-y border-border/60 bg-surface-2">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="max-w-3xl font-display text-3xl font-semibold md:text-4xl">
            {t("home.opsTitle")}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {home.opsCards.map(([title, d]) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verticals */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-display text-sm font-medium uppercase tracking-widest text-primary">{t("home.verticalsEyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold md:text-4xl">{t("home.verticalsTitle")}</h2>
          </div>
          <Link to="/workflow-packs">
            <Button variant="outline">{t("home.exploreAll")} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {home.packs.map((v) => (
            <div key={v.name} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition hover:shadow-elegant">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{v.name}</h3>
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10px]">{t("home.ready")}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{v.desc}</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-primary">
                <span className="underline-offset-4 group-hover:underline">{t("home.includedWorkflows")}</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold md:text-4xl">
            {t("home.ctaTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-sidebar-foreground/70">
            {t("home.ctaSub")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/app">
              <Button size="lg" className="h-11 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
                {t("common.openDemo")}
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline" className="h-11 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent">
                {t("common.seePricing")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out" | "ai"; children: React.ReactNode }) {
  const styles =
    side === "in"
      ? "bg-white border border-border"
      : side === "ai"
      ? "ml-auto bg-primary-soft text-foreground"
      : "ml-auto bg-primary text-primary-foreground";
  return (
    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${styles}`}>
      {side === "ai" && <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">AI · Aida</div>}
      {children}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function SurfaceCard({
  icon, title, price, buyer, bullets, tone, mostLabel,
}: { icon: React.ReactNode; title: string; price: string; buyer: string; bullets: string[]; tone: "primary" | "soft"; mostLabel?: string }) {
  const border = tone === "primary" ? "border-primary/40 bg-card ring-1 ring-primary/20" : "border-border bg-card";
  return (
    <div className={`rounded-2xl p-6 ${border}`}>
      <div className="flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {icon}
        </span>
        {tone === "primary" && mostLabel && (
          <Badge className="bg-primary text-primary-foreground hover:bg-primary">{mostLabel}</Badge>
        )}
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{buyer}</p>
      <div className="mt-3 font-display text-2xl font-semibold text-foreground">{price}</div>
      <ul className="mt-4 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2 text-sm text-foreground/85">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pillar({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
        {icon}
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
