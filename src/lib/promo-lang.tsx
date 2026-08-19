import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { promoContent, promoLangs, type PromoContent, type PromoLang } from "./promo-content";

const STORAGE_KEY = "konnevia.promo.lang";

type Ctx = {
  lang: PromoLang;
  setLang: (l: PromoLang) => void;
  c: PromoContent;
  dir: "ltr" | "rtl";
  transitioning: boolean;
};

const PromoLangContext = createContext<Ctx | null>(null);

export function PromoLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PromoLang>("de");
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PromoLang | null;
      if (saved && saved in promoContent) setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = useCallback((next: PromoLang) => {
    setLangState((prev) => {
      if (prev === next) return prev;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      setTransitioning(true);
      window.setTimeout(() => setTransitioning(false), 200);
      return next;
    });
  }, []);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  const value = useMemo(
    () => ({ lang, setLang, c: promoContent[lang], dir, transitioning }),
    [lang, setLang, dir, transitioning],
  );

  return <PromoLangContext.Provider value={value}>{children}</PromoLangContext.Provider>;
}

export function usePromo() {
  const ctx = useContext(PromoLangContext);
  if (!ctx) {
    return {
      lang: "de" as PromoLang,
      setLang: () => {},
      c: promoContent.de,
      dir: "ltr" as const,
      transitioning: false,
    };
  }
  return ctx;
}

export function PromoLanguageSelect({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = usePromo();
  return (
    <div
      className={
        compact
          ? "flex items-center gap-0.5 rounded-full border border-border/70 bg-card/70 p-0.5 backdrop-blur"
          : "flex items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1 backdrop-blur"
      }
      role="group"
      aria-label="Language"
    >
      {promoLangs.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            title={l.native}
            aria-pressed={active}
            className={[
              "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
