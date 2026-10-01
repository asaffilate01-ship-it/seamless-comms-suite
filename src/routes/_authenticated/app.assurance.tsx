// @ts-nocheck
import {createFileRoute} from "@tanstack/react-router";
import {AssuranceWorkspace} from "@/modules/assurance/AssuranceWorkspace";

export const Route=createFileRoute("/_authenticated/app/assurance")({
  component:AssuranceWorkspace,
  head:()=>({meta:[
    {title:"Assurance & Transactions — Omniqora"},
    {name:"description",content:"Reusable full audit, compliance, M&A/carve-out and accounting workspaces."},
    {name:"robots",content:"noindex"},
  ]}),
});
