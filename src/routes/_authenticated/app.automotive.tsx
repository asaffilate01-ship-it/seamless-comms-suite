import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app/shell";
import { useTenant } from "@/hooks/useTenant";
import { createAutomotiveAppraisal, createVehiclePassportSnapshot, getAutomotiveOverview, registerAutomotiveVehicle, setAutomotiveAddon } from "@/modules/automotive/automotive.functions";

export const Route = createFileRoute("/_authenticated/app/automotive")({
  component: Automotive,
  head: () => ({ meta: [{ title: "Automotive add-ons — Omniqora" }, { name: "robots", content: "noindex" }] }),
});

function Automotive() {
  const { tenantId, loading, error } = useTenant();
  const queryClient = useQueryClient();
  const load = useServerFn(getAutomotiveOverview);
  const toggle = useServerFn(setAutomotiveAddon);
  const register = useServerFn(registerAutomotiveVehicle);
  const createAppraisal = useServerFn(createAutomotiveAppraisal);
  const createPassport = useServerFn(createVehiclePassportSnapshot);
  const [product, setProduct] = useState<"zivvo"|"autohashi"|"sparesgrid">("zivvo");
  const [form, setForm] = useState({ origin:"uk", vrm:"", vin:"", chassisNumber:"", modelCode:"", make:"", model:"", derivative:"" });

  const overview = useQuery({
    queryKey: ["automotive", tenantId],
    enabled: !!tenantId,
    queryFn: () => load({ data: { tenantId: tenantId! } }),
    retry: false,
  });

  const change = useMutation({
    mutationFn: (input:{product:"zivvo"|"autohashi"|"sparesgrid";addon:any;enabled:boolean}) =>
      toggle({ data: { tenantId: tenantId!, ...input } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey:["automotive",tenantId] }),
  });

  const appraisal = useMutation({
    mutationFn:(vehicleId:string)=>createAppraisal({data:{
      tenantId:tenantId!,product,
      vehicleId,
      requestedItems:["front","front_left","front_right","driver_side","passenger_side","rear","rear_left","rear_right","wheel_front_left","wheel_front_right","wheel_rear_left","wheel_rear_right","dashboard","odometer","driver_seat","passenger_seat","rear_seats","centre_console","headlining","boot","engine_bay","vin_chassis","keys","service_history"],
    }}),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["automotive",tenantId]}),
  });
  const passport = useMutation({
    mutationFn:(vehicleId:string)=>createPassport({data:{tenantId:tenantId!,product,vehicleId}}),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["automotive",tenantId]}),
  });

  const addVehicle = useMutation({
    mutationFn: () => register({ data: {
      tenantId: tenantId!,
      origin: form.origin as "uk"|"japan"|"other",
      vrm: form.vrm || undefined,
      vin: form.vin || undefined,
      chassisNumber: form.chassisNumber || undefined,
      modelCode: form.modelCode || undefined,
      make: form.make,
      model: form.model,
      derivative: form.derivative || undefined,
    }}),
    onSuccess: () => {
      setForm({ origin:"uk",vrm:"",vin:"",chassisNumber:"",modelCode:"",make:"",model:"",derivative:"" });
      queryClient.invalidateQueries({ queryKey:["automotive",tenantId] });
    },
  });

  const data = overview.data;
  const current = data?.products.find(p => p.product === product);

  return <AppShell title="Automotive intelligence" subtitle="Shared add-ons for Zivvo, Autohashi and SparesGrid">
    <div className="mx-auto max-w-7xl space-y-6">
      {loading ? <p role="status">Loading workspace…</p> : error ? <p role="alert">{error}</p> : null}
      {overview.error && <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">{overview.error.message}</p>}

      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-xl font-semibold">Product add-ons</h2><p className="text-sm text-muted-foreground">Core modules remain enabled. Optional modules can be activated per product and tenant.</p></div>
          <select className="rounded border bg-background p-2" value={product} onChange={e=>setProduct(e.target.value as typeof product)}>
            <option value="zivvo">Zivvo</option><option value="autohashi">Autohashi</option><option value="sparesgrid">SparesGrid</option>
          </select>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {current?.addons.map(a => <article key={a.addon} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{a.addon.replaceAll("_"," ")}</h3><p className="text-xs uppercase text-muted-foreground">{a.mode}</p></div>
            <button className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={a.mode==="core"||change.isPending} onClick={()=>change.mutate({product,addon:a.addon,enabled:!a.enabled})}>{a.enabled?"Enabled":"Enable"}</button></div>
          </article>)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-xl font-semibold">Register vehicle identity</h2>
          <p className="mt-1 text-sm text-muted-foreground">Supports UK VRM/VIN and Japanese frame or chassis identifiers.</p>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();addVehicle.mutate();}}>
            <select className="rounded border bg-background p-2" value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})}><option value="uk">UK</option><option value="japan">Japan</option><option value="other">Other</option></select>
            <input className="rounded border bg-background p-2" placeholder="VRM" value={form.vrm} onChange={e=>setForm({...form,vrm:e.target.value})}/>
            <input className="rounded border bg-background p-2" placeholder="VIN" value={form.vin} onChange={e=>setForm({...form,vin:e.target.value})}/>
            <input className="rounded border bg-background p-2" placeholder="Chassis / frame number" value={form.chassisNumber} onChange={e=>setForm({...form,chassisNumber:e.target.value})}/>
            <input className="rounded border bg-background p-2" placeholder="Model code" value={form.modelCode} onChange={e=>setForm({...form,modelCode:e.target.value})}/>
            <input required className="rounded border bg-background p-2" placeholder="Make" value={form.make} onChange={e=>setForm({...form,make:e.target.value})}/>
            <input required className="rounded border bg-background p-2" placeholder="Model" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/>
            <input className="rounded border bg-background p-2 sm:col-span-2" placeholder="Derivative / trim" value={form.derivative} onChange={e=>setForm({...form,derivative:e.target.value})}/>
            <button className="rounded bg-primary px-4 py-2 text-primary-foreground sm:col-span-2 disabled:opacity-50" disabled={addVehicle.isPending}>Register vehicle</button>
          </form>
          {addVehicle.error&&<p role="alert" className="mt-3 text-sm text-destructive">{addVehicle.error.message}</p>}
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-xl font-semibold">Evidence privacy</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Verified Media preserves original evidence, hashes it and records trusted timestamps. Precise geolocation is deliberately excluded from this automotive capture workflow.</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded bg-muted p-3"><dt className="text-muted-foreground">Hash</dt><dd className="font-medium">SHA-256</dd></div><div className="rounded bg-muted p-3"><dt className="text-muted-foreground">Location</dt><dd className="font-medium">Not captured</dd></div><div className="rounded bg-muted p-3"><dt className="text-muted-foreground">Original media</dt><dd className="font-medium">Preserved</dd></div><div className="rounded bg-muted p-3"><dt className="text-muted-foreground">Evidence history</dt><dd className="font-medium">Append-only</dd></div></dl>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Recent vehicles</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Vehicle</th><th>Origin</th><th>VRM</th><th>VIN / chassis</th><th>Actions</th></tr></thead><tbody>{data?.vehicles.map((v:any)=><tr key={v.vehicle_id} className="border-b last:border-0"><td className="py-3">{v.make} {v.model} {v.derivative??""}</td><td>{v.origin}</td><td>{v.vrm??"—"}</td><td>{v.vin??v.chassis_number??"—"}</td><td className="space-x-2"><button className="rounded border px-2 py-1 text-xs disabled:opacity-50" disabled={appraisal.isPending} onClick={()=>appraisal.mutate(v.vehicle_id)}>Remote appraisal</button><button className="rounded border px-2 py-1 text-xs disabled:opacity-50" disabled={passport.isPending} onClick={()=>passport.mutate(v.vehicle_id)}>Passport snapshot</button></td></tr>)}</tbody></table></div>
        {!data?.vehicles.length&&<p className="mt-3 text-sm text-muted-foreground">No vehicles registered in this workspace yet.</p>}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">Recent evidence</h2><div className="mt-4 space-y-2">{data?.evidence.map((e:any)=><div key={e.evidence_id} className="rounded bg-muted p-3 text-sm"><b>{e.capture_item}</b><div className="text-xs text-muted-foreground">{e.kind} · {e.source} · location captured: {String(e.location_captured)}</div></div>)}{!data?.evidence.length&&<p className="text-sm text-muted-foreground">No automotive evidence received.</p>}</div></div>
        <div className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">Integration events</h2><div className="mt-4 space-y-2">{data?.inboundEvents.map((e:any)=><div key={e.event_id} className="rounded bg-muted p-3 text-sm"><b>{e.event_type}</b><div className="text-xs text-muted-foreground">{e.product} · {e.status}</div></div>)}{!data?.inboundEvents.length&&<p className="text-sm text-muted-foreground">No automotive webhook events received.</p>}</div></div>
      </section>
    </div>
  </AppShell>;
}
