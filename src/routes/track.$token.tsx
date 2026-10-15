import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, RefreshCw, ShieldCheck, Truck } from "lucide-react";

type TrackingSnapshot = {
  subject?: { type: string; id: string };
  status?: string | null;
  etaAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  heading?: number | null;
  progress?: number | null;
  updatedAt?: string | null;
};
export const Route = createFileRoute("/track/$token")({
  component: PublicTracking,
  head: () => ({ meta: [
    { title: "Delivery tracking · Omniqora" },
    { name: "robots", content: "noindex,nofollow,noarchive" },
    { name: "referrer", content: "no-referrer" }
  ] })
});
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
const prettyTime = (value: string | null | undefined) => {
  if (!value) return "Not yet available";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not yet available";
};
function PublicTracking() {
  const { token } = Route.useParams();
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let mounted = true;
    let active: AbortController | null = null;
    let unavailable = false;
    const refresh = async () => {
      if (unavailable) return;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch("/api/public/track/" + encodeURIComponent(token), {
          signal: controller.signal,
          cache: "no-store",
          headers: { accept: "application/json" }
        });
        if (!response.ok) {
          if (response.status === 404) unavailable = true;
          throw new Error("This tracking link is unavailable or has expired.");
        }
        const payload = await response.json() as TrackingSnapshot;
        if (mounted) { setSnapshot(payload); setError(""); }
      } catch (cause) {
        if (mounted && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Tracking temporarily unavailable");
        }
      } finally {
        if (mounted && !controller.signal.aborted) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20_000);
    return () => { mounted = false; active?.abort(); window.clearInterval(timer); };
  }, [token, refreshKey]);
  const latitude = Number(snapshot?.latitude), longitude = Number(snapshot?.longitude);
  const coordinatesValid = snapshot?.latitude != null && snapshot?.longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const mapsUrl = coordinatesValid
    ? "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(String(latitude)) +
      "&mlon=" + encodeURIComponent(String(longitude)) +
      "#map=15/" + encodeURIComponent(String(latitude)) + "/" + encodeURIComponent(String(longitude))
    : "";
  const progress = Math.min(100, Math.max(0, Number(snapshot?.progress ?? 0)));
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground">
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Omniqora Track</p>
          <h1 className="mt-1 text-2xl font-bold">Your delivery status</h1></div>
        <Truck className="h-8 w-8 text-primary" aria-hidden="true" />
      </header>
      <section aria-live="polite" className="rounded-xl border bg-card p-5 shadow-sm">
        {loading && !snapshot ? <p>Loading tracking status…</p> : error && !snapshot
          ? <p role="alert">{error}</p>
          : <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm text-muted-foreground">Current status</p>
                <p className="mt-1 text-xl font-semibold">{label(snapshot?.status ?? "pending")}</p></div>
              <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={() => setRefreshKey(v => v + 1)}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
            <div><div className="mb-2 flex justify-between text-sm"><span>Progress</span><span>{Math.round(progress)}%</span></div>
              <div role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width: progress + "%"}} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-sm text-muted-foreground">Estimated arrival</p><p className="font-medium">{prettyTime(snapshot?.etaAt)}</p></div>
              <div><p className="text-sm text-muted-foreground">Last update</p><p className="font-medium">{prettyTime(snapshot?.updatedAt)}</p></div>
            </div>
            {coordinatesValid && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline">
              <MapPin className="h-4 w-4" /> Open location in OpenStreetMap
            </a>}
            {error && <p role="status" className="text-sm text-muted-foreground">Previous status shown. {error}</p>}
          </div>}
      </section>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        This private link automatically refreshes while the page is open. Location is shown only if shared by the delivery operator.
        Do not forward the link to anyone who should not see the delivery.
      </p>
    </div>
  </main>;
}
