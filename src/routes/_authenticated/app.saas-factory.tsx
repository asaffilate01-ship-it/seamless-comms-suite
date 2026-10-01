// @ts-nocheck
import {createFileRoute} from "@tanstack/react-router";
import {SaasFactoryWorkspace} from "@/modules/factory/SaasFactoryWorkspace";

export const Route=createFileRoute("/_authenticated/app/saas-factory")({
  component:SaasFactoryWorkspace,
  head:()=>({meta:[
    {title:"SaaS Factory — Omniqora"},
    {name:"description",content:"Omniqora landlord, tenant, product, add-on and provisioning control plane."},
    {name:"robots",content:"noindex"},
  ]}),
});
