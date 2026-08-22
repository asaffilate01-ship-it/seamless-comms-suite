import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Inbox, FolderKanban, Workflow, Sparkles, Megaphone, ShieldCheck,
  ArrowRight, Check, ChevronDown, Blocks, Building2, Handshake,
  Scissors, Wrench, Stethoscope, UtensilsCrossed, Home as HomeIcon, ShoppingBag,
  KeyRound, MonitorSmartphone, Smartphone,
} from "lucide-react";
import { PromoHeader, PromoFooter, PromoBottomNav } from "@/components/promo/promo-chrome";
import { WebAppMockup, MobileAppMockup } from "@/components/promo/mockups";
import { usePromo } from "@/lib/promo-lang";
import { unlockSite } from "@/lib/site-gate";
import { useNavigate } from "@tanstack/react-router";
import heroImage from "@/assets/promo-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OmniQora — Alle Kunden. Alle Gespräche. Ein System." },
      {
        name: "description",
        content:
          "OmniQora macht WhatsApp zum kontrollierten Geschäftsprozess: gemeinsamer Posteingang, Fälle, Workflows, KI-Assistent und DSGVO-konforme Protokolle. Gehostet in Frankfurt.",
      },
      { property: "og:title", content: "OmniQora — Alle Kunden. Alle Gespräche. Ein System." },
      {
        property: "og:description",
        content:
          "WhatsApp-Workflow-Plattform für Deutschland: Posteingang, Fälle, Automatisierung, KI-Assistent und Compliance in einem System.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PromoHome,
});

const featureIcons = [Inbox, FolderKanban, Workflow, Sparkles, Megaphone, ShieldCheck];
const editionIcons = [Blocks, Building2, Handshake];
const packIcons = [Scissors, Wrench, Stethoscope, UtensilsCrossed, HomeIcon, ShoppingBag];

function PromoHome() {
  const { c, dir, transitioning } = usePromo();
  return (
    <div
      dir={dir}
      className="min-h-screen bg-background transition-opacity duration-200"
      style={{ opacity: transitioning ? 0.35 : 1 }}
    >
      <PromoHeader />
      <main>
        <Hero />
        <Stats />
        <Features />
        <Screens />
        <Editions />
        <Packs />
        <Faq />
        <AccessSection />
      </main>
      <PromoFooter />
      <PromoBottomNav />
    </div>
  );
}

function Hero() {
  const { c } = usePromo();
  return (
    <section id="top" className="relative overflow-hidden">
      <img
        src={heroImage}
        alt=""
        width={1920}
        height={1088}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.16_0.03_170/0.88)] via-[oklch(0.16_0.03_170/0.82)] to-[oklch(0.16_0.03_170/0.95)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/90 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.8_0.17_150)]" />
          {c.hero.badge}
        </span>
        <h1 className="mt-6 max-w-3xl font-display text-4xl font-semibold leading-[1.08] text-primary-foreground sm:text-6xl">
          {c.hero.titleA}
          <span className="block bg-gradient-to-r from-[oklch(0.85_0.16_150)] to-[oklch(0.88_0.11_100)] bg-clip-text text-transparent">
            {c.hero.titleB}
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-foreground/80">{c.hero.sub}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => document.getElementById("access")?.scrollIntoView({ behavior: "smooth" })}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95"
          >
            {c.hero.ctaPrimary}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            className="inline-flex items-center rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-6 py-3 text-sm font-semibold text-primary-foreground backdrop-blur transition hover:bg-primary-foreground/20"
          >
            {c.hero.ctaSecondary}
          </button>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
          {c.hero.trust.map((tItem) => (
            <li key={tItem} className="flex items-center gap-2 text-xs text-primary-foreground/75">
              <Check className="h-3.5 w-3.5 text-[oklch(0.82_0.16_150)]" />
              {tItem}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stats() {
  const { c } = usePromo();
  return (
    <section className="border-b border-border/60 bg-surface-2">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-10 lg:grid-cols-4">
        {c.stats.map((s) => (
          <div key={s.label}>
            <div className="font-display text-2xl font-semibold text-foreground">{s.value}</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{sub}</p>
    </div>
  );
}

function Features() {
  const { c } = usePromo();
  return (
    <section id="features" className="scroll-mt-28 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead title={c.features.title} sub={c.features.sub} />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {c.features.items.map((f, i) => {
            const Icon = featureIcons[i] ?? Sparkles;
            return (
              <article
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-elegant transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-premium"
              >
                <div className="absolute inset-x-0 -top-24 h-40 bg-gradient-to-b from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="relative mt-5 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Screens() {
  const { c } = usePromo();
  return (
    <section id="screens" className="scroll-mt-28 border-y border-border/60 bg-surface-2 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead title={c.screens.title} sub={c.screens.sub} />
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-center">
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <MonitorSmartphone className="h-4 w-4" />
              {c.screens.webLabel}
            </div>
            <WebAppMockup />
            <p className="mt-3 text-xs text-muted-foreground">{c.screens.webCaption}</p>
          </div>
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Smartphone className="h-4 w-4" />
              {c.screens.mobileLabel}
            </div>
            <MobileAppMockup />
            <p className="mt-3 text-center text-xs text-muted-foreground">{c.screens.mobileCaption}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Editions() {
  const { c } = usePromo();
  return (
    <section id="editions" className="scroll-mt-28 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead title={c.editions.title} sub={c.editions.sub} />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {c.editions.items.map((e, i) => {
            const Icon = editionIcons[i] ?? Blocks;
            return (
              <article
                key={e.name}
                className="relative flex flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-elegant transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-premium"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-foreground">{e.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{e.desc}</p>
                <ul className="mt-4 space-y-2">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs text-foreground/80">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Packs() {
  const { c } = usePromo();
  return (
    <section className="border-y border-border/60 bg-surface-2 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead title={c.packs.title} sub={c.packs.sub} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.packs.items.map((p, i) => {
            const Icon = packIcons[i] ?? Scissors;
            return (
              <div
                key={p.name}
                className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-elegant transition-colors hover:border-primary/35"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { c } = usePromo();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-28 py-20">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHead title={c.faq.title} sub={c.faq.sub} />
        <div className="mt-10 space-y-3">
          {c.faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-elegant"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-5 text-start"
                >
                  <span className="text-sm font-semibold text-foreground">{item.q}</span>
                  <ChevronDown
                    className={[
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>
                <div
                  className="grid transition-all duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AccessSection() {
  const { c } = usePromo();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  return (
    <section id="access" className="scroll-mt-28 pb-24 pt-8 lg:pb-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-[oklch(0.2_0.04_170)] to-[oklch(0.3_0.08_160)] p-8 shadow-premium sm:p-12">
          <div className="absolute -end-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold text-primary-foreground sm:text-3xl">{c.cta.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-primary-foreground/80">{c.cta.sub}</p>
              <a
                href="mailto:hallo@omniqora.com?subject=OmniQora%20Pilot"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground px-6 py-3 text-sm font-semibold text-foreground transition hover:opacity-90"
              >
                {c.cta.button}
                <ArrowRight className="h-4 w-4" />
              </a>
              <p className="mt-3 text-[11px] text-primary-foreground/60">{c.cta.note}</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (unlockSite(value)) {
                  setError(false);
                  navigate({ to: "/platform" });
                } else {
                  setError(true);
                }
              }}
              className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-5 backdrop-blur"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
                <KeyRound className="h-4 w-4" />
                {c.gate.title}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-primary-foreground/70">{c.gate.sub}</p>
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={c.gate.placeholder}
                className="mt-4 h-11 w-full rounded-xl border border-primary-foreground/25 bg-background/95 px-3 text-sm text-foreground outline-none focus:border-primary"
              />
              {error && <p className="mt-2 text-xs font-medium text-[oklch(0.8_0.14_25)]">{c.gate.error}</p>}
              <button
                type="submit"
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95"
              >
                {c.gate.submit}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
