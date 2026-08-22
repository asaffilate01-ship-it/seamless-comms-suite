import { PromoFooter, PromoHeader } from "@/components/promo/promo-chrome";
import { usePromo } from "@/lib/promo-lang";
import { legalContent } from "@/lib/legal-content";

export function LegalPage({ doc }: { doc: "imprint" | "privacy" | "terms" }) {
  const { lang, dir } = usePromo();
  const pack = legalContent[lang] ?? legalContent.de;
  const d = pack[doc];
  return (
    <div dir={dir} className="min-h-screen bg-background">
      <PromoHeader />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-foreground">{d.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{d.subtitle}</p>
        <div className="mt-8 space-y-7">
          {d.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-base font-semibold text-foreground">{s.h}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          {d.note}
        </p>
      </article>
      <PromoFooter />
    </div>
  );
}
