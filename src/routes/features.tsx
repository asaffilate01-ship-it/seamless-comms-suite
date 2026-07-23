import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "@/components/marketing/nav";
import { Badge } from "@/components/ui/badge";
import {
  Inbox, Workflow, Users2, ShieldCheck, Sparkles, CreditCard, Calendar, FileSignature,
  Handshake, LineChart, Bell, Lock, GitBranch, Globe, Building2,
} from "lucide-react";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Product — LoungeConnect" },
      { name: "description", content: "Cases, workflows, consent, partners, AI controls, portal links, analytics — every capability of the LoungeConnect platform." },
      { property: "og:title", content: "Product — LoungeConnect" },
      { property: "og:description", content: "The end-to-end platform behind the LoungeConnect WhatsApp workflow engine." },
    ],
  }),
  component: Features,
});

const groups = [
  {
    title: "Operations",
    items: [
      { icon: Inbox, name: "Unified inbox", desc: "One thread for AI, staff, manager and partner — with role-aware lenses and side panels." },
      { icon: Workflow, name: "Case timeline", desc: "State machine with owner, SLA, next-best-action, decisions and history exposed." },
      { icon: Calendar, name: "Schedules & appointments", desc: "Slot suggestions, confirmations, reminders, no-show recovery, calendar sync." },
      { icon: Bell, name: "SLAs & escalations", desc: "Per-purpose targets with warning tiers, escalation paths and quiet-hour policies." },
    ],
  },
  {
    title: "Automation & AI",
    items: [
      { icon: Sparkles, name: "AI drafting & triage", desc: "Draft replies, capture data, classify intents. Never sends high-impact messages without a human." },
      { icon: GitBranch, name: "Workflow builder", desc: "Reusable steps with AI, staff, customer, manager and partner owners. Versioned & reviewed." },
      { icon: FileSignature, name: "Template governance", desc: "Meta-approved templates, versions, sign-off, roll-back. No ad-hoc marketing sends." },
    ],
  },
  {
    title: "Commerce",
    items: [
      { icon: CreditCard, name: "Quotes & payments", desc: "Draft → approve → send → collect → reconcile with idempotent ledgers." },
      { icon: Handshake, name: "Third-party fulfilment", desc: "Invite legal-entity partners, scope data, track SLA and pay out commissions." },
      { icon: LineChart, name: "Revenue attribution", desc: "See revenue per workflow, per template, per campaign and per partner." },
    ],
  },
  {
    title: "Governance",
    items: [
      { icon: Users2, name: "Roles & approvals", desc: "Owner, admin, manager, agent, finance, compliance, partner — with permission groups and dual-control approvals." },
      { icon: Lock, name: "Consent & suppression", desc: "Purpose-scoped consent, frequency caps, opt-out sync, DSGVO subject rights." },
      { icon: ShieldCheck, name: "Audit & DSGVO exports", desc: "Every event, every actor, every retention class. Break-glass with review." },
    ],
  },
  {
    title: "Platform",
    items: [
      { icon: Building2, name: "Multi-tenant model", desc: "Isolated organisations, brands, locations and third parties — permissioned end-to-end." },
      { icon: Globe, name: "White-label", desc: "Brand, domain, from-name, templates, colour tokens — per tenant." },
      { icon: ShieldCheck, name: "German residency", desc: "eu-central-1 hosting, DPA, subprocessor list, DACH support hours." },
    ],
  },
];

function Features() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Product</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold md:text-5xl">A full operating system around WhatsApp.</h1>
          <p className="mt-3 text-muted-foreground">
            LoungeConnect is not a chat inbox. It is a case system, a workflow engine, a governance
            layer and a commerce surface — using WhatsApp as the customer channel.
          </p>
        </div>

        <div className="mt-14 space-y-16">
          {groups.map((g) => (
            <div key={g.title}>
              <h2 className="font-display text-2xl font-semibold">{g.title}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <div key={it.name} className="rounded-2xl border border-border bg-card p-6">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="mt-4 font-semibold">{it.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
