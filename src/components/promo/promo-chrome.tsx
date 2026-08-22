import { Link } from "@tanstack/react-router";
import { Home, Sparkles, MonitorSmartphone, HelpCircle, KeyRound, Menu, X, Tag } from "lucide-react";
import { useState } from "react";
import logoAsset from "@/assets/omniqora-logo.png.asset.json";
import { usePromo, PromoLanguageSelect } from "@/lib/promo-lang";
import { useCookieConsent } from "@/lib/cookie-consent";
import { pricingContent } from "@/lib/pricing-content";

const sections = [
  { id: "top", key: "home", icon: Home },
  { id: "features", key: "features", icon: Sparkles },
  { id: "screens", key: "screens", icon: MonitorSmartphone },
  { id: "pricing", key: "pricing", icon: Tag },
  { id: "faq", key: "faq", icon: HelpCircle },
  { id: "access", key: "access", icon: KeyRound },
] as const;

/** Five slots only, so the mobile bar stays native-feeling. */
const bottomSections = sections.filter((s) => s.key !== "screens");

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
    features: c.nav.features,
    screens: c.nav.screens,
    pricing: pricingContent[lang].nav,
    faq: c.nav.faq,
    access: c.nav.access,
  };
  const desktopNav = [
    { id: "features", label: c.nav.features },
    { id: "screens", label: c.nav.screens },
    { id: "editions", label: c.nav.editions },
    { id: "pricing", label: pricingContent[lang].nav },
    { id: "faq", label: c.nav.faq },
  ];
  return (
    <header
      dir={dir}
      className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link to="/" className="flex items-center" onClick={() => scrollTo("top")}>
          <img src={logoAsset.url} alt="OmniQora" className="h-24 w-auto object-contain" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {desktopNav.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
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
            className="hidden items-center rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 sm:inline-flex"
          >
            {c.nav.access}
          </button>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-card px-5 py-4 lg:hidden">
          <div className="grid gap-1">
            {sections.slice(1).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  scrollTo(s.id);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-muted"
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
    features: c.nav.features,
    screens: c.nav.screens,
    pricing: pricingContent[lang].nav,
    faq: c.nav.faq,
    access: c.nav.access,
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
  const { c, dir } = usePromo();
  const { openSettings } = useCookieConsent();
  return (
    <footer dir={dir} className="border-t border-border/60 bg-surface-2 pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-3">
        <div>
          <img src={logoAsset.url} alt="OmniQora" className="h-16 w-auto object-contain" />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">{c.hero.titleA} {c.hero.titleB}</p>
          <p className="mt-3 max-w-xs text-xs text-muted-foreground">{c.footer.trading}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">{c.footer.legal}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/impressum" className="hover:text-foreground">Impressum</Link></li>
            <li><Link to="/datenschutz" className="hover:text-foreground">Datenschutz / Privacy</Link></li>
            <li><Link to="/agb" className="hover:text-foreground">AGB / Terms</Link></li>
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
            <li>EU</li>
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
