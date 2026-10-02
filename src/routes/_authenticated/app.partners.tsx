import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { listCrmCompanies } from "@/modules/crm/functions";
export const Route=createFileRoute("/_authenticated/app/partners")({component:Partners});
function Partners(){const t=useTenant();const tenantId=t.tenantId??"";const fn=useServerFn(listCrmCompanies);const q=useQuery({queryKey:["partners-real",tenantId],queryFn:()=>fn({data:{tenantId}}),enabled:!!tenantId,retry:false});const rows=(q.data??[]).filter((p:any)=>["partner","supplier"].includes(p.status));return <AppShell title="Partners & third parties" subtitle="Real CRM companies marked as partners or suppliers."><Card className="overflow-hidden"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Partner</th><th>Industry</th><th>Status</th><th className="pr-4">Source</th></tr></thead><tbody className="divide-y">{rows.map((p:any)=><tr key={p.id}><td className="px-4 py-3 font-medium">{p.name}</td><td>{p.industry||"—"}</td><td><Badge variant="outline">{p.status}</Badge></td><td className="pr-4">{p.source_product_key||"shared CRM"}</td></tr>)}{!rows.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No partner companies yet. Mark a CRM company as partner or supplier.</td></tr>}</tbody></table></Card></AppShell>}
