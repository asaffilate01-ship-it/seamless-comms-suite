import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { translations, type Lang } from "./translations";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  transitioning: boolean;
};

const I18nContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "lc.lang";

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

export function I18nProvider({ children }: { children: ReactNode }) {
  // Default to German. Read persisted on mount (avoid SSR mismatch).
  const [lang, setLangState] = useState<Lang>("de");
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved === "de" || saved === "en") {
        if (saved !== lang) setLangState(saved);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

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
      <button type="button" onClick={() => setLang("de")} className={btn(lang === "de")}>
        DE
      </button>
      <button type="button" onClick={() => setLang("en")} className={btn(lang === "en")}>
        EN
      </button>
    </div>
  );
}
