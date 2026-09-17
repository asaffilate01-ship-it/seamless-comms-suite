import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { KeyRound, Lock } from "lucide-react";
import { OmniqoraLogo } from "@/components/brand/omniqora-logo";
import { usePromo, PromoLanguageSelect } from "./promo-lang";

const STORAGE_KEY = "omniqora.site.unlock";
/** Promo-phase access password for the full platform. */
const PASSWORD = "omniqora2026";

/** Routes reachable without the promo password. */
const PUBLIC_PATHS = ["/", "/website", "/impressum", "/datenschutz", "/agb", "/cookies"];

function isPublic(pathname: string) {
  const p = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_PATHS.includes(p) || p.startsWith("/api/");
}

export function unlockSite(password: string) {
  if (password.trim() !== PASSWORD) return false;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
  return true;
}

export function SiteGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");

  useEffect(() => {
    try {
      setState(localStorage.getItem(STORAGE_KEY) === "1" ? "open" : "locked");
    } catch {
      setState("locked");
    }
  }, []);

  if (isPublic(pathname) || state === "open") return <>{children}</>;
  if (state === "checking") return <div className="min-h-screen bg-background" />;
  return <GateScreen onUnlocked={() => setState("open")} />;
}

export function GateScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { c, dir } = usePromo();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  return (
    <div dir={dir} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute -top-32 start-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/90 p-8 shadow-premium backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <OmniqoraLogo slogan={`${c.hero.titleA} ${c.hero.titleB}`} size="sm" />
          <PromoLanguageSelect compact />
        </div>
        <span className="mt-6 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold text-foreground">{c.gate.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.gate.sub}</p>

        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (unlockSite(value)) {
              setError(false);
              onUnlocked();
            } else {
              setError(true);
            }
          }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={c.gate.placeholder}
              className="h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {error && <p className="text-xs font-medium text-destructive">{c.gate.error}</p>}
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95"
          >
            {c.gate.submit}
          </button>
        </form>

        <Link to="/" className="mt-4 block text-center text-xs font-medium text-muted-foreground hover:text-foreground">
          {c.gate.back}
        </Link>
      </div>
    </div>
  );
}
