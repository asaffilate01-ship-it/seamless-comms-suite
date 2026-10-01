import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { translations, type Lang } from "./translations";
import { usePromo } from "./promo-lang";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  transitioning: boolean;
};

const I18nContext = createContext<Ctx | null>(null);

function resolve(dict: unknown, key: string): string {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}

/**
 * Dashboard/app language. Derived from the single site-wide language setting
 * (PromoLangProvider) so the homepage and dashboard can never disagree.
 * The app supports DE/EN; any other site language shows English in the app.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const promo = usePromo();
  const lang: Lang = promo.lang === "de" ? "de" : "en";
  const transitioning = promo.transitioning;
  const promoSetLang = promo.setLang;
  const setLang = useCallback((next: Lang) => promoSetLang(next), [promoSetLang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState((prev) => {
        if (prev === next) return prev;
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
        setTransitioning(true);
        window.setTimeout(() => setTransitioning(false), 220);
        return next;
      });
    },
    [],
  );


  const t = useCallback(
    (key: string) => resolve(translations[lang], key),
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, transitioning }),
    [lang, setLang, t, transitioning],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useI18nSafe() {
  return useContext(I18nContext);
}

/** Inline bilingual helper: tx("Deutsch", "English"). */
export function useTx() {
  const lang = useContext(I18nContext)?.lang ?? "en";
  return useCallback((de: string, en: string) => (lang === "de" ? de : en), [lang]);
}

export function useT() {
  return useI18n().t;
}

export function LanguageToggle({
  variant = "default",
}: {
  variant?: "default" | "sidebar";
}) {
  const { lang, setLang } = useI18n();
  const base =
    "inline-flex items-center rounded-md border text-[11px] font-medium overflow-hidden";
  const wrap =
    variant === "sidebar"
      ? `${base} border-sidebar-border bg-sidebar-accent/40`
      : `${base} border-border bg-background`;
  const btn = (active: boolean) =>
    [
      "px-2.5 py-1 transition-colors",
      active
        ? variant === "sidebar"
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "bg-primary text-primary-foreground"
        : variant === "sidebar"
          ? "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
    ].join(" ");
  return (
    <div className={wrap} role="group" aria-label="Language">
{lang === "de" ? <>      <button type="button" onClick={() => setLang("de")} className={btn(true)}>
        DE
      </button>
      <button type="button" onClick={() => setLang("en")} className={btn(false)}>
        EN
      </button>
</> : <>      <button type="button" onClick={() => setLang("en")} className={btn(true)}>
        EN
      </button>
      <button type="button" onClick={() => setLang("de")} className={btn(false)}>
        DE
      </button>
</>}
    </div>
  );
}
