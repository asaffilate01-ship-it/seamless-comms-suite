import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Cookie, ShieldCheck, BarChart3, Megaphone, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePromo } from "./promo-lang";

const STORAGE_KEY = "konnevia.cookieConsent.v1";

export type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  ts: string;
};

type Ctx = {
  consent: Consent | null;
  save: (c: { analytics: boolean; marketing: boolean }) => void;
  reset: () => void;
  openSettings: () => void;
};

const CookieContext = createContext<Ctx | null>(null);

export function useCookieConsent() {
  const ctx = useContext(CookieContext);
  if (!ctx) throw new Error("useCookieConsent must be used within CookieConsentProvider");
  return ctx;
}

/** Read consent synchronously (for scripts / conditional loading). */
export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setHydrated(true);
  }, []);

  const save = useCallback((c: { analytics: boolean; marketing: boolean }) => {
    const next: Consent = { necessary: true, ...c, ts: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setConsent(next);
    setShowPanel(false);
    // Wire-up point: optional scripts are only ever loaded from here.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("konnevia:consent", { detail: next }));
      document.documentElement.dataset["consentAnalytics"] = String(next.analytics);
      document.documentElement.dataset["consentMarketing"] = String(next.marketing);
    }
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConsent(null);
    setShowPanel(false);
  }, []);

  const openSettings = useCallback(() => setShowPanel(true), []);

  const value = useMemo(() => ({ consent, save, reset, openSettings }), [consent, save, reset, openSettings]);

  return (
    <CookieContext.Provider value={value}>
      {children}
      {hydrated && (!consent || showPanel) && (
        <CookieBanner
          detailed={showPanel}
          existing={consent}
          onSave={save}
          onOpenDetails={() => setShowPanel(true)}
          onClose={consent ? () => setShowPanel(false) : undefined}
        />
      )}
    </CookieContext.Provider>
  );
}

function CookieBanner({
  detailed,
  existing,
  onSave,
  onOpenDetails,
  onClose,
}: {
  detailed: boolean;
  existing: Consent | null;
  onSave: (c: { analytics: boolean; marketing: boolean }) => void;
  onOpenDetails: () => void;
  onClose?: () => void;
}) {
  const { c, dir } = usePromo();
  const [analytics, setAnalytics] = useState(existing?.analytics ?? false);
  const [marketing, setMarketing] = useState(existing?.marketing ?? false);

  return (
    <div
      dir={dir}
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-6 sm:pb-6"
      role="dialog"
      aria-label={c.cookies.title}
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-premium backdrop-blur-xl">
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Cookie className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{c.cookies.title}</h3>
              {onClose && (
                <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.cookies.body}</p>

            {detailed && (
              <div className="mt-4 space-y-2">
                <ConsentRow
                  icon={ShieldCheck}
                  title={c.cookies.necessary}
                  desc={c.cookies.necessaryDesc}
                  checked
                  disabled
                />
                <ConsentRow
                  icon={BarChart3}
                  title={c.cookies.analytics}
                  desc={c.cookies.analyticsDesc}
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <ConsentRow
                  icon={Megaphone}
                  title={c.cookies.marketing}
                  desc={c.cookies.marketingDesc}
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSave({ analytics: true, marketing: true })}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                {c.cookies.acceptAll}
              </button>
              {detailed ? (
                <button
                  type="button"
                  onClick={() => onSave({ analytics, marketing })}
                  className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
                >
                  {c.cookies.save}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenDetails}
                  className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
                >
                  {c.cookies.settings}
                </button>
              )}
              <button
                type="button"
                onClick={() => onSave({ analytics: false, marketing: false })}
                className="inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                {c.cookies.essentialOnly}
              </button>
              <Link to="/cookies" className="ms-auto text-xs font-medium text-primary underline-offset-4 hover:underline">
                {c.cookies.policy}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsentRow({
  icon: Icon,
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof ShieldCheck;
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-xl border border-border/70 bg-surface-2/60 p-3",
        disabled ? "opacity-80" : "cursor-pointer hover:border-primary/40",
      ].join(" ")}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--primary)]"
      />
    </label>
  );
}
