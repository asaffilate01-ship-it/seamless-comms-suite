// @ts-nocheck
import {createFileRoute} from "@tanstack/react-router";
import {TenantAddonsWorkspace} from "@/modules/factory/TenantAddonsWorkspace";

export const Route=createFileRoute("/_authenticated/app/addons")({
  component:TenantAddonsWorkspace,
  head:()=>({meta:[
    {title:"Products & Add-ons — Omniqora"},
    {name:"description",content:"Manage reusable Omniqora services for this SaaS tenant."},
    {name:"robots",content:"noindex"},
  ]}),
});
