import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app/shell";
import { automotiveSources } from "@/modules/automotive/source-catalogue";
import { HISTORY_REQUIRED_AREAS, type VehicleHistoryRegion } from "@/modules/automotive/vehicle-history-intelligence";

export const Route = createFileRoute("/_authenticated/app/automotive")({
  component: AutomotiveIntelligence,
  head: () => ({
    meta: [{ title: "Automotive Intelligence - Omniqora" }, { name: "robots", content: "noindex" }],
  }),
});

function AutomotiveIntelligence() {
  const [region, setRegion] = useState<VehicleHistoryRegion>("GB");
  const location = region === "GB" ? "UK" : region === "JP" ? "Japan" : "Global";
  const sources = automotiveSources.filter((source) =>
    source.region === location || source.region === "Global",
  );
  return (
    <AppShell title="Automotive Intelligence" subtitle="Zivvo, AutoHashi and SparesGrid - shared data-source register and evidence standards">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Vehicle Passport and data provenance</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This is a provider inventory and data-contract workspace, not a live vehicle-history report.
            Integration candidates do not imply API activation, licensed access or a verified clean vehicle.
            Provider onboarding, tenant entitlements, vehicle identity and retained evidence must pass
            independent release checks before customer reports are enabled.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Vehicle data market">
            {(["GB", "DE", "JP"] as VehicleHistoryRegion[]).map((value) => (
              <button key={value} type="button" onClick={() => setRegion(value)}
                aria-pressed={region === value}
                className={"rounded-lg border px-4 py-2 text-sm " + (region === value
                  ? "border-foreground bg-muted font-semibold" : "border-border")}>
                {value === "GB" ? "United Kingdom" : value === "DE" ? "Germany" : "Japan"}
              </button>
            ))}
          </div>
          <h3 className="mt-4 font-medium">Minimum fields requiring verified evidence</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {HISTORY_REQUIRED_AREAS[region].map((value) => (
              <span key={value} className="rounded-md bg-muted px-3 py-1.5 text-xs">
                {value.replaceAll("_", " ")}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Unknown is the default. No data is equivalent to no check, not a clear history.
            Any adverse finance, stolen, mileage, damage or safety marker requires manual review.
            No precise geolocation is collected for vehicle appraisal evidence.
          </p>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Provider integration candidates</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Source classes and capabilities are design inputs only. All provider connections remain
            disabled until contractual approval, staging tests, and tenant-scoped credentials are verified.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sources.map((source) => (
              <article key={source.id} className="rounded-lg border border-border p-4">
                <h3 className="font-semibold">{source.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{source.region} · {source.status.replaceAll("-", " ")}</p>
                <p className="mt-2 text-sm">{source.notes}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Data: {source.capabilities.slice(0, 6).map((v) => v.replaceAll("_", " ")).join(", ")}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
