import { useState } from "react";
import { automotiveSources } from "@/modules/automotive/source-catalogue";
import {
  HISTORY_REQUIRED_AREAS, type VehicleHistoryRegion,
} from "@/modules/automotive/vehicle-history-intelligence";

/** Read-only provider catalogue: no vendor claims, charges or auto-activation. */
export function VehicleHistorySourcesPanel() {
  const [region, setRegion] = useState<VehicleHistoryRegion>("GB");
  const sourceRegion = region === "GB" ? "UK" : region === "JP" ? "Japan" : "Global";
  const sources = automotiveSources.filter((source) =>
    source.region === sourceRegion || source.region === "Global",
  );

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Vehicle history & evidence sources</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Provider inventory only. A registered data source is not proof that Zivvo,
        AutoHashi or SparesGrid has an active licensed connection. Vehicle Passport
        results must distinguish verified findings, gaps and stale evidence.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Vehicle history region">
        {(["GB", "DE", "JP"] as VehicleHistoryRegion[]).map((value) => (
          <button key={value} type="button" aria-pressed={region === value}
            onClick={() => setRegion(value)}
            className={"rounded-lg border px-4 py-2 text-sm " + (
              region === value ? "border-foreground bg-muted font-semibold" : "border-border"
            )}>
            {value === "GB" ? "United Kingdom" : value === "DE" ? "Germany" : "Japan"}
          </button>
        ))}
      </div>
      <h3 className="mt-4 font-medium">Evidence areas requiring independent verification</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {HISTORY_REQUIRED_AREAS[region].map((area) => (
          <span key={area} className="rounded-md bg-muted px-3 py-1.5 text-xs">
            {area.replaceAll("_", " ")}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Missing coverage remains Unknown; it is never a clean result. Germany FIN/HSN/TSN
        identity parsing is not provenance verification. Precise vehicle geolocation
        is intentionally excluded from appraisal evidence.
      </p>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Data source catalogue ({sources.length} candidates; no live status implied)
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {sources.map((source) => (
            <article key={source.id} className="rounded-lg border border-border p-3">
              <h4 className="font-semibold">{source.name}</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.region} - {source.status.replaceAll("-", " ")}
              </p>
              <p className="mt-2 text-sm">{source.notes}</p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
