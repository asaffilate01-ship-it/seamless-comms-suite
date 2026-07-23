import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { roleMatrix } from "@/lib/mockData";
import { Bot, ShieldCheck, KeyRound, Phone, Palette } from "lucide-react";

export const Route = createFileRoute("/app/settings")({
  component: Settings,
});

function Settings() {
  return (
    <AppShell
      title="Settings"
      subtitle="Tenant, roles, channel, AI, compliance and branding"
    >
      <Tabs defaultValue="tenant" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="channel">Channel</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
          <TabsTrigger value="ai">AI controls</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="tenant">
          <Card><CardContent className="p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Legal entity" value="Beauty Studio München GmbH" />
              <Field label="USt-IdNr." value="DE 812 345 678" />
              <Field label="Contact email" value="hallo@studio-muc.de" />
              <Field label="Support hours" value="Mo–Fr 09:00–18:00 CET" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Toggle label="Sandbox tenant" hint="Message sending disabled outside opt-in list" on={false} />
              <Toggle label="SSO / SAML" hint="Enterprise sign-on" on />
              <Toggle label="SCIM provisioning" hint="Automated user lifecycle" on={false} />
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="channel">
          <Card><CardContent className="p-6 space-y-6">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Phone className="h-4 w-4" /></span>
              <div className="flex-1">
                <div className="font-semibold">+49 89 1234 5678 · WhatsApp Business</div>
                <div className="text-xs text-muted-foreground">Cloud API · Meta authorised BSP · Business verified</div>
              </div>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Live</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Toggle label="Auto-reply outside hours" hint="Sends approved template out_of_hours_de" on />
              <Toggle label="Delivery receipts" hint="Store WhatsApp delivered/read events" on />
              <Toggle label="Fallback to SMS" hint="If WhatsApp fails after 20 min" on={false} />
              <Toggle label="Media retention 30 days" hint="Purge attachments after 30d unless referenced" on />
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card className="overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Inbox</th>
                  <th className="px-4 py-3">Cases</th>
                  <th className="px-4 py-3">Finance</th>
                  <th className="px-4 py-3">Workflows</th>
                  <th className="px-4 py-3">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roleMatrix.map((r) => (
                  <tr key={r.role} className="hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">{r.role}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.inbox}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.cases}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.finance}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.workflows}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.admin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
          <p className="mt-3 text-xs text-muted-foreground">Approvals: dual-control triggered on quotes &gt; €500, template edits and role changes.</p>
        </TabsContent>

        <TabsContent value="ai">
          <Card><CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-primary-soft/50 p-4">
              <Bot className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="font-semibold">AI · Aida</div>
                <div className="text-xs text-muted-foreground">Model preset: Beauty-DE · Handoff threshold: 0.72</div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Toggle label="AI drafts customer replies" on />
              <Toggle label="AI can send without approval on low-risk intents" on />
              <Toggle label="AI captures structured data" on />
              <Toggle label="AI can commit to money, timeslots > 30min or IDs" on={false} />
              <Toggle label="Log AI reasoning excerpts" on />
              <Toggle label="Redact PII in AI training exports" on />
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card><CardContent className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Data residency" value="Frankfurt · eu-central-1" />
              <Field label="Retention · business class" value="36 months" />
              <Field label="Retention · sensitive class" value="30 days after case close" />
              <Field label="DPA version" value="v3.1 · signed 2026-04-11" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border p-4">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div className="mt-2 font-semibold">Break-glass</div>
                <div className="text-xs text-muted-foreground">Requires reason, expiry, alert, post-access review.</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <KeyRound className="h-4 w-4 text-primary" />
                <div className="mt-2 font-semibold">Key rotation</div>
                <div className="text-xs text-muted-foreground">Message keys rotated every 90 days.</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div className="mt-2 font-semibold">Subject rights</div>
                <div className="text-xs text-muted-foreground">Export, rectification, erasure per purpose.</div>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card><CardContent className="p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Brand name" value="Beauty Studio München" />
              <Field label="From-name (portal & email)" value="Studio München" />
              <Field label="Custom domain" value="chat.studio-muc.de" />
              <Field label="Primary colour" value="#137F4E" />
            </div>
            <div className="rounded-lg border border-dashed border-border p-4">
              <Palette className="h-4 w-4 text-primary" />
              <div className="mt-2 text-sm">
                White-label controls apply to portal, email templates, and partner tenants.
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input defaultValue={value} className="mt-1" />
    </div>
  );
}

function Toggle({ label, hint, on }: { label: string; hint: string; on?: boolean }) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-border p-4">
      <div className="pr-4">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch defaultChecked={on} />
    </div>
  );
}

export function _unusedButton() { return <Button />; }
