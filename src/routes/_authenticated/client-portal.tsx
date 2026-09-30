import { RequestFiles } from "@/modules/practice/request-files";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  accessPracticePortal,
  listMyPracticePortals,
} from "@/modules/practice/workspace.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/client-portal")({
  head: () => ({
    meta: [{ title: "Client portal — Omniqora" }, { name: "robots", content: "noindex" }],
  }),
  component: ClientPortal,
});
function ClientPortal() {
  const [id, setId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const list = useServerFn(listMyPracticePortals),
    access = useServerFn(accessPracticePortal);
  const cache = useQueryClient();
  const memberships = useQuery({ queryKey: ["my-practice-portals"], queryFn: () => list() });
  const clientId = id || memberships.data?.[0]?.practice_client_id;
  const key = ["practice-portal", clientId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => access({ data: { clientId } }),
    enabled: !!clientId,
  });
  const mutation = useMutation({
    mutationFn: (input: {
      action: "respond" | "accept" | "decline";
      entityId: string;
      response?: string;
    }) => access({ data: { clientId, ...input } }),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: key });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const data = query.data as any;
  const date = (s: string) => (s ? new Date(s).toLocaleDateString("en-GB") : "No deadline");
  return (
    <main className="min-h-screen bg-surface-2 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Omniqora · Client workspace
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {data?.client.name ?? "Your client portal"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            See your work, respond to requests and review proposals.
          </p>
        </header>
        {memberships.isPending ? (
          <p role="status">Loading access…</p>
        ) : memberships.error ? (
          <p role="alert">{memberships.error.message}</p>
        ) : !memberships.data?.length ? (
          <p className="rounded-xl border bg-card p-6">
            Your account has no active client portal access. Ask your service provider to add your
            account.
          </p>
        ) : (
          <>
            <label className="mb-6 block text-sm">
              Client workspace
              <select
                className="ml-3 rounded-lg border bg-background p-2"
                value={clientId}
                onChange={(e) => {
                  setId(e.target.value);
                  setAnswers({});
                  setConsents({});
                }}
              >
                {memberships.data.map((m: any) => (
                  <option key={m.practice_client_id} value={m.practice_client_id}>
                    {m.practice_client_id === data?.client.id
                      ? data.client.name
                      : m.practice_client_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {query.isPending ? (
              <p role="status">Loading your work…</p>
            ) : query.error ? (
              <p role="alert">{query.error.message}</p>
            ) : (
              data && (
                <div className="space-y-8">
                  <section>
                    <h2 className="mb-3 text-lg font-semibold">Your services</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {data.jobs.map((j: any) => (
                        <div key={j.id} className="rounded-xl border bg-card p-5">
                          <div className="flex justify-between gap-2">
                            <h3 className="font-medium">{j.service_key.replaceAll("-", " ")}</h3>
                            <Badge variant="outline">{j.status.replaceAll("_", " ")}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {j.period_key} · Due {date(j.due_at)}
                          </p>
                          <p className="mt-3 text-sm">{j.progress}% complete</p>
                        </div>
                      ))}
                    </div>
                    {!data.jobs.length && (
                      <p className="text-sm text-muted-foreground">No services to display yet.</p>
                    )}
                  </section>
                  <section>
                    <h2 className="mb-3 text-lg font-semibold">Information requests</h2>
                    <div className="space-y-3">
                      {data.requests.map((r: any) => (
                        <form
                          key={r.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            mutation.mutate({
                              action: "respond",
                              entityId: r.id,
                              response: answers[r.id],
                            });
                          }}
                          className="rounded-xl border bg-card p-5"
                        >
                          <div className="flex justify-between">
                            <h3 className="font-medium">{r.title}</h3>
                            <Badge variant="outline">{r.status}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">Due {date(r.due_at)}</p>
                          {r.response && (
                            <p className="my-3 whitespace-pre-wrap text-sm">{r.response}</p>
                          )}
                          <RequestFiles
                            requestId={r.id}
                            canUpload={
                              r.status === "outstanding" && data.client.role !== "client_viewer"
                            }
                          />
                          {r.status === "outstanding" && data.client.role !== "client_viewer" && (
                            <>
                              <label className="mt-3 block text-sm">
                                Your response
                                <textarea
                                  className="mt-1 w-full rounded-lg border bg-background p-3"
                                  rows={3}
                                  required
                                  maxLength={10000}
                                  value={answers[r.id] ?? ""}
                                  onChange={(e) =>
                                    setAnswers({ ...answers, [r.id]: e.target.value })
                                  }
                                />
                              </label>
                              <Button type="submit" disabled={mutation.isPending}>
                                Submit for review
                              </Button>
                            </>
                          )}
                        </form>
                      ))}
                    </div>
                    {!data.requests.length && (
                      <p className="text-sm text-muted-foreground">
                        Nothing requested at the moment.
                      </p>
                    )}
                  </section>
                  <section>
                    <h2 className="mb-3 text-lg font-semibold">Proposals & agreements</h2>
                    <div className="space-y-3">
                      {data.proposals.map((p: any) => (
                        <article key={p.id} className="rounded-xl border bg-card p-5">
                          <div className="flex justify-between gap-3">
                            <h3 className="font-semibold">{p.service_name}</h3>
                            <Badge variant="outline">{p.status}</Badge>
                          </div>
                          <p className="mt-3 text-2xl font-semibold">
                            {new Intl.NumberFormat("en-GB", {
                              style: "currency",
                              currency: p.currency,
                            }).format(p.total_minor / 100)}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Valid until {date(p.expires_at)}
                          </p>
                          <p className="my-4 whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">
                            {p.terms}
                          </p>
                          {p.status === "issued" &&
                            Date.parse(p.expires_at) > Date.now() &&
                            data.client.role === "client_owner" && (
                              <>
                                <label className="mb-4 flex items-start gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={consents[p.id] ?? false}
                                    onChange={(e) =>
                                      setConsents({ ...consents, [p.id]: e.target.checked })
                                    }
                                  />
                                  I have reviewed the scope, price and terms and am authorised to
                                  accept this proposal.
                                </label>
                                <div className="flex gap-2">
                                  <Button
                                    disabled={!consents[p.id] || mutation.isPending}
                                    onClick={() =>
                                      mutation.mutate({ action: "accept", entityId: p.id })
                                    }
                                  >
                                    Accept proposal
                                  </Button>
                                  <Button
                                    variant="outline"
                                    disabled={mutation.isPending}
                                    onClick={() =>
                                      mutation.mutate({ action: "decline", entityId: p.id })
                                    }
                                  >
                                    Decline
                                  </Button>
                                </div>
                                <p className="mt-3 text-xs text-muted-foreground">
                                  Your decision is recorded against your account. No payment is
                                  taken here.
                                </p>
                              </>
                            )}
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
