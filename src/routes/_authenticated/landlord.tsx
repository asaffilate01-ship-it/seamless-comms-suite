import {createFileRoute,Link} from "@tanstack/react-router";
import {AppShell} from "@/components/app/shell";
import {Card,CardContent} from "@/components/ui/card";
import {Boxes,Cable,Cpu,GitBranch,Settings,Wrench} from "lucide-react";

export const Route=createFileRoute("/_authenticated/landlord")({component:Landlord,head:()=>({meta:[{title:"Landlord Control Centre — Omniqora"},{name:"robots",content:"noindex"}]})});
const areas=[
 {to:"/app/control-plane",title:"SaaS Factory",text:"Organisations, tenants, product/service catalogue, blueprints and provisioning.",icon:Boxes},
 {to:"/app/platform-kernel",title:"Platform Kernel",text:"Regions, locales, provider bindings, data routes and service credentials.",icon:Cpu},
 {to:"/app/platform-depth",title:"Commercial & Mobile",text:"Plans, subscriptions, metering, Mobile Core, embeds, reporting and telecom.",icon:Wrench},
 {to:"/app/connector-hub",title:"Connector Hub",text:"Providers, channel identities, health, sync, webhooks and reconciliation.",icon:Cable},
 {to:"/app/access-control",title:"Identity & Access",text:"Department teams and resource/document ACLs.",icon:Settings},
 {to:"/app/migration-factory",title:"Migration Factory",text:"Repository audit, adapters, shadow parity, cutover and rollback gates.",icon:GitBranch},
];
function Landlord(){return <AppShell title="Landlord Control Centre" subtitle="Create and operate products, country variants and tenants from one Omniqora control surface."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{areas.map(({to,title,text,icon:Icon})=><Link key={to} to={to as "/app"}><Card className="h-full transition hover:shadow-md"><CardContent className="p-5"><Icon className="h-5 w-5"/><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p></CardContent></Card></Link>)}</div></AppShell>}
