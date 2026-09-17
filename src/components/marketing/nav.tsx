import { Link } from "@tanstack/react-router";
import { OmniqoraLogo } from "@/components/brand/omniqora-logo";
import { LanguageToggle, useT } from "@/lib/i18n";

export function MarketingNav() {
  const t = useT();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <OmniqoraLogo slogan={t("footer.tagline")} size="md" />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link to="/features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t("nav.product")}</Link>
          <Link to="/workflow-packs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t("nav.packs")}</Link>
          <Link to="/pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t("nav.pricing")}</Link>
          <Link to="/compliance" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t("nav.compliance")}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link to="/auth" className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline">{t("nav.signIn")}</Link>
          <Link to="/app" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
            {t("nav.openDemo")}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const t = useT();
  return (
    <footer className="border-t border-border/60 bg-surface-2">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
        <div>
          <div className="flex h-16 items-center gap-2">
            <OmniqoraLogo slogan={t("footer.tagline")} size="lg" />
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold">{t("footer.product")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/features" className="hover:text-foreground">{t("footer.features")}</Link></li>
            <li><Link to="/workflow-packs" className="hover:text-foreground">{t("footer.packs")}</Link></li>
            <li><Link to="/pricing" className="hover:text-foreground">{t("footer.pricing")}</Link></li>
            <li><Link to="/app" className="hover:text-foreground">{t("footer.liveDemo")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">{t("footer.trust")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/compliance" className="hover:text-foreground">{t("footer.gdpr")}</Link></li>
            <li><span className="hover:text-foreground">{t("footer.security")}</span></li>
            <li><span className="hover:text-foreground">{t("footer.dpa")}</span></li>
            <li><span className="hover:text-foreground">{t("footer.subprocessors")}</span></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">{t("footer.company")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>iTechLounge Ltd · UK</li>
            <li>iTechLounge GmbH · Deutschland</li>
            <li><a href="mailto:hallo@omniqora.com" className="hover:text-foreground">hallo@omniqora.com</a></li>
            <li><Link to="/impressum" className="hover:text-foreground">Impressum</Link></li>
            <li><Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link></li>
            <li><Link to="/agb" className="hover:text-foreground">AGB</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-6 py-5 text-xs text-muted-foreground md:flex-row md:items-center">
          <span>{t("footer.madeIn")}</span>
          <span>{t("footer.metaLine")}</span>
        </div>
      </div>
    </footer>
  );
}
