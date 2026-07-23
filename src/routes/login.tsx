import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MarketingNav } from "@/components/marketing/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FormEvent } from "react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — LoungeConnect" },
      { name: "description", content: "Sign in to your LoungeConnect tenant." },
      { property: "og:title", content: "Sign in — LoungeConnect" },
      { property: "og:description", content: "Sign in to your LoungeConnect tenant." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const submit = (e: FormEvent) => { e.preventDefault(); navigate({ to: "/app" }); };
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto flex max-w-md flex-col items-center px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your LoungeConnect tenant.</p>
        <Card className="mt-8 w-full border-border">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" placeholder="you@company.de" defaultValue="lea@studio-muc.de" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" defaultValue="demo-only" className="mt-1" />
              </div>
              <Button type="submit" className="w-full">Sign in</Button>
              <p className="text-center text-xs text-muted-foreground">
                Demo mode — any credentials open the app.
              </p>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-sm text-muted-foreground">
          No tenant yet? <Link to="/pricing" className="text-primary hover:underline">See pricing</Link>
        </p>
      </section>
    </div>
  );
}
