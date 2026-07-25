import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MarketingNav } from "@/components/marketing/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FormEvent } from "react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Konnevia" },
      { name: "description", content: "Sign in to your Konnevia tenant." },
      { property: "og:title", content: "Sign in — Konnevia" },
      { property: "og:description", content: "Sign in to your Konnevia tenant." },
    ],
  }),
  component: Login,
});

function Login() {
  const t = useT();
  const navigate = useNavigate();
  const submit = (e: FormEvent) => { e.preventDefault(); navigate({ to: "/app" }); };
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto flex max-w-md flex-col items-center px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("login.sub")}</p>
        <Card className="mt-8 w-full border-border">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t("login.email")}</Label>
                <Input id="email" type="email" placeholder="you@company.de" defaultValue="lea@studio-muc.de" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input id="password" type="password" defaultValue="demo-only" className="mt-1" />
              </div>
              <Button type="submit" className="w-full">{t("login.cta")}</Button>
              <p className="text-center text-xs text-muted-foreground">
                {t("login.demo")}
              </p>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-sm text-muted-foreground">
          {t("login.noTenant")} <Link to="/pricing" className="text-primary hover:underline">{t("login.seePricing")}</Link>
        </p>
      </section>
    </div>
  );
}
