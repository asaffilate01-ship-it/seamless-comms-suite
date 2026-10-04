import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/app/shell";
import {
  bindFleetoraTenant,
  createFleetoraLandlord,
  getFleetoraOperatorState,
  requestFleetoraCutover,
  reviewFleetoraCutover,
  setFleetoraFeatureAuthority,
  setFleetoraMigrationMode,
} from "@/lib/control-plane.functions";
import { Building2, Route, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Props = {
  tenantId: string;
  organisationId?: string;
  tenantName?: string;
  tenantSlug?: string;
  isPlatformAdmin: boolean;
};

const FLEETPULSE_FEATURES = [
  "advanced_scheduling",
  "advanced_reporting",
  "compliance_suite",
  "wps_payroll",
  "white_label",
  "custom_domain",
  "audit",
  "api_access",
  "multi_branch",
] as const;
type FleetPulseFeature = (typeof FLEETPULSE_FEATURES)[number];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function FleetoraOperatorPanel({
  tenantId,
  organisationId,
  tenantName = "FleetPulse UAE",
  tenantSlug = "fleetpulse-uae",
  isPlatformAdmin,
}: Props) {
  const getState = useServerFn(getFleetoraOperatorState);
  const createLandlord = useServerFn(createFleetoraLandlord);
  const bindTenant = useServerFn(bindFleetoraTenant);
  const requestCutover = useServerFn(requestFleetoraCutover);
  const reviewCutover = useServerFn(reviewFleetoraCutover);
  const setFeatureAuthority = useServerFn(setFleetoraFeatureAuthority);
  const setMode = useServerFn(setFleetoraMigrationMode);
  const state = useQuery({
    queryKey: ["fleetora-operator", tenantId],
    queryFn: () => getState({ data: { tenantId, productKey: "fleetpulse-uae" } }),
    enabled: Boolean(tenantId),
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [landlord, setLandlord] = useState({
    instanceKey: "fleetpulse-uae",
    name: "FleetPulse UAE",
    regionKey: "ae",
  });
  const [binding, setBinding] = useState({
    landlordInstanceId: "",
    externalTenantId: tenantSlug,
    baseUrl: "https://fleet.313test.co.uk",
    brandName: tenantName,
    brandSlug: tenantSlug,
    blueprintKey: "fleetpulse-ae-starter" as "fleetpulse-ae-starter" | "fleetpulse-ae-growth",
  });
  const [featureEntitlements, setFeatureEntitlements] = useState<FleetPulseFeature[]>([]);
  const [featuresAuthoritative, setFeaturesAuthoritative] = useState(false);

  useEffect(() => {
    const first = state.data?.landlords[0]?.id;
    if (!binding.landlordInstanceId && first) {
      setBinding((value) => ({ ...value, landlordInstanceId: first }));
    }
  }, [binding.landlordInstanceId, state.data?.landlords]);
  useEffect(() => {
    const authority = state.data?.featureAuthority;
    if (!authority) return;
    setFeatureEntitlements(
      authority.entitlements.filter((value): value is FleetPulseFeature =>
        FLEETPULSE_FEATURES.includes(value as FleetPulseFeature),
      ),
    );
    setFeaturesAuthoritative(authority.authoritative);
  }, [state.data?.featureAuthority]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      await state.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (state.error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-5 text-sm text-destructive">
          Fleetora operator state is unavailable: {state.error.message}
        </CardContent>
      </Card>
    );
  }

  const readiness = state.data?.readiness;
  const currentMode = readiness?.migrationMode ?? "disabled";
  const nextMode = currentMode === "shadow" ? "read" : currentMode === "read" ? "write" : null;
  const eligible =
    nextMode === "read" ? readiness?.readCutoverEligible : readiness?.writeCutoverEligible;
  const pendingApproval = state.data?.approvals.find(
    (approval) => approval.targetMode === nextMode && approval.status === "requested",
  );

  return (
    <section>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Route className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Fleetora landlord & cutover</h2>
          <p className="text-sm text-muted-foreground">
            Bind FleetPulse to the reusable Fleetora landlord and govern shadow → read → restricted
            write authority.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Landlord instance</h3>
            </div>
            <div className="mt-3 space-y-2">
              {(state.data?.landlords ?? []).map((instance) => (
                <div key={instance.id} className="rounded-lg bg-muted p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{instance.name}</b>
                    <StatusBadge status={instance.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {instance.instanceKey} · {instance.regionKey}
                  </p>
                </div>
              ))}
              {!state.data?.landlords.length && (
                <p className="text-sm text-muted-foreground">No accessible Fleetora landlord.</p>
              )}
            </div>
            {isPlatformAdmin && organisationId && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <Input
                  aria-label="Landlord instance key"
                  value={landlord.instanceKey}
                  onChange={(event) =>
                    setLandlord((value) => ({
                      ...value,
                      instanceKey: slugify(event.target.value),
                    }))
                  }
                />
                <Input
                  aria-label="Landlord name"
                  value={landlord.name}
                  onChange={(event) =>
                    setLandlord((value) => ({ ...value, name: event.target.value }))
                  }
                />
                <Input
                  aria-label="Region pack"
                  value={landlord.regionKey}
                  onChange={(event) =>
                    setLandlord((value) => ({ ...value, regionKey: event.target.value }))
                  }
                />
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={busy !== null || !landlord.instanceKey || !landlord.name}
                  onClick={() =>
                    run(
                      "create-landlord",
                      async () => {
                        const result = await createLandlord({
                          data: {
                            ...landlord,
                            organisationId,
                            branding: { brandName: landlord.name },
                          },
                        });
                        setBinding((value) => ({
                          ...value,
                          landlordInstanceId: result.landlordInstanceId,
                        }));
                      },
                      "Fleetora landlord created",
                    )
                  }
                >
                  Create / reconcile landlord
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold">Tenant binding</h3>
            {state.data?.binding ? (
              <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>FleetPulse UAE</span>
                  <StatusBadge status={state.data.binding.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Authority: {state.data.binding.migration_mode}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Tenant is not bound to Fleetora.</p>
            )}
            {isPlatformAdmin && !state.data?.binding && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <select
                  aria-label="Fleetora landlord"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={binding.landlordInstanceId}
                  onChange={(event) =>
                    setBinding((value) => ({
                      ...value,
                      landlordInstanceId: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose landlord</option>
                  {(state.data?.landlords ?? []).map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="External tenant ID"
                  value={binding.externalTenantId}
                  onChange={(event) =>
                    setBinding((value) => ({ ...value, externalTenantId: event.target.value }))
                  }
                />
                <Input
                  aria-label="FleetPulse base URL"
                  value={binding.baseUrl}
                  onChange={(event) =>
                    setBinding((value) => ({ ...value, baseUrl: event.target.value }))
                  }
                />
                <Input
                  aria-label="FleetPulse brand name"
                  value={binding.brandName}
                  onChange={(event) =>
                    setBinding((value) => ({ ...value, brandName: event.target.value }))
                  }
                />
                <Input
                  aria-label="FleetPulse brand slug"
                  value={binding.brandSlug}
                  onChange={(event) =>
                    setBinding((value) => ({
                      ...value,
                      brandSlug: slugify(event.target.value),
                    }))
                  }
                />
                <select
                  aria-label="FleetPulse blueprint"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={binding.blueprintKey}
                  onChange={(event) =>
                    setBinding((value) => ({
                      ...value,
                      blueprintKey: event.target.value as
                        "fleetpulse-ae-starter" | "fleetpulse-ae-growth",
                    }))
                  }
                >
                  <option value="fleetpulse-ae-starter">FleetPulse UAE Starter</option>
                  <option value="fleetpulse-ae-growth">FleetPulse UAE Growth</option>
                </select>
                <Button
                  className="w-full"
                  disabled={busy !== null || !binding.landlordInstanceId}
                  onClick={() =>
                    run(
                      "bind-tenant",
                      () => bindTenant({ data: { ...binding, tenantId } }),
                      "Tenant bound in shadow mode",
                    )
                  }
                >
                  Bind tenant to Fleetora
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Migration authority</h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">Mode: {currentMode}</Badge>
              <Badge variant="outline">
                Shadow: {readiness?.shadowPassed ?? 0}/{readiness?.requiredShadowPasses ?? 10}
              </Badge>
              <Badge variant="outline">Failed: {readiness?.shadowFailed ?? 0}</Badge>
              <Badge variant="outline">
                Critical: {readiness?.blockingCriticalExceptions ?? 0}
              </Badge>
            </div>
            {(readiness?.blockers ?? []).length > 0 && (
              <p className="mt-3 text-xs text-destructive">
                Blockers: {readiness?.blockers?.join(", ")}
              </p>
            )}
            {nextMode && state.data?.binding && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="text-sm">
                  Next controlled authority: <b>{nextMode}</b>
                </p>
                {!pendingApproval &&
                  !state.data.approvals.some(
                    (approval) =>
                      approval.targetMode === nextMode && approval.status === "approved",
                  ) && (
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `request-${nextMode}`,
                          () =>
                            requestCutover({
                              data: {
                                tenantId,
                                productKey: "fleetpulse-uae",
                                targetMode: nextMode,
                                reason: `Operator requests ${nextMode} authority after reviewing Fleetora pilot evidence`,
                              },
                            }),
                          `${nextMode} cutover review requested`,
                        )
                      }
                    >
                      Request {nextMode} review
                    </Button>
                  )}
                {pendingApproval && isPlatformAdmin && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `approve-${pendingApproval.id}`,
                          () =>
                            reviewCutover({
                              data: {
                                approvalId: pendingApproval.id,
                                decision: "approved",
                                note: "Platform operator reviewed tenant readiness evidence",
                              },
                            }),
                          `${nextMode} cutover approved`,
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `reject-${pendingApproval.id}`,
                          () =>
                            reviewCutover({
                              data: {
                                approvalId: pendingApproval.id,
                                decision: "rejected",
                                note: "Platform operator rejected current readiness evidence",
                              },
                            }),
                          `${nextMode} cutover rejected`,
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {isPlatformAdmin && eligible && (
                  <Button
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `apply-${nextMode}`,
                        () =>
                          setMode({
                            data: {
                              tenantId,
                              productKey: "fleetpulse-uae",
                              mode: nextMode,
                            },
                          }),
                        `Fleetora authority changed to ${nextMode}`,
                      )
                    }
                  >
                    Apply approved {nextMode} cutover
                  </Button>
                )}
              </div>
            )}
            {isPlatformAdmin && state.data?.binding && currentMode !== "shadow" && (
              <Button
                className="mt-3 w-full"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "rollback-shadow",
                    () =>
                      setMode({
                        data: {
                          tenantId,
                          productKey: "fleetpulse-uae",
                          mode: "shadow",
                        },
                      }),
                    "Fleetora returned to shadow mode",
                  )
                }
              >
                Roll back to shadow
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold">Feature authority</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose the FleetPulse features governed by Omniqora. Enforcement activates only with a
              fresh central snapshot in read/write mode.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {FLEETPULSE_FEATURES.map((feature) => (
                <label key={feature} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={featureEntitlements.includes(feature)}
                    disabled={!isPlatformAdmin || busy !== null}
                    onChange={(event) =>
                      setFeatureEntitlements((current) =>
                        event.target.checked
                          ? [...current, feature]
                          : current.filter((value) => value !== feature),
                      )
                    }
                  />
                  {feature.replaceAll("_", " ")}
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={featuresAuthoritative}
                disabled={!isPlatformAdmin || busy !== null}
                onChange={(event) => setFeaturesAuthoritative(event.target.checked)}
              />
              Central list is authoritative; unselected gated features are denied.
            </label>
            <Button
              className="mt-4 w-full"
              variant="outline"
              disabled={!isPlatformAdmin || !state.data?.binding || busy !== null}
              onClick={() =>
                run(
                  "feature-authority",
                  () =>
                    setFeatureAuthority({
                      data: {
                        tenantId,
                        productKey: "fleetpulse-uae",
                        entitlements: featureEntitlements,
                        authoritative: featuresAuthoritative,
                      },
                    }),
                  "FleetPulse feature authority saved",
                )
              }
            >
              Save feature authority
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
