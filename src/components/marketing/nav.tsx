import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">LoungeConnect</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link to="/features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Product</Link>
          <Link to="/workflow-packs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Workflow packs</Link>
          <Link to="/pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
          <Link to="/compliance" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Compliance</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline">Sign in</Link>
          <Link to="/app" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
            Open demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface-2">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-semibold">LoungeConnect</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            WhatsApp workflow platform for German SMEs, institutions and LoungeTech products.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Product</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/features" className="hover:text-foreground">Features</Link></li>
            <li><Link to="/workflow-packs" className="hover:text-foreground">Workflow packs</Link></li>
            <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
            <li><Link to="/app" className="hover:text-foreground">Live demo</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Trust</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/compliance" className="hover:text-foreground">GDPR & TTDSG</Link></li>
            <li><span className="hover:text-foreground">Security</span></li>
            <li><span className="hover:text-foreground">DPA</span></li>
            <li><span className="hover:text-foreground">Subprocessors</span></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Company</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>LoungeTech Digitallösungen GmbH</li>
            <li>Berlin · München · Frankfurt</li>
            <li>hallo@loungeconnect.de</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-6 py-5 text-xs text-muted-foreground md:flex-row md:items-center">
          <span>© 2026 LoungeTech Digitallösungen GmbH · Made in Germany</span>
          <span>WhatsApp Business Platform · Cloud API · Meta authorised route</span>
        </div>
      </div>
    </footer>
  );
}
