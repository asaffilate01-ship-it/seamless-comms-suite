import { Search, Sparkles, Send, Paperclip, ShieldCheck, Bell, Circle } from "lucide-react";
import { usePromo } from "@/lib/promo-lang";
import logoAsset from "@/assets/omniqora-logo.png.asset.json";

/** Live, translated "screenshot" of the web platform. Text follows the selected language. */
export function WebAppMockup() {
  const { c, dir } = usePromo();
  return (
    <div
      dir={dir}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-premium"
    >
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-border/70 bg-surface-2 px-4 py-2.5">
        <span className="flex gap-1.5">
          <Circle className="h-2.5 w-2.5 fill-destructive/60 text-destructive/60" />
          <Circle className="h-2.5 w-2.5 fill-warning/70 text-warning/70" />
          <Circle className="h-2.5 w-2.5 fill-success/70 text-success/70" />
        </span>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-background px-3 py-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-primary" />
          app.omniqora.de
        </div>
      </div>

      <div className="grid min-h-[340px] grid-cols-[112px_1fr] sm:grid-cols-[150px_1.1fr_1fr]">
        {/* sidebar */}
        <aside className="border-e border-sidebar-border bg-sidebar p-3">
          <img src={logoAsset.url} alt="OmniQora" className="h-5 w-auto brightness-0 invert" />
          <div className="mt-4 space-y-1">
            {c.mock.tabs.map((tab, i) => (
              <div
                key={tab}
                className={[
                  "truncate rounded-md px-2 py-1.5 text-[10px]",
                  i === 1
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70",
                ].join(" ")}
              >
                {tab}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 rounded-lg bg-sidebar-accent/40 p-2">
            {c.mock.kpis.map((k) => (
              <div key={k.label}>
                <div className="font-display text-xs text-sidebar-primary">{k.value}</div>
                <div className="truncate text-[9px] text-sidebar-foreground/60">{k.label}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* conversation list */}
        <section className="hidden border-e border-border/70 sm:block">
          <div className="border-b border-border/70 p-3">
            <div className="mb-2 text-[11px] font-semibold text-foreground">{c.mock.inbox}</div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[10px] text-muted-foreground">
              <Search className="h-3 w-3" />
              {c.mock.search}
            </div>
          </div>
          <ul>
            {c.mock.conversations.map((conv, i) => (
              <li
                key={conv.name}
                className={[
                  "flex gap-2 border-b border-border/60 p-3",
                  i === 0 ? "bg-primary-soft/50" : "",
                ].join(" ")}
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                  {conv.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[10px] font-semibold text-foreground">{conv.name}</span>
                    <span className="shrink-0 text-[9px] text-muted-foreground">{conv.time}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{conv.preview}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* thread + case */}
        <section className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[10px] font-semibold text-foreground">{c.mock.caseTitle}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success">
                {c.mock.caseStatus}
              </div>
            </div>
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <div className="flex-1 space-y-2 bg-surface-2/60 p-3">
            {c.mock.messages.map((m, i) => (
              <div key={i} className={m.out ? "flex justify-end" : "flex justify-start"}>
                <span
                  className={[
                    "max-w-[85%] rounded-2xl px-3 py-1.5 text-[10px] leading-relaxed shadow-sm",
                    m.out
                      ? "rounded-ee-sm bg-primary text-primary-foreground"
                      : "rounded-es-sm bg-card text-foreground",
                  ].join(" ")}
                >
                  {m.text}
                </span>
              </div>
            ))}
            <div className="rounded-xl border border-primary/25 bg-primary-soft/60 p-2.5">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                {c.mock.aiLabel}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-foreground/80">{c.mock.aiSuggestion}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border/70 p-2.5">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex-1 truncate rounded-full border border-border bg-background px-3 py-1.5 text-[10px] text-muted-foreground">
              {c.mock.inputPlaceholder}
            </div>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Send className="h-3 w-3" />
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Live, translated "screenshot" of the mobile app inside a phone frame. */
export function MobileAppMockup() {
  const { c, dir } = usePromo();
  return (
    <div
      dir={dir}
      className="mx-auto w-[248px] rounded-[2.2rem] border-[7px] border-foreground/85 bg-card shadow-premium"
    >
      <div className="relative overflow-hidden rounded-[1.7rem]">
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
          <span className="mt-1.5 h-1 w-14 rounded-full bg-foreground/70" />
        </div>

        <div className="bg-gradient-to-b from-primary to-primary/85 px-4 pb-4 pt-6 text-primary-foreground">
          <img src={logoAsset.url} alt="OmniQora" className="h-4 w-auto brightness-0 invert" />
          <div className="mt-3 text-[11px] font-semibold">{c.mock.inbox}</div>
          <div className="mt-2 flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1.5 text-[9px]">
            <Search className="h-3 w-3" />
            {c.mock.search}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 px-3 py-2.5">
          {c.mock.kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-border/70 bg-surface-2 p-1.5 text-center">
              <div className="font-display text-[11px] text-foreground">{k.value}</div>
              <div className="truncate text-[8px] text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>

        <ul className="px-3">
          {c.mock.conversations.map((conv, i) => (
            <li key={conv.name} className="flex gap-2 border-b border-border/60 py-2.5 last:border-0">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                {conv.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold text-foreground">{conv.name}</span>
                  <span className="shrink-0 text-[8px] text-muted-foreground">{conv.time}</span>
                </span>
                <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{conv.preview}</span>
              </span>
              {i === 0 && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </li>
          ))}
        </ul>

        <div className="mx-3 mb-2 mt-2 rounded-xl border border-primary/25 bg-primary-soft/60 p-2">
          <div className="flex items-center gap-1 text-[8px] font-semibold text-primary">
            <Sparkles className="h-2.5 w-2.5" />
            {c.mock.aiLabel}
          </div>
          <p className="mt-0.5 text-[9px] leading-relaxed text-foreground/80">{c.mock.aiSuggestion}</p>
        </div>

        {/* native-style bottom tab bar */}
        <div className="grid grid-cols-5 border-t border-border/70 bg-card/95 px-1 pb-2 pt-1.5">
          {c.mock.tabs.map((tab, i) => (
            <div
              key={tab}
              className={[
                "flex flex-col items-center gap-0.5 truncate text-[7.5px]",
                i === 1 ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  i === 1 ? "bg-primary" : "bg-muted-foreground/40",
                ].join(" ")}
              />
              <span className="w-full truncate text-center">{tab}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
