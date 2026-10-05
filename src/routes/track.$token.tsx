import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock3, MapPin, Navigation, PackageCheck, Phone, Route as RouteIcon, ShieldCheck, Star, UserRound } from "lucide-react";

export const Route=createFileRoute("/track/$token")({
  head:()=>({meta:[
    {title:"Live tracking"},
    {name:"description",content:"Secure, expiring live status and ETA tracking."},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
  component:PublicTrackingPage,
});

type TrackingData={
  subject?:{type:string;id:string};
  status?:string;
  etaAt?:string|null;
  latitude?:number|null;
  longitude?:number|null;
  heading?:number|null;
  progress?:number|null;
  revision?:number;
  updatedAt?:string|null;
  driverName?:string|null;
  driverPhoneMasked?:string|null;
  vehicle?:string|null;
  nextStop?:string|null;
  message?:string|null;
  pod?:boolean;
  ratingEnabled?:boolean;
  error?:string;
};

type BrandData={
  displayName?:string;
  logoUrl?:string|null;
  supportEmail?:string|null;
  supportPhone?:string|null;
  websiteUrl?:string|null;
  poweredBy?:string|null;
  theme?:Record<string,unknown>;
};

function PublicTrackingPage(){
  const{token}=Route.useParams();
  const[data,setData]=useState<TrackingData|null>(null);
  const[brand,setBrand]=useState<BrandData|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    async function loadBrand(){
      try{
        const response=await fetch("/api/public/branding",{headers:{"accept":"application/json"}});
        if(response.ok&&active)setBrand(await response.json());
      }catch{}
    }
    loadBrand();
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    let active=true;
    let timer:number|undefined;
    async function load(){
      try{
        const response=await fetch("/api/public/track/"+encodeURIComponent(token),{
          headers:{"accept":"application/json"},cache:"no-store"
        });
        const body=await response.json() as TrackingData;
        if(!active)return;
        if(!response.ok){
          setError(body.error||"This tracking link is unavailable.");
          setData(null);
        }else{
          setData(body);setError("");
        }
      }catch{
        if(active)setError("Live tracking is temporarily unavailable.");
      }finally{
        if(active)setLoading(false);
      }
    }
    load();
    timer=window.setInterval(load,15000);
    return()=>{active=false;if(timer)window.clearInterval(timer);};
  },[token]);

  const statusLabel=useMemo(()=>friendlyStatus(data?.status),[data?.status]);
  const mapUrl=data?.latitude!=null&&data?.longitude!=null
    ?"https://www.google.com/maps?q="+encodeURIComponent(String(data.latitude)+","+String(data.longitude))
    :null;
  const primary=String((brand?.theme as any)?.primaryColour||(brand?.theme as any)?.primary||"#111827");

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {brand?.logoUrl?<img src={brand.logoUrl} alt="" className="h-10 max-w-40 object-contain"/>:<div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card"><RouteIcon className="h-5 w-5"/></div>}
          <div><div className="font-semibold">{brand?.displayName||"Live tracking"}</div><div className="text-xs text-muted-foreground">Secure customer tracking</div></div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4"/>Signed, expiring link</div>
      </header>

      {loading?<div className="mt-8 rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading live status…</div>:
      error?<div className="mt-8 rounded-2xl border bg-card p-8 text-center"><div className="font-semibold">Tracking unavailable</div><p className="mt-2 text-sm text-muted-foreground">{error}</p></div>:
      data&&<>
        <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Current status</div>
              <h1 className="mt-2 font-display text-3xl font-semibold">{statusLabel}</h1>
              {data.message&&<p className="mt-2 text-sm text-muted-foreground">{data.message}</p>}
            </div>
            <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:primary}}/>
              Live
            </div>
          </div>

          {typeof data.progress==="number"&&<div className="mt-7">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Progress</span><span>{Math.round(data.progress)}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{width:Math.max(0,Math.min(100,data.progress))+"%",backgroundColor:primary}}/></div>
          </div>}

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {data.etaAt&&<Info icon={Clock3} label="Estimated arrival" value={formatEta(data.etaAt)}/>}
            {data.nextStop&&<Info icon={MapPin} label="Next stop" value={data.nextStop}/>}
            {data.driverName&&<Info icon={UserRound} label="Driver / agent" value={data.driverName}/>}
            {data.vehicle&&<Info icon={Navigation} label="Vehicle" value={data.vehicle}/>}
            {data.driverPhoneMasked&&<Info icon={Phone} label="Contact" value={data.driverPhoneMasked}/>}
            {data.pod&&<Info icon={PackageCheck} label="Proof" value="Completed"/>}
          </div>

          {mapUrl&&<a href={mapUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted">
            <MapPin className="mr-2 h-4 w-4"/>View live location
          </a>}
        </section>

        {data.ratingEnabled&&<section className="mt-4 rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><Star className="h-4 w-4"/><div className="font-medium">Delivery/service completed</div></div><p className="mt-1 text-sm text-muted-foreground">A feedback request can be sent through the tenant's configured NPS/CSAT journey.</p></section>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{data.updatedAt?"Updated "+new Date(data.updatedAt).toLocaleTimeString():"Waiting for first live update"}</span>
          <span>{brand?.poweredBy||"Powered by Omniqora"}</span>
        </div>
      </>}

      {(brand?.supportEmail||brand?.supportPhone)&&<footer className="mt-10 border-t pt-5 text-xs text-muted-foreground">Need help? {brand.supportEmail&&<a className="underline" href={"mailto:"+brand.supportEmail}>{brand.supportEmail}</a>}{brand.supportEmail&&brand.supportPhone?" · ":""}{brand.supportPhone&&<a className="underline" href={"tel:"+brand.supportPhone}>{brand.supportPhone}</a>}</footer>}
    </div>
  </main>;
}

function Info({icon:Icon,label,value}:{icon:typeof Clock3;label:string;value:string}){
  return <div className="rounded-xl border bg-background p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4"/>{label}</div><div className="mt-2 font-medium">{value}</div></div>;
}
function friendlyStatus(status?:string){if(!status)return"Preparing";const map:Record<string,string>={draft:"Preparing",unassigned:"Preparing",offered:"Finding your driver",assigned:"Driver assigned",accepted:"Accepted",en_route:"On the way",en_route_pickup:"Heading to pickup",arrived:"Arrived",arrived_pickup:"At pickup",collected:"Collected",en_route_dropoff:"Heading to destination",arrived_dropoff:"At destination",in_progress:"In progress",completed:"Completed",failed:"Needs attention",cancelled:"Cancelled"};return map[status]||status.replaceAll("_"," ");}
function formatEta(value:string){const date=new Date(value);return date.toLocaleString(undefined,{weekday:"short",hour:"2-digit",minute:"2-digit"});}
