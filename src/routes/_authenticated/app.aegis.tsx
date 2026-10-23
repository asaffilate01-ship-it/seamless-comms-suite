import {CorrectivePanel} from '@/modules/aegis/CorrectivePanel';
import {ReportsPanel} from '@/modules/aegis/ReportsPanel';
import {CustodyPanel} from '@/modules/aegis/CustodyPanel';
import {FieldPanel} from '@/modules/aegis/FieldPanel';
import {OperationsPanel} from '@/modules/aegis/OperationsPanel';
import {securityAreas} from '@/modules/aegis/suite';
import {createFileRoute,Link} from '@tanstack/react-router';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {AppShell} from '@/components/app/shell';
import {Card,CardContent} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {useTenant} from '@/hooks/useTenant';
import {AgentFactoryPanel} from '@/modules/agent-factory/AgentFactoryPanel';
import {getIntelligenceWorkspace} from '@/modules/intelligence/functions';
import {getAegisFactoryStatus} from '@/modules/aegis/functions';
import {AEGIS_PRODUCT_KEY,aegisCapabilities,aegisStages} from '@/modules/aegis/capabilities';
export const Route=createFileRoute('/_authenticated/app/aegis')({component:Aegis,head:()=>({meta:[{title:'Aegis Command — Omniqora SaaS Factory'},{name:'robots',content:'noindex'}]})});
function Aegis(){const tenant=useTenant(),tenantId=tenant.tenantId??'',statusFn=useServerFn(getAegisFactoryStatus),intelligenceFn=useServerFn(getIntelligenceWorkspace);
 const status=useQuery({queryKey:['aegis-status',tenantId],queryFn:()=>statusFn({data:{tenantId}}),enabled:!!tenantId,retry:false});
 const ai=useQuery({queryKey:['aegis-ai',tenantId],queryFn:()=>intelligenceFn({data:{tenantId,productKey:AEGIS_PRODUCT_KEY}}),enabled:!!tenantId&&status.data?.canConfigure===true,retry:false});
 return <AppShell title="Aegis Command" subtitle="Security operations, powered by Omniqora. Factory implementation workspace."><div className="rounded-xl bg-slate-950 p-7 text-white"><Badge variant="outline" className="text-emerald-200">SaaS Factory · Build in progress</Badge><h2 className="mt-4 text-3xl font-semibold">Every site. Every shift. One accountable operation.</h2><p className="mt-3 max-w-3xl text-slate-300">Reuse Omniqora identity, Geo, dispatch, communications, analytics and governed Intelligence. Agencies are tenants; officers and client contacts are scoped users.</p><div className="mt-5 flex flex-wrap gap-4 text-sm"><Link to="/app/tenant-factory" className="underline">Tenant Factory</Link><Link to="/app/connector-hub" className="underline">Connector Hub</Link><Link to="/app/intelligence" className="underline">AI governance</Link></div></div>
 <Card className="mt-5"><CardContent className="p-5"><h3 className="font-semibold">Verified connection gates</h3>{status.isPending?<p>Checking tenant product and entitlements…</p>:status.error?<p role="alert">{status.error.message}</p>:<><p className="mt-2 text-sm">Source implementation only. No live guard operation, alert delivery or model run is asserted.</p><ul className="mt-3 list-inside list-disc text-sm text-muted-foreground">{status.data?.blockers.map(b=><li key={b}>{b}</li>)}</ul></>}</CardContent></Card>
 <div className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{securityAreas.map(a=><Card key={a.key}><CardContent className="p-4"><h3 className="font-semibold">{a.name}</h3><p className="mt-2 text-sm text-muted-foreground">{a.features}</p></CardContent></Card>)}</div>
 <OperationsPanel key={tenantId} tenantId={tenantId} role={tenant.role??''}/>
 <FieldPanel key={'field-'+tenantId} tenantId={tenantId} role={tenant.role??''}/>
 <CorrectivePanel key={'corrective-'+tenantId} tenantId={tenantId} role={tenant.role??''}/>
 <ReportsPanel key={'reports-'+tenantId} tenantId={tenantId} role={tenant.role??''}/>
 <CustodyPanel key={'custody-'+tenantId} tenantId={tenantId} role={tenant.role??''}/>
 <h3 className="mb-3 mt-8 text-xl font-semibold">Competitor capability map</h3><p className="mb-4 text-sm text-muted-foreground">Vendor-published benchmark: Ctrl Room, TrackTik/Trackforce, Silvertrac, Connecteam and GuardsPro. Requirements below are build targets, not delivered parity.</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{aegisCapabilities.map(c=><Card key={c.key}><CardContent className="p-5"><h4 className="font-semibold">{c.name}</h4><p className="mt-2 text-xs text-muted-foreground">{c.benchmark}</p><p className="mt-4 text-sm"><b>Reuse:</b> {c.shared}</p><p className="mt-3 text-sm text-muted-foreground"><b>Build:</b> {c.gap}</p></CardContent></Card>)}</div>
 <Card className="my-6"><CardContent className="p-5"><h3 className="font-semibold">Delivery stages</h3><ol className="mt-3 list-inside list-decimal space-y-2 text-sm">{aegisStages.map(s=><li key={s}>{s}</li>)}</ol></CardContent></Card>
 {status.data?.canConfigure&&ai.data?<AgentFactoryPanel key={tenantId} tenantId={tenantId} productKey={AEGIS_PRODUCT_KEY} useCases={ai.data.useCases} providers={ai.data.providers} onChanged={()=>ai.refetch()}/>:<p className="text-sm text-muted-foreground">Aegis agents appear after the tenant product and governance gates pass. Configuration is an assessment, not execution or approval.</p>}{ai.error&&<p role="alert">{ai.error.message}</p>}
 </AppShell>}
