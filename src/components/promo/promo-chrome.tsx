import { Link } from "@tanstack/react-router";
import { Home, Sparkles, MonitorSmartphone, HelpCircle, KeyRound, Menu, X, Tag, Layers3 } from "lucide-react";
import { useState } from "react";
import { OmniqoraLogo } from "@/components/brand/omniqora-logo";
import { usePromo, PromoLanguageSelect } from "@/lib/promo-lang";
import { useCookieConsent } from "@/lib/cookie-consent";
import { pricingContent } from "@/lib/pricing-content";
import { legalContent } from "@/lib/legal-content";

const sections = [
  { id: "top", key: "home", icon: Home },
  { id: "platform", key: "features", icon: Sparkles },
  { id: "services", key: "services", icon: Layers3 },
  { id: "screens", key: "screens", icon: MonitorSmartphone },
  { id: "pricing", key: "pricing", icon: Tag },
  { id: "faq", key: "faq", icon: HelpCircle },
  { id: "access", key: "access", icon: KeyRound },
] as const;

/** Five slots only, so the mobile bar stays native-feeling. */
const bottomSections = sections.filter((s) => ["home", "features", "services", "pricing", "access"].includes(s.key));

function scrollTo(id: string) {
  if (typeof document === "undefined") return;
  const el = id === "top" ? document.body : document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: id === "top" ? "start" : "start" });
}

export function PromoHeader() {
  const { c, dir, lang } = usePromo();
  const [open, setOpen] = useState(false);
  const labels: Record<string, string> = {
    home: "OmniQora",
    features: {en:"Platform",de:"Plattform",tr:"Platform",ar:"المنصة",fr:"Plateforme"}[lang],
    services: {en:"Services",de:"Leistungen",tr:"Hizmetler",ar:"الخدمات",fr:"Services"}[lang],
    screens: c.nav.screens,
    pricing: pricingContent[lang].nav,
    faq: c.nav.faq,
    access: {en:"Contact",de:"Kontakt",tr:"İletişim",ar:"تواصل",fr:"Contact"}[lang],
  };
  const solutionLabel = {en:"Solutions",de:"Lösungen",tr:"Çözümler",ar:"الحلول",fr:"Solutions"}[lang];
  const desktopNav = [
    { id: "platform", label: labels.features },
    { id: "services", label: labels.services },
    { id: "solutions", label: solutionLabel },
    { id: "pricing", label: pricingContent[lang].nav },
    { id: "faq", label: c.nav.faq },
  ];
  return (
    <header
      dir={dir}
      className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link to="/" className="flex items-center" onClick={() => scrollTo("top")}>
          <OmniqoraLogo slogan={`${c.hero.titleA} ${c.hero.titleB}`} size="md" />
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {desktopNav.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <PromoLanguageSelect />
          </div>
          <button
            type="button"
            onClick={() => scrollTo("access")}
             className="hidden items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:bg-primary/90 sm:inline-flex"
          >
             {labels.access}
          </button>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
             className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-5 py-4 lg:hidden">
          <div className="grid gap-1">
            {sections.slice(1).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  scrollTo(s.id);
                }}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-surface-2"
              >
                <s.icon className="h-4 w-4 text-primary" />
                {labels[s.key]}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <PromoLanguageSelect />
          </div>
        </div>
      )}
    </header>
  );
}

/** Native-app style bottom navigation for mobile. */
export function PromoBottomNav() {
  const { c, dir, lang } = usePromo();
  const labels: Record<string, string> = {
    home: "Start",
    features: {en:"Platform",de:"Plattform",tr:"Platform",ar:"المنصة",fr:"Plateforme"}[lang],
    services: {en:"Services",de:"Leistungen",tr:"Hizmetler",ar:"الخدمات",fr:"Services"}[lang],
    screens: c.nav.screens,
    pricing: pricingContent[lang].nav,
    faq: c.nav.faq,
    access: {en:"Contact",de:"Kontakt",tr:"İletişim",ar:"تواصل",fr:"Contact"}[lang],
  };
  return (
    <nav
      dir={dir}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      aria-label="Sections"
    >
      <div className="grid grid-cols-5">
        {bottomSections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className="flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors active:text-primary"
          >
            <s.icon className="h-[18px] w-[18px]" />
            <span className="w-full truncate text-center">{labels[s.key]}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function PromoFooter() {
  const { c, dir, lang } = usePromo();
  const legal = legalContent[lang] ?? legalContent.de;
  const { openSettings } = useCookieConsent();
  return (
    <footer dir={dir} className="border-t border-border/60 bg-surface-2 pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-3">
        <div>
          <OmniqoraLogo slogan={`${c.hero.titleA} ${c.hero.titleB}`} size="lg" />
          <p className="mt-3 max-w-xs text-xs text-muted-foreground">{c.footer.trading}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">{c.footer.legal}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/impressum" className="hover:text-foreground">{legal.imprint.title}</Link></li>
            <li><Link to="/datenschutz" className="hover:text-foreground">{legal.privacy.title}</Link></li>
            <li><Link to="/agb" className="hover:text-foreground">{legal.terms.title}</Link></li>
            <li><Link to="/cookies" className="hover:text-foreground">{c.cookies.policy}</Link></li>
            <li>
              <button type="button" onClick={openSettings} className="hover:text-foreground">
                {c.footer.cookieSettings}
              </button>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">{c.footer.contact}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>iTechLounge Ltd · United Kingdom</li>
            <li>iTechLounge GmbH · Deutschland</li>
            <li><a href="mailto:hallo@omniqora.com" className="hover:text-foreground">hallo@omniqora.com</a></li>
          </ul>
          <div className="mt-4">
            <PromoLanguageSelect compact />
          </div>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 iTechLounge Ltd &amp; iTechLounge GmbH · {c.footer.rights}</span>
          <span>Omnichannel-Plattform · EU &amp; UK · International service</span>
        </div>
      </div>
    </footer>
  );
}
