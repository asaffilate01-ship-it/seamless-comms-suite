import {createFileRoute} from '@tanstack/react-router';
import {AppShell} from '@/components/app/shell';
import {useTenant} from '@/hooks/useTenant';
import {SalesWorkspace} from '@/modules/sales/workspace';

export const Route=createFileRoute('/_authenticated/app/sales')({
 component:SalesPage,
 head:()=>({meta:[{title:'Omniqora Sales'},{name:'robots',content:'noindex'}]}),
});
function SalesPage(){
 const {tenantId}=useTenant();
 return tenantId?<SalesWorkspace key={tenantId} tenantId={tenantId}/>:<AppShell title="Omniqora Sales"><p>Select an active tenant to open its sales workspace.</p></AppShell>;
}
