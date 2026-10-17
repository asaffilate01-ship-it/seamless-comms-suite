import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {Card,CardContent} from "@/components/ui/card";
import {toast} from "sonner";
import type {ConnectorDiscovery} from "./connector-intelligence";
import {assessSandboxPreparation,proposeMcpManifest,SANDBOX_CHECKLIST,
  type SandboxChecklistKey} from "./connector-qualification";

/** Proposal-only UI: no persisted status, no secrets, no server actions or remote tools. */
export function ConnectorQualificationPanel({discovery}:{discovery:ConnectorDiscovery}){
  const [providerKey,setProviderKey]=useState("sample-provider");
  const [proposal,setProposal]=useState("");
  const [error,setError]=useState("");
  const [checks,setChecks]=useState<Partial<Record<SandboxChecklistKey,boolean>>>({});
  const readiness=assessSandboxPreparation(checks);
  function generate(){
    try {
      const result=proposeMcpManifest(discovery,providerKey.trim());
      setProposal(JSON.stringify(result,null,2));setError("");
      toast.success("MCP tool proposal generated locally; no tools were installed");
    }catch(e){
      setProposal("");setError(e instanceof Error?e.message:"Proposal could not be generated");
    }
  }
  async function copy(){
    try{await navigator.clipboard.writeText(proposal);toast.success("Unverified proposal copied");}
    catch{toast.error("Clipboard unavailable; manually select the proposal");}
  }
  return <Card><CardContent className="space-y-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">MCP tool proposal and sandbox review</h3>
      <Badge variant="outline">Unverified · execution disabled</Badge>
    </div>
    <p className="text-xs text-muted-foreground">
      This is a planning aid, not a live MCP server. Only generic GET/HEAD/OPTIONS paths are proposed
      as read-only tools. Write operations and potentially sensitive endpoints are quarantined.
      No host, authentication, cookies, credentials, samples or customer data are exported.
    </p>
    <label className="block text-sm font-medium">Connector key
      <Input className="mt-1" value={providerKey} onChange={e=>{setProviderKey(e.target.value);setProposal("");}}
        maxLength={48} placeholder="e.g. carrier-sandbox"/>
    </label>
    <Button variant="outline" onClick={generate}>Generate review-only MCP proposal</Button>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {proposal&&<div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Proposal JSON (no executable transport)</p>
        <Button size="sm" variant="outline" onClick={copy}>Copy JSON</Button>
      </div>
      <Textarea readOnly aria-label="Unverified MCP proposal JSON" value={proposal} className="min-h-52 font-mono text-xs"/>
    </div>}
    <div className="border-t pt-4">
      <h4 className="text-sm font-semibold">Supplier sandbox preparation checklist</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Self-checked items are not provider verification receipts or production authorisation.
      </p>
      <fieldset className="mt-3 space-y-2">
        <legend className="sr-only">Sandbox preparation</legend>
        {SANDBOX_CHECKLIST.map(item=><label key={item.key} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={checks[item.key]===true}
            onChange={e=>setChecks(current=>({...current,[item.key]:e.target.checked}))}/>
          <span>{item.label}</span>
        </label>)}
      </fieldset>
      <p className="mt-3 text-sm">{readiness.completed}/{readiness.total} preparation items self-checked · <b>Independent review required</b></p>
      <p className="mt-1 text-xs text-muted-foreground">No supplier API access, tenant grant, token storage, test probe or production activation can be started from this panel.</p>
    </div>
  </CardContent></Card>;
}
