import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import {
  createAutomationWorkflow,
  createDocumentRecord,
  createFormDefinition,
  createSupportTicket,
  getPlatformUtilities,
  searchUtilities,
} from "@/modules/platform-utilities/functions";
import { FileText, Search, Settings2, Ticket } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/utilities")({
  component: Utilities,
  head: () => ({
    meta: [
      { title: "Platform Utilities — Omniqora" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Utilities() {
  const tenant = useTenant();
  const tenantId = tenant.tenantId ?? "";
  const getFn = useServerFn(getPlatformUtilities);
  const workflowFn = useServerFn(createAutomationWorkflow);
  const docFn = useServerFn(createDocumentRecord);
  const formFn = useServerFn(createFormDefinition);
  const ticketFn = useServerFn(createSupportTicket);
  const searchFn = useServerFn(searchUtilities);

  const query = useQuery({
    queryKey: ["utilities", tenantId],
    queryFn: () => getFn({ data: { tenantId } }),
    enabled: Boolean(tenantId),
    retry: false,
  });

  const [workflowName, setWorkflowName] = useState("");
  const [trigger, setTrigger] = useState("marketplace.order.completed");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      toast.success(message);
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function createWorkflow() {
    await run(async () => {
      await workflowFn({
        data: {
          tenantId,
          productKey: null,
          name: workflowName,
          triggerEvent: trigger,
        },
      });
      setWorkflowName("");
    }, "Workflow created");
  }

  async function createDocument() {
    await run(
      () =>
        docFn({
          data: {
            tenantId,
            productKey: null,
            title: "Example document",
            documentType: "evidence",
            subjectType: null,
            subjectId: null,
            storageRef: "pending://upload",
            mimeType: "application/pdf",
          },
        }),
      "Document record created",
    );
  }

  async function createForm() {
    await run(
      () =>
        formFn({
          data: {
            tenantId,
            productKey: null,
            formKey: "example-" + Date.now(),
            name: "Example form",
            schema: { fields: [], sections: [] },
          },
        }),
      "Form created",
    );
  }

  async function createTicket() {
    await run(async () => {
      await ticketFn({
        data: {
          tenantId,
          productKey: null,
          subject: ticketSubject,
          description: ticketDescription || null,
          priority: "normal",
        },
      });
      setTicketSubject("");
      setTicketDescription("");
    }, "Ticket created");
  }

  async function searchTenant() {
    try {
      const rows = await searchFn({ data: { tenantId, query: search } });
      setResults(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <AppShell
      title="Platform Utilities"
      subtitle="Automation, documents, forms, support, notifications and tenant-safe search shared by every SaaS."
    >
      <div className="grid gap-4 md:grid-cols-6">
        <Metric label="Workflows" value={query.data?.workflows?.length ?? 0} />
        <Metric label="Runs" value={query.data?.runs?.length ?? 0} />
        <Metric label="Documents" value={query.data?.documents?.length ?? 0} />
        <Metric label="Forms" value={query.data?.forms?.length ?? 0} />
        <Metric label="Tickets" value={query.data?.tickets?.length ?? 0} />
        <Metric label="Notifications" value={query.data?.notifications?.length ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <Settings2 className="h-4 w-4" />
            <h2 className="mt-2 font-semibold">Automation</h2>
            <Input
              className="mt-3"
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              placeholder="Post-order follow-up"
            />
            <Input
              className="mt-2"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value)}
            />
            <Button className="mt-3" disabled={!workflowName} onClick={createWorkflow}>
              Create workflow
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <FileText className="h-4 w-4" />
            <h2 className="mt-2 font-semibold">Document / form</h2>
            <Button className="mt-3" variant="outline" onClick={createDocument}>
              New document record
            </Button>
            <Button className="mt-2" variant="outline" onClick={createForm}>
              New form
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <Ticket className="h-4 w-4" />
            <h2 className="mt-2 font-semibold">Support ticket</h2>
            <Input
              className="mt-3"
              value={ticketSubject}
              onChange={(event) => setTicketSubject(event.target.value)}
              placeholder="Issue"
            />
            <Textarea
              className="mt-2"
              value={ticketDescription}
              onChange={(event) => setTicketDescription(event.target.value)}
              placeholder="Details"
            />
            <Button className="mt-3" disabled={!ticketSubject} onClick={createTicket}>
              Create ticket
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tenant data"
            />
            <Button disabled={!search} onClick={searchTenant}>
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {results.map((row) => (
              <div
                key={row.entity_type + ":" + row.entity_id}
                className="rounded-lg border p-3"
              >
                <div className="flex justify-between">
                  <b>{row.title}</b>
                  <Badge variant="outline">{row.entity_type}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{row.excerpt}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <h2 className="border-b p-5 font-semibold">Automation runs</h2>
            <div className="divide-y">
              {(query.data?.runs ?? []).map((row: any) => (
                <div key={row.id} className="flex justify-between p-4 text-sm">
                  <span>{row.workflow_id.slice(0, 8)}…</span>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <h2 className="border-b p-5 font-semibold">Support queue</h2>
            <div className="divide-y">
              {(query.data?.tickets ?? []).map((row: any) => (
                <div key={row.id} className="flex justify-between p-4 text-sm">
                  <span>{row.subject}</span>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
