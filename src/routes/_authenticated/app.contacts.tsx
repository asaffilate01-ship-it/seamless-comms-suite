import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { contacts } from "@/lib/mockData";
import { Search, Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/contacts")({
  component: Contacts,
});

function Contacts() {
  return (
    <AppShell
      title="Contacts"
      subtitle="7 contacts · 5 with active consent"
      actions={<>
        <Button variant="outline" size="sm"><Upload className="mr-1.5 h-3.5 w-3.5" />Import</Button>
        <Button variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" />DSGVO export</Button>
        <Button size="sm">Add contact</Button>
      </>}
    >
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, phone, email, tag…" className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Consent</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </AvatarFallback></Avatar>
                      <div>
                        <div className="font-medium">{c.name}</div>
                        {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.phone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.city}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={
                      c.consent === "granted" ? "border-success/40 bg-success/10 text-success"
                      : c.consent === "pending" ? "border-warning/40 bg-warning/10 text-warning-foreground"
                      : "border-muted-foreground/30 text-muted-foreground"
                    }>{c.consent}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
