import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  BrainCircuit,
  Building2,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  KeyRound,
  MessagesSquare,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PromoHeader, PromoFooter, PromoBottomNav } from "@/components/promo/promo-chrome";
import { WebAppMockup, MobileAppMockup } from "@/components/promo/mockups";
import { PricingSection } from "@/components/promo/pricing-section";
import { Button } from "@/components/ui/button";
import { usePromo } from "@/lib/promo-lang";
import { unlockSite } from "@/lib/site-gate";
import type { PromoLang } from "@/lib/promo-content";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OmniQora — Your business, working as one" },
      {
        name: "description",
        content: "OmniQora connects customer conversations, AI, business intelligence and operational services in one secure platform.",
      },
      { property: "og:title", content: "OmniQora — Your business, working as one" },
      {
        property: "og:description",
        content: "Connected conversations, intelligence and business services for organisations in the UK, Europe and internationally.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: UnifiedHome,
});

const mergedCopy: Record<PromoLang, {
  eyebrow: string;
  platformTitle: string;
  platformSub: string;
  platformLink: string;
  servicesEyebrow: string;
  servicesTitle: string;
  servicesSub: string;
  serviceLink: string;
  waysTitle: string;
  waysSub: string;
  ways: { title: string; text: string }[];
  previewTitle: string;
  previewSub: string;
  services: { title: string; text: string }[];
}> = {
  de: {
    eyebrow: "VERNETZTE BUSINESS INTELLIGENCE",
    platformTitle: "Ein intelligenter Kern für jede Kundenbeziehung.",
    platformSub: "Kanäle, Kundenkontext, Zusammenarbeit und KI-Unterstützung – übersichtlich an einem Ort.",
    platformLink: "Plattform ansehen",
    servicesEyebrow: "OMNIQORA LEISTUNGEN",
    servicesTitle: "Mehr als Kommunikation.",
    servicesSub: "Ausgewählte Fähigkeiten für bessere Entscheidungen, effizientere Abläufe und nachhaltige Entwicklung.",
    serviceLink: "Bedarf besprechen",
    waysTitle: "So arbeiten Sie mit uns.",
    waysSub: "Starten Sie fokussiert oder verbinden Sie mehrere Fähigkeiten zu einer abgestimmten Lösung.",
    ways: [
      { title: "Plattform", text: "Omnichannel-Kommunikation, KI und Teamarbeit als skalierbarer Service." },
      { title: "Add-ons", text: "Erweitern Sie Ihre bestehende Umgebung um gezielte OmniQora-Fähigkeiten." },
      { title: "Managed Delivery", text: "Begleitete Umsetzung für umfassendere geschäftliche Anforderungen." },
    ],
    previewTitle: "Ein klarer Blick auf das, was zählt.",
    previewSub: "Für Desktop und Mobilgeräte – mit konsistentem Kontext für Ihr Team.",
    services: [
      { title: "Connect & Voice", text: "Kundenkommunikation und professionelle Erreichbarkeit über relevante Kanäle." },
      { title: "AI & Wissen", text: "Praktische Assistenz und fundierte Antworten aus freigegebenem Wissen." },
      { title: "Business360", text: "Ein strukturierter Blick auf Leistung, Chancen und Prioritäten." },
      { title: "Transformation", text: "Übersicht und Unterstützung für komplexe Veränderungsvorhaben." },
      { title: "Governance & Readiness", text: "Nachvollziehbare Kontrollen und Vorbereitung auf anspruchsvolle Beschaffung." },
      { title: "Revenue & Operations", text: "Bessere Verbindung zwischen Kundengewinnung, Leistung und Zahlung." },
    ],
  },
  en: {
    eyebrow: "CONNECTED BUSINESS INTELLIGENCE",
    platformTitle: "One intelligent core for every customer relationship.",
    platformSub: "Channels, customer context, collaboration and AI assistance—clear and connected in one place.",
    platformLink: "Explore the platform",
    servicesEyebrow: "OMNIQORA SERVICES",
    servicesTitle: "Beyond communication.",
    servicesSub: "Selected capabilities for better decisions, stronger operations and sustainable progress.",
    serviceLink: "Discuss your needs",
    waysTitle: "Ways to work with us.",
    waysSub: "Start with one focused capability or connect several into a coordinated solution.",
    ways: [
      { title: "Platform", text: "Omnichannel communication, AI and collaboration as a scalable service." },
      { title: "Add-ons", text: "Extend your existing environment with targeted OmniQora capabilities." },
      { title: "Managed delivery", text: "Guided delivery for broader or more complex business requirements." },
    ],
    previewTitle: "A clear view of what matters.",
    previewSub: "Designed for desktop and mobile, with consistent context for your team.",
    services: [
      { title: "Connect & Voice", text: "Customer communication and professional availability across relevant channels." },
      { title: "AI & Knowledge", text: "Practical assistance and grounded answers from approved business knowledge." },
      { title: "Business360", text: "A structured view of performance, opportunities and priorities." },
      { title: "Transformation", text: "Clarity and support for complex business change." },
      { title: "Governance & Readiness", text: "Visible controls and preparation for demanding procurement requirements." },
      { title: "Revenue & Operations", text: "Connect customer acquisition, delivery and payment more effectively." },
    ],
  },
  tr: {
    eyebrow: "BAĞLANTILI İŞ ZEKÂSI",
    platformTitle: "Her müşteri ilişkisi için tek akıllı merkez.",
    platformSub: "Kanallar, müşteri bağlamı, ekip çalışması ve yapay zekâ desteği tek bir yerde.",
    platformLink: "Platformu keşfedin",
    servicesEyebrow: "OMNIQORA HİZMETLERİ",
    servicesTitle: "İletişimden daha fazlası.",
    servicesSub: "Daha iyi kararlar, güçlü operasyonlar ve sürdürülebilir ilerleme için seçilmiş yetenekler.",
    serviceLink: "İhtiyaçlarınızı görüşün",
    waysTitle: "Bizimle çalışma yolları.",
    waysSub: "Tek bir yetenekle başlayın veya birkaçını koordineli bir çözümde birleştirin.",
    ways: [
      { title: "Platform", text: "Ölçeklenebilir hizmet olarak çok kanallı iletişim, yapay zekâ ve ekip çalışması." },
      { title: "Eklentiler", text: "Mevcut ortamınızı hedefli OmniQora yetenekleriyle genişletin." },
      { title: "Yönetilen teslimat", text: "Daha kapsamlı iş ihtiyaçları için rehberli uygulama." },
    ],
    previewTitle: "Önemli olanın net görünümü.",
    previewSub: "Masaüstü ve mobil için, ekibinizin bağlamını koruyarak tasarlandı.",
    services: [
      { title: "Connect & Voice", text: "İlgili kanallarda müşteri iletişimi ve profesyonel erişilebilirlik." },
      { title: "Yapay Zekâ & Bilgi", text: "Onaylı iş bilgisinden pratik destek ve güvenilir yanıtlar." },
      { title: "Business360", text: "Performans, fırsatlar ve önceliklere yapılandırılmış bakış." },
      { title: "Dönüşüm", text: "Karmaşık iş değişimleri için netlik ve destek." },
      { title: "Yönetişim & Hazırlık", text: "Görünür kontroller ve zorlu satın alma gereksinimlerine hazırlık." },
      { title: "Gelir & Operasyon", text: "Müşteri kazanımı, teslimat ve ödemeyi daha etkili bağlayın." },
    ],
  },
  ar: {
    eyebrow: "ذكاء أعمال مترابط",
    platformTitle: "نواة ذكية واحدة لكل علاقة مع العملاء.",
    platformSub: "القنوات وسياق العميل والتعاون ومساعدة الذكاء الاصطناعي في مكان واحد واضح.",
    platformLink: "استكشف المنصة",
    servicesEyebrow: "خدمات OMNIQORA",
    servicesTitle: "أكثر من مجرد تواصل.",
    servicesSub: "قدرات مختارة لقرارات أفضل وعمليات أقوى وتقدم مستدام.",
    serviceLink: "ناقش احتياجاتك",
    waysTitle: "طرق العمل معنا.",
    waysSub: "ابدأ بقدرة محددة أو اجمع عدة قدرات في حل منسق.",
    ways: [
      { title: "المنصة", text: "تواصل متعدد القنوات وذكاء اصطناعي وتعاون كخدمة قابلة للتوسع." },
      { title: "الإضافات", text: "وسّع بيئتك الحالية بقدرات OmniQora المستهدفة." },
      { title: "التنفيذ المُدار", text: "تنفيذ موجّه لمتطلبات الأعمال الأوسع أو الأكثر تعقيداً." },
    ],
    previewTitle: "رؤية واضحة لما يهم.",
    previewSub: "مصممة للحاسوب والهاتف مع سياق متسق لفريقك.",
    services: [
      { title: "Connect & Voice", text: "تواصل العملاء وتوفر احترافي عبر القنوات المناسبة." },
      { title: "الذكاء الاصطناعي والمعرفة", text: "مساعدة عملية وإجابات موثوقة من معرفة الأعمال المعتمدة." },
      { title: "Business360", text: "رؤية منظمة للأداء والفرص والأولويات." },
      { title: "التحول", text: "وضوح ودعم للتغيير المعقد في الأعمال." },
      { title: "الحوكمة والجاهزية", text: "ضوابط واضحة واستعداد لمتطلبات المشتريات الصارمة." },
      { title: "الإيرادات والعمليات", text: "ربط اكتساب العملاء والتنفيذ والدفع بفاعلية أكبر." },
    ],
  },
  fr: {
    eyebrow: "INTELLIGENCE D’ENTREPRISE CONNECTÉE",
    platformTitle: "Un noyau intelligent pour chaque relation client.",
    platformSub: "Canaux, contexte client, collaboration et assistance IA, réunis clairement au même endroit.",
    platformLink: "Découvrir la plateforme",
    servicesEyebrow: "SERVICES OMNIQORA",
    servicesTitle: "Au-delà de la communication.",
    servicesSub: "Des capacités ciblées pour de meilleures décisions, des opérations solides et un progrès durable.",
    serviceLink: "Discuter de vos besoins",
    waysTitle: "Travaillez avec nous à votre façon.",
    waysSub: "Commencez par une capacité ciblée ou réunissez-en plusieurs dans une solution coordonnée.",
    ways: [
      { title: "Plateforme", text: "Communication omnicanale, IA et collaboration sous forme de service évolutif." },
      { title: "Extensions", text: "Complétez votre environnement avec des capacités OmniQora ciblées." },
      { title: "Livraison gérée", text: "Un accompagnement pour les besoins métier plus larges ou complexes." },
    ],
    previewTitle: "Une vision claire de l’essentiel.",
    previewSub: "Conçue pour ordinateur et mobile, avec un contexte cohérent pour vos équipes.",
    services: [
      { title: "Connect & Voice", text: "Communication client et disponibilité professionnelle sur les canaux pertinents." },
      { title: "IA & Connaissance", text: "Assistance pratique et réponses fondées sur les connaissances approuvées." },
      { title: "Business360", text: "Une vue structurée des performances, opportunités et priorités." },
      { title: "Transformation", text: "Clarté et accompagnement pour les changements complexes." },
      { title: "Gouvernance & Préparation", text: "Contrôles visibles et préparation aux exigences d’achat complexes." },
      { title: "Revenus & Opérations", text: "Mieux relier acquisition client, livraison et paiement." },
    ],
  },
};

const serviceIcons = [MessagesSquare, BrainCircuit, ChartNoAxesCombined, Network, ShieldCheck, Building2];

function UnifiedHome() {
  const { dir, transitioning, lang } = usePromo();
  return (
    <div dir={dir} className="dark min-h-screen bg-background text-foreground transition-opacity duration-200" style={{ opacity: transitioning ? 0.45 : 1 }}>
      <PromoHeader />
      <main>
        <Hero />
        <Platform />
        <Services lang={lang} />
        <Capabilities lang={lang} />
        <ProductPreview lang={lang} />

        <WaysToWork lang={lang} />
        <PricingSection lang={lang} onCta={() => scrollToSection("access")} />
        <Faq />
        <AccessSection />
      </main>
      <PromoFooter />
      <PromoBottomNav />
    </div>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Hero() {
  const { c, lang } = usePromo();
  const copy = mergedCopy[lang];
  return (
    <section id="top" className="relative overflow-hidden border-b border-border/70">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="relative mx-auto grid min-h-[680px] max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:py-24">
        <div className="max-w-3xl">
          <p className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-primary">
            <span className="h-2 w-2 rounded-full bg-accent" />{copy.eyebrow}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.04] text-foreground sm:text-6xl lg:text-7xl">
            {c.hero.titleA}
            <span className="block text-sidebar-primary">{c.hero.titleB}</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{c.hero.sub}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => scrollToSection("access")} className="h-12 rounded-lg bg-primary px-6 shadow-glow hover:bg-primary/90">
              {c.hero.ctaPrimary}<ArrowRight />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("services")} className="h-12 rounded-lg border-border bg-surface/50 px-6 hover:bg-surface-2">
              {copy.servicesTitle}
            </Button>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3">
            {c.hero.trust.map((item) => <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-4 w-4 text-accent" />{item}</li>)}
          </ul>
        </div>
        <div className="relative lg:translate-y-8">
          <div className="absolute inset-8 bg-primary/20 blur-3xl" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/70 p-4 shadow-premium backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
              <span className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-destructive/70" /><i className="h-2.5 w-2.5 rounded-full bg-warning/70" /><i className="h-2.5 w-2.5 rounded-full bg-success/70" /></span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">OmniQora One</span>
            </div>
            <WebAppMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function Platform() {
  const { c, lang } = usePromo();
  const copy = mergedCopy[lang];
  const cards = c.features.items.slice(0, 4);
  return (
    <section id="platform" className="scroll-mt-24 border-b border-border py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{c.nav.features}</p><h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{copy.platformTitle}</h2></div>
          <div className="lg:pb-1"><p className="max-w-2xl text-base leading-7 text-muted-foreground">{copy.platformSub}</p><button type="button" onClick={() => scrollToSection("screens")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sidebar-primary hover:text-accent">{copy.platformLink}<ArrowRight className="h-4 w-4" /></button></div>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, index) => {
            const Icon = [MessagesSquare, Sparkles, AudioLines, ShieldCheck][index] ?? Sparkles;
            return <article key={card.title} className={`group border border-border bg-surface/55 p-6 transition hover:-translate-y-1 hover:border-primary/60 ${index === 0 ? "md:col-span-2" : ""}`}><span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sidebar-primary"><Icon className="h-5 w-5" /></span><h3 className="mt-6 text-xl font-semibold">{card.title}</h3><p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{card.desc}</p></article>;
          })}
        </div>
      </div>
    </section>
  );
}

function Services({ lang }: { lang: PromoLang }) {
  const copy = mergedCopy[lang];
  return (
    <section id="services" className="scroll-mt-24 bg-surface-2 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{copy.servicesEyebrow}</p><h2 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{copy.servicesTitle}</h2><p className="mt-5 text-base leading-7 text-muted-foreground">{copy.servicesSub}</p></div>
        <div className="mt-12 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {copy.services.map((service, index) => { const Icon = serviceIcons[index] ?? Sparkles; return <article key={service.title} className="group bg-background p-7 transition hover:bg-surface"><div className="flex items-start justify-between"><Icon className="h-6 w-6 text-sidebar-primary" /><span className="text-xs text-muted-foreground">0{index + 1}</span></div><h3 className="mt-10 text-xl font-semibold">{service.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{service.text}</p></article>; })}
        </div>
        <Button onClick={() => scrollToSection("access")} className="mt-8 rounded-lg">{copy.serviceLink}<ArrowRight /></Button>
      </div>
    </section>
  );
}

function ProductPreview({ lang }: { lang: PromoLang }) {
  const copy = mergedCopy[lang];
  return (
    <section id="screens" className="scroll-mt-24 border-y border-border py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1fr_1.6fr] lg:items-center">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">OMNIQORA ONE</p><h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{copy.previewTitle}</h2><p className="mt-5 text-base leading-7 text-muted-foreground">{copy.previewSub}</p><div className="mt-9 hidden lg:block"><MobileAppMockup /></div></div>
        <WebAppMockup />
      </div>
    </section>
  );
}

function WaysToWork({ lang }: { lang: PromoLang }) {
  const copy = mergedCopy[lang];
  return <section id="solutions" className="scroll-mt-24 bg-surface-2 py-20 sm:py-28"><div className="mx-auto max-w-7xl px-6"><div className="grid gap-8 lg:grid-cols-2"><h2 className="font-display text-4xl font-semibold sm:text-5xl">{copy.waysTitle}</h2><p className="text-base leading-7 text-muted-foreground">{copy.waysSub}</p></div><div className="mt-12 grid gap-8 md:grid-cols-3">{copy.ways.map((way, index) => <article key={way.title} className="border-t-2 border-primary pt-6"><span className="text-xs text-sidebar-primary">0{index + 1}</span><h3 className="mt-5 text-2xl font-semibold">{way.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{way.text}</p></article>)}</div></div></section>;
}

function Faq() {
  const { c } = usePromo();
  const [open, setOpen] = useState<number | null>(0);
  return <section id="faq" className="scroll-mt-24 border-y border-border py-20 sm:py-28"><div className="mx-auto max-w-4xl px-6"><h2 className="font-display text-4xl font-semibold sm:text-5xl">{c.faq.title}</h2><p className="mt-4 text-muted-foreground">{c.faq.sub}</p><div className="mt-10 divide-y divide-border border-y border-border">{c.faq.items.map((item, index) => { const expanded = open === index; return <div key={item.q}><button type="button" onClick={() => setOpen(expanded ? null : index)} className="flex w-full items-center justify-between gap-6 py-6 text-start" aria-expanded={expanded}><span className="font-semibold">{item.q}</span><ChevronDown className={`h-5 w-5 shrink-0 text-sidebar-primary transition ${expanded ? "rotate-180" : ""}`} /></button>{expanded && <p className="max-w-3xl pb-6 text-sm leading-7 text-muted-foreground">{item.a}</p>}</div>; })}</div></div></section>;
}

function AccessSection() {
  const { c } = usePromo();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  return <section id="access" className="scroll-mt-24 bg-primary py-20 sm:py-24"><div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">OMNIQORA</p><h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold text-primary-foreground sm:text-5xl">{c.cta.title}</h2><p className="mt-5 max-w-xl leading-7 text-primary-foreground/75">{c.cta.sub}</p><Button asChild variant="secondary" size="lg" className="mt-8 h-12 rounded-lg"><a href="mailto:hallo@omniqora.com?subject=OmniQora%20enquiry">{c.cta.button}<ArrowRight /></a></Button></div><form onSubmit={(event) => { event.preventDefault(); if (unlockSite(value)) { setError(false); navigate({ to: "/platform" }); } else setError(true); }} className="border border-primary-foreground/20 bg-background/10 p-6 backdrop-blur"><div className="flex items-center gap-2 text-sm font-semibold text-primary-foreground"><KeyRound className="h-4 w-4" />{c.gate.title}</div><p className="mt-3 text-sm leading-6 text-primary-foreground/70">{c.gate.sub}</p><input type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder={c.gate.placeholder} className="mt-5 h-12 w-full rounded-md border border-primary-foreground/25 bg-background px-4 text-sm text-foreground outline-none focus:border-accent" />{error && <p className="mt-2 text-xs font-medium text-warning">{c.gate.error}</p>}<Button type="submit" variant="secondary" className="mt-3 h-11 w-full rounded-md">{c.gate.submit}</Button></form></div></section>;
}