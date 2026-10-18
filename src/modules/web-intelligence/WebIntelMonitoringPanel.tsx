import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  configureWebIntelMonitor,
  type WebIntelChange,
  type WebIntelMonitor,
  type WebIntelSource,
} from "./functions";

type IntervalHours = 24 | 72 | 168;
type RetentionDays = 7 | 30 | 90;
type Props = {
  tenantId: string;
  productKey: string;
  tenantRole: string | null;
  entitled: boolean;
  isPlatformAdmin: boolean;
  sources: WebIntelSource[];
  monitors: WebIntelMonitor[];
  changes: WebIntelChange[];
  onChanged: () => Promise<unknown>;
};

const readableTime = (timestamp: string | null) =>
  timestamp ? new Date(timestamp).toLocaleString() : "Never";

function kindLabel(value: WebIntelChange["change_kind"]) {
  switch (value) {
    case "initial": return "First snapshot";
    case "changed": return "Content changed";
    case "unchanged": return "No content change";
  }
}

export function WebIntelMonitoringPanel({
  tenantId, productKey, tenantRole, entitled, isPlatformAdmin,
  sources, monitors, changes, onChanged,
}: Props) {
  const save = useServerFn(configureWebIntelMonitor);
  const [sourceId, setSourceId] = useState("");
  const source = sources.find((item) => item.id === sourceId) ?? sources[0];
  const existing = monitors.find((item) => item.source_id === source?.id);
  const [intervalHours, setIntervalHours] = useState<IntervalHours>(168);
  const [retentionDays, setRetentionDays] = useState<RetentionDays>(30);
  const [busy, setBusy] = useState("");
  const canManage = entitled &&
    (isPlatformAdmin || ["owner", "admin"].includes(tenantRole || ""));

  useEffect(() => {
    setIntervalHours(existing?.interval_hours ?? 168);
    setRetentionDays(existing?.retention_days ?? 30);
  }, [source?.id, existing?.interval_hours, existing?.retention_days]);

  async function configure(
    targetSource: string, interval: IntervalHours,
    retention: RetentionDays, enabled: boolean,
  ) {
    setBusy(targetSource);
    try {
      await save({ data: {
        tenantId, productKey, sourceId: targetSource,
        intervalHours: interval, retentionDays: retention, enabled,
      } });
      toast.success(enabled
        ? "Schedule enabled. Due jobs queue only when the approved worker polls."
        : "Monitor saved as paused; no scheduled jobs will be created.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change monitor");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Phase 2 · Source monitoring and changes</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Poll-driven schedules, source fingerprints and in-app change evidence.
            Changes never automatically trigger AI tools, emails, or business actions.
          </p>
        </div>
        <Badge variant="outline">Opt-in per source · max 10 monitors per tenant</Badge>
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="font-medium">Configure a reviewed source</h4>
        <label className="block text-sm">
          Public source
          <select aria-label="Source to monitor"
            value={source?.id ?? ""}
            onChange={(event) => setSourceId(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
            {sources.length === 0 && <option value="">No independently approved sources</option>}
            {sources.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {item.hostname}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Request frequency
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={intervalHours}
              onChange={(event) => setIntervalHours(Number(event.target.value) as IntervalHours)}>
              <option value={24}>Daily (every 24 hours)</option>
              <option value={72}>Every 3 days</option>
              <option value={168}>Weekly</option>
            </select>
          </label>
          <label className="block text-sm">
            Text retention
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={retentionDays}
              onChange={(event) => setRetentionDays(Number(event.target.value) as RetentionDays)}>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canManage || !source || !!busy}
            onClick={() => source && configure(source.id, intervalHours, retentionDays, false)}>
            Save paused
          </Button>
          <Button disabled={!canManage || !source || !!busy}
            onClick={() => source && configure(source.id, intervalHours, retentionDays, true)}>
            {existing?.enabled ? "Update enabled schedule" : "Enable scheduled checks"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enabling a monitor makes its first check due when a separately deployed
          worker next polls. It does not activate the worker itself. All requests still
          require an approved source, an active tenant product and entitlement. Pausing
          prevents future automatic queueing but does not cancel already queued jobs.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-2">
          <h4 className="font-medium">Configured monitors</h4>
          {monitors.length === 0 && (
            <p className="text-sm text-muted-foreground">No scheduled source checks configured.</p>
          )}
          {monitors.map((monitor) => {
            const item = sources.find((candidate) => candidate.id === monitor.source_id);
            return (
              <div key={monitor.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item?.name ?? "Previously reviewed source"}</strong>
                  <Badge variant="outline">
                    {monitor.enabled ? "Enabled · worker required" : "Paused"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {monitor.interval_hours === 24 ? "Daily" :
                   monitor.interval_hours === 72 ? "Every 3 days" : "Weekly"}
                  {" · "}{monitor.retention_days}-day text retention
                </p>
                <p className="text-xs text-muted-foreground">
                  Next due: {readableTime(monitor.next_due_at)} ·
                  Last captured: {readableTime(monitor.last_observed_at)}
                </p>
                {monitor.enabled && (
                  <Button variant="outline" size="sm" disabled={!canManage || !!busy}
                    onClick={() => configure(
                      monitor.source_id, monitor.interval_hours,
                      monitor.retention_days, false)}>
                    Pause future checks
                  </Button>
                )}
              </div>
            );
          })}
        </section>
        <section className="space-y-2">
          <h4 className="font-medium">Change evidence (metadata only)</h4>
          {changes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No document comparisons yet. The first successful snapshot is a baseline.
            </p>
          )}
          {changes.map((change) => (
            <div key={change.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {sources.find((item) => item.id === change.source_id)?.name
                    ?? "Previously reviewed source"}
                </strong>
                <Badge variant="outline">{kindLabel(change.change_kind)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {readableTime(change.detected_at)} ·
                Fingerprint {change.current_sha256.slice(0, 12)}…
              </p>
              {change.change_kind === "changed" &&
                <p className="text-xs text-muted-foreground">
                  Previous fingerprint: {change.previous_sha256?.slice(0, 12) ?? "—"}…
                  Content has changed, but no business action has been taken.
                </p>}
            </div>
          ))}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Content bodies expire after the configured 7/30/90-day period (30 days
        for manual jobs). Fingerprint metadata is available for up to 120 days.
        Automatic removal requires the private worker to continue polling.
      </p>
    </section>
  );
}
