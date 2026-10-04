/* eslint-disable @typescript-eslint/no-explicit-any -- Dispatch view models are returned by post-generation migrations. */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell, StatusBadge } from "@/components/app/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { getTenantControlPlane } from "@/lib/control-plane.functions";
import {
  assignDispatchJob,
  createDispatchAgent,
  createDispatchJob,
  createDispatchVehicle,
  createSlaPolicy,
  createTrackingToken,
  evaluateSlaOperations,
  generateOperationsIntelligence,
  listDispatch,
  listOperationsControl,
  listRoutingProposals,
  reviewDispatchException,
  reviewOperationsRecommendation,
  reviewRoutingProposal,
  updateDispatchStatus,
} from "@/modules/dispatch/functions";
import {
  AlertTriangle,
  BrainCircuit,
  MapPin,
  RefreshCw,
  Timer,
  Truck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/dispatch")({
  component: DispatchWorkspace,
  head: () => ({
    meta: [{ title: "Dispatch & Tracking — Omniqora" }, { name: "robots", content: "noindex" }],
  }),
});

function DispatchWorkspace() {
  const tenant = useTenant();
  const tenantId = tenant.tenantId ?? "";
  const tenantFn = useServerFn(getTenantControlPlane),
    listFn = useServerFn(listDispatch),
    proposalFn = useServerFn(listRoutingProposals),
    opsFn = useServerFn(listOperationsControl),
    reviewProposalFn = useServerFn(reviewRoutingProposal),
    createPolicyFn = useServerFn(createSlaPolicy),
    evaluateSlaFn = useServerFn(evaluateSlaOperations),
    generateIntelligenceFn = useServerFn(generateOperationsIntelligence),
    reviewExceptionFn = useServerFn(reviewDispatchException),
    reviewRecommendationFn = useServerFn(reviewOperationsRecommendation),
    jobFn = useServerFn(createDispatchJob),
    agentFn = useServerFn(createDispatchAgent),
    vehicleFn = useServerFn(createDispatchVehicle),
    assignFn = useServerFn(assignDispatchJob),
    statusFn = useServerFn(updateDispatchStatus),
    trackFn = useServerFn(createTrackingToken);
  const detail = useQuery({
    queryKey: ["dispatch-tenant", tenantId],
    queryFn: () => tenantFn({ data: { tenantId } }),
    enabled: !!tenantId,
    retry: false,
  });
  const data = useQuery({
    queryKey: ["dispatch-data", tenantId],
    queryFn: () => listFn({ data: { tenantId } }),
    enabled: !!tenantId,
    retry: false,
  });
  const proposals = useQuery({
    queryKey: ["routing-proposals", tenantId],
    queryFn: () => proposalFn({ data: { tenantId } }),
    enabled: !!tenantId,
    retry: false,
  });
  const operations = useQuery({
    queryKey: ["operations-control", tenantId],
    queryFn: () => opsFn({ data: { tenantId } }),
    enabled: !!tenantId,
    retry: false,
  });
  const products = (detail.data?.products ?? []).filter(
    (p) => !["cancelled", "failed"].includes(p.status),
  );
  const [productKey, setProductKey] = useState("mealdeck");
  const [agentName, setAgentName] = useState(""),
    [registration, setRegistration] = useState("");
  const [pickup, setPickup] = useState({ address: "", lat: "51.8787", lng: "-0.4200" }),
    [dropoff, setDropoff] = useState({ address: "", lat: "51.8800", lng: "-0.4100" });
  const [jobType, setJobType] = useState("food_delivery"),
    [externalRef, setExternalRef] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [slaName, setSlaName] = useState("FleetPulse delivery SLA"),
    [acceptMinutes, setAcceptMinutes] = useState("10"),
    [arriveMinutes, setArriveMinutes] = useState("45"),
    [completeMinutes, setCompleteMinutes] = useState("120");
  const jobs = useMemo(() => (data.data?.jobs ?? []) as any[], [data.data?.jobs]),
    agents = (data.data?.agents ?? []) as any[],
    vehicles = (data.data?.vehicles ?? []) as any[];
  const exceptions = (operations.data?.exceptions ?? []) as any[],
    recommendations = (operations.data?.recommendations ?? []) as any[],
    externalJobs = (operations.data?.jobs ?? []) as any[];
  const active = useMemo(
    () => jobs.filter((j) => !["completed", "failed", "cancelled"].includes(j.status)),
    [jobs],
  );
  async function refresh() {
    await Promise.all([
      data.refetch(),
      detail.refetch(),
      proposals.refetch(),
      operations.refetch(),
    ]);
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <AppShell
      title="Dispatch, Fleet & Tracking"
      subtitle="Reusable delivery/field-service operations shared across MealDeck, Courier Connect and other SaaS products."
      actions={
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Active jobs" value={String(active.length)} />
        <Metric label="Agents" value={String(agents.length)} />
        <Metric label="Vehicles" value={String(vehicles.length)} />
        <Metric
          label="Completed"
          value={String(jobs.filter((j) => j.status === "completed").length)}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold">New delivery / job</h2>
              <select
                className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={productKey}
                onChange={(e) => setProductKey(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.product_key}>{p.product_key}</option>
                ))}
              </select>
              <Input
                className="mt-3"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                placeholder="food_delivery"
              />
              <Input
                className="mt-3"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="External order/reference"
              />
              <p className="mt-4 text-xs font-medium text-muted-foreground">Pickup</p>
              <Input
                className="mt-2"
                value={pickup.address}
                onChange={(e) => setPickup((v) => ({ ...v, address: e.target.value }))}
                placeholder="Pickup address"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  value={pickup.lat}
                  onChange={(e) => setPickup((v) => ({ ...v, lat: e.target.value }))}
                />
                <Input
                  value={pickup.lng}
                  onChange={(e) => setPickup((v) => ({ ...v, lng: e.target.value }))}
                />
              </div>
              <p className="mt-4 text-xs font-medium text-muted-foreground">Drop-off</p>
              <Input
                className="mt-2"
                value={dropoff.address}
                onChange={(e) => setDropoff((v) => ({ ...v, address: e.target.value }))}
                placeholder="Drop-off address"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  value={dropoff.lat}
                  onChange={(e) => setDropoff((v) => ({ ...v, lat: e.target.value }))}
                />
                <Input
                  value={dropoff.lng}
                  onChange={(e) => setDropoff((v) => ({ ...v, lng: e.target.value }))}
                />
              </div>
              <Button
                className="mt-3 w-full"
                onClick={() =>
                  run(async () => {
                    await jobFn({
                      data: {
                        tenantId,
                        productKey,
                        locationId: null,
                        jobType,
                        priority: "normal",
                        externalRef: externalRef || null,
                        stops: [
                          {
                            kind: "pickup",
                            lat: Number(pickup.lat),
                            lng: Number(pickup.lng),
                            address: pickup.address,
                          },
                          {
                            kind: "dropoff",
                            lat: Number(dropoff.lat),
                            lng: Number(dropoff.lng),
                            address: dropoff.address,
                          },
                        ],
                      },
                    });
                    setExternalRef("");
                  }, "Job created")
                }
              >
                Create job
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold">Fleet setup</h2>
              <Input
                className="mt-3"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Agent / driver name"
              />
              <Button
                className="mt-2"
                variant="outline"
                disabled={!agentName}
                onClick={() =>
                  run(async () => {
                    await agentFn({
                      data: {
                        tenantId,
                        productKey,
                        name: agentName,
                        agentRole: "food_delivery",
                        skills: ["delivery"],
                        phone: null,
                      },
                    });
                    setAgentName("");
                  }, "Agent created")
                }
              >
                <UserRound className="mr-2 h-4 w-4" />
                Add agent
              </Button>
              <Input
                className="mt-4"
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
                placeholder="Vehicle registration"
              />
              <Button
                className="mt-2"
                variant="outline"
                disabled={!registration}
                onClick={() =>
                  run(async () => {
                    await vehicleFn({
                      data: {
                        tenantId,
                        productKey,
                        registration,
                        vehicleType: "car",
                        capacity: null,
                      },
                    });
                    setRegistration("");
                  }, "Vehicle created")
                }
              >
                <Truck className="mr-2 h-4 w-4" />
                Add vehicle
              </Button>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="border-b p-5">
              <h2 className="font-semibold">Dispatch board</h2>
            </div>
            <div className="divide-y">
              {jobs.map((job) => (
                <div key={job.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <b>{job.job_type}</b>
                      <p className="text-xs text-muted-foreground">
                        {job.product_key} · {job.external_ref || job.id}
                      </p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(job.stops ?? [])
                      .sort((a: any, b: any) => a.position - b.position)
                      .map((s: any) => (
                        <Badge key={s.id} variant="outline">
                          <MapPin className="mr-1 h-3 w-3" />
                          {s.stop_kind}: {s.address || s.latitude + "," + s.longitude}
                        </Badge>
                      ))}
                  </div>
                  {!job.assigned_agent_id && agents.length > 0 && (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          () =>
                            assignFn({
                              data: {
                                jobId: job.id,
                                agentId:
                                  agents.find((a) => a.status === "available")?.id || agents[0].id,
                                vehicleId:
                                  vehicles.find((v) => v.status === "available")?.id || null,
                              },
                            }),
                          "Job assigned",
                        )
                      }
                    >
                      Assign available agent
                    </Button>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["accepted", "en_route", "arrived", "in_progress", "completed"].map(
                      (nextStatus) => (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant="outline"
                          disabled={
                            job.status === nextStatus ||
                            ["completed", "failed", "cancelled"].includes(job.status)
                          }
                          onClick={() =>
                            run(
                              () =>
                                statusFn({ data: { jobId: job.id, status: nextStatus as any } }),
                              "Status: " + nextStatus,
                            )
                          }
                        >
                          {nextStatus}
                        </Button>
                      ),
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const result = await trackFn({
                            data: {
                              tenantId,
                              subjectType: "dispatch_job",
                              subjectId: job.id,
                              hours: 24,
                            },
                          });
                          setTrackingToken(result.token);
                          toast.success("Tracking link token generated");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : String(error));
                        }
                      }}
                    >
                      Tracking link
                    </Button>
                  </div>
                </div>
              ))}
              {!jobs.length && (
                <p className="p-5 text-sm text-muted-foreground">No dispatch jobs yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="border-b p-5">
            <h2 className="font-semibold">Native routing proposal approvals</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review persisted Fleetora/FleetPulse route plans. Approval never applies or dispatches
              a route by itself.
            </p>
          </div>
          <div className="divide-y">
            {((proposals.data ?? []) as any[]).map((proposal) => (
              <div key={proposal.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <b>{proposal.external_route_id}</b>
                    <p className="text-xs text-muted-foreground">
                      {proposal.product_key} · {proposal.engine} ·{" "}
                      {proposal.plan?.assignedStopCount ?? 0} stops ·{" "}
                      {Number(proposal.plan?.totalDistanceKm ?? 0).toFixed(1)} km
                    </p>
                  </div>
                  <StatusBadge status={proposal.status} />
                </div>
                {proposal.plan?.unassigned?.length > 0 && (
                  <p className="mt-2 text-xs text-destructive">
                    {proposal.plan.unassigned.length} unassigned stop(s); approval is blocked.
                  </p>
                )}
                {proposal.status === "review" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={proposal.plan?.unassigned?.length > 0}
                      onClick={() =>
                        run(
                          () =>
                            reviewProposalFn({
                              data: {
                                proposalId: proposal.id,
                                decision: "approved",
                                note: "Dispatcher reviewed native constrained route",
                              },
                            }),
                          "Routing proposal approved",
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          () =>
                            reviewProposalFn({
                              data: {
                                proposalId: proposal.id,
                                decision: "rejected",
                                note: "Dispatcher rejected route proposal",
                              },
                            }),
                          "Routing proposal rejected",
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!proposals.data?.length && (
              <p className="p-5 text-sm text-muted-foreground">
                No route proposals awaiting review.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              <h2 className="font-semibold">Reusable SLA policy</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tenant/product policy; blank scopes apply to all delivery jobs.
            </p>
            <Input
              className="mt-3"
              value={slaName}
              onChange={(e) => setSlaName(e.target.value)}
              placeholder="Policy name"
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Input
                type="number"
                min="1"
                value={acceptMinutes}
                onChange={(e) => setAcceptMinutes(e.target.value)}
                aria-label="Accept minutes"
              />
              <Input
                type="number"
                min="1"
                value={arriveMinutes}
                onChange={(e) => setArriveMinutes(e.target.value)}
                aria-label="Arrive minutes"
              />
              <Input
                type="number"
                min="1"
                value={completeMinutes}
                onChange={(e) => setCompleteMinutes(e.target.value)}
                aria-label="Complete minutes"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Accept · arrive · complete (minutes)
            </p>
            <Button
              className="mt-3 w-full"
              disabled={!tenantId || !productKey || !slaName}
              onClick={() =>
                run(
                  () =>
                    createPolicyFn({
                      data: {
                        tenantId,
                        productKey,
                        name: slaName,
                        jobType: "delivery",
                        priority: null,
                        acceptSeconds: Number(acceptMinutes) * 60,
                        arriveSeconds: Number(arriveMinutes) * 60,
                        completeSeconds: Number(completeMinutes) * 60,
                      },
                    }),
                  "SLA policy created",
                )
              }
            >
              Create SLA policy
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  run(
                    () => evaluateSlaFn({ data: { tenantId, productKey } }),
                    "SLA evaluation complete",
                  )
                }
              >
                Evaluate SLA
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  run(
                    () => generateIntelligenceFn({ data: { tenantId, productKey } }),
                    "Recommendations refreshed",
                  )
                }
              >
                <BrainCircuit className="mr-1 h-4 w-4" />
                Generate
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {operations.data?.policies?.length ?? 0} policies · {externalJobs.length} projected
              jobs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="border-b p-5">
              <h2 className="font-semibold">SLA and operational exceptions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Opaque FleetPulse job evidence only. Resolution is human-reviewed and audited.
              </p>
            </div>
            <div className="divide-y">
              {exceptions.map((exception) => (
                <div key={exception.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <b className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {exception.exception_type}
                      </b>
                      <p className="text-xs text-muted-foreground">
                        {exception.product_key ?? "native"} ·{" "}
                        {exception.external_job_id ?? exception.job_id ?? exception.id} · due{" "}
                        {exception.detail?.dueAt
                          ? new Date(exception.detail.dueAt).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <StatusBadge status={exception.severity} />
                      <StatusBadge status={exception.status} />
                    </div>
                  </div>
                  {exception.status === "open" && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            () =>
                              reviewExceptionFn({
                                data: {
                                  exceptionId: exception.id,
                                  decision: "acknowledged",
                                  note: "Operations team acknowledged SLA exception",
                                },
                              }),
                            "Exception acknowledged",
                          )
                        }
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            () =>
                              reviewExceptionFn({
                                data: {
                                  exceptionId: exception.id,
                                  decision: "resolved",
                                  note: "Operations team reviewed and resolved exception",
                                },
                              }),
                            "Exception resolved",
                          )
                        }
                      >
                        Resolve
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!exceptions.length && (
                <p className="p-5 text-sm text-muted-foreground">No SLA or dispatch exceptions.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="border-b p-5">
            <h2 className="font-semibold">Omniqora Operations Intelligence</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Deterministic and AI-assisted proposals use structured evidence. Approval records a
              decision only; no recommendation can auto-dispatch, apply a route or change authority.
            </p>
          </div>
          <div className="divide-y">
            {recommendations.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <b>{item.recommendation_type}</b>
                    <p className="text-xs text-muted-foreground">
                      {item.source_kind} · {item.subject_type}:{item.subject_id} · confidence{" "}
                      {item.confidence == null
                        ? "—"
                        : Math.round(Number(item.confidence) * 100) + "%"}
                    </p>
                    <p className="mt-1 text-xs">
                      Action: {item.recommendation?.action} ·{" "}
                      {(item.recommendation?.reasonCodes ?? []).join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                {item.status === "review" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          () =>
                            reviewRecommendationFn({
                              data: {
                                recommendationId: item.id,
                                decision: "approved",
                                note: "Human-reviewed operational recommendation",
                              },
                            }),
                          "Recommendation approved for separate operator action",
                        )
                      }
                    >
                      Approve recommendation
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          () =>
                            reviewRecommendationFn({
                              data: {
                                recommendationId: item.id,
                                decision: "dismissed",
                                note: "Human reviewer dismissed recommendation",
                              },
                            }),
                          "Recommendation dismissed",
                        )
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!recommendations.length && (
              <p className="p-5 text-sm text-muted-foreground">
                No recommendations awaiting review.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      {trackingToken && (
        <Card className="mt-6">
          <CardContent className="p-5">
            <h2 className="font-semibold">Signed customer tracking token</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Use with /api/public/track/&lt;token&gt;. It expires automatically and exposes only
              allowed public fields.
            </p>
            <code className="mt-3 block break-all rounded bg-muted p-3 text-xs">
              {trackingToken}
            </code>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
