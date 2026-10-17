import {useState} from "react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {toast} from "sonner";
import {generateReviewOnlyConnector,inspectConnectorSource,type ConnectorDiscovery,type ImportKind} from "./connector-intelligence";

const demonstration = JSON.stringify({
  openapi:"3.0.3",info:{title:"Example quote sandbox"},servers:[{url:"https://api.example.test"}],
  paths:{"/v1/quotes":{post:{operationId:"createQuote",
    requestBody:{content:{"application/json":{schema:{type:"object",properties:{pickup:{type:"string"},dropoff:{type:"string"}}}}}},
    responses:{"200":{content:{"application/json":{schema:{type:"object",properties:{quoteId:{type:"string"},price:{type:"number"}}}}}}}}}},
},null,2);

/** No upload, persistence, model call, network request, credential handling or executable connector. */
export function ConnectorIntelligenceWorkbench(){
  const [kind,setKind]=useState<ImportKind>("openapi");
  const [source,setSource]=useState("");
  const [report,setReport]=useState<ConnectorDiscovery|null>(null);
  const [draft,setDraft]=useState("");
  const [error,setError]=useState("");
  function analyse(){
    try {
      const next=inspectConnectorSource(kind,source);
      const generated=generateReviewOnlyConnector(next);
      setReport(next);setDraft(generated);setError("");
      toast.success("Sanitised metadata extracted locally. No API was called.");
    } catch(e){
      setReport(null);setDraft("");setError(e instanceof Error?e.message:"Import failed");
    } finally {
      // HAR files can contain credentials: remove raw source immediately after parsing.
      setSource("");
    }
  }
  async function copyDraft(){
    try {await navigator.clipboard.writeText(draft);toast.success("Review-only scaffold copied");}
    catch {toast.error("Clipboard unavailable; select the draft text to copy it");}
  }
  return <Card className="mt-6"><CardContent className="space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">Connector Intelligence — Phase 1</h2>
        <p className="mt-1 text-xs text-muted-foreground">Import an authorised OpenAPI 3.x JSON specification or redacted HAR file; inspect structural endpoints and generate inert TypeScript for independent review.</p></div>
      <Badge variant="outline">Review-only · local processing</Badge>
    </div>
    <p className="text-sm text-muted-foreground">Source data is processed in this browser only. Nothing is uploaded, saved or sent to an AI model. Avoid real customer data and use a sanitised capture. Unsupported YAML must be converted to JSON first.</p>
    <label className="block text-sm font-medium">Input format
      <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={kind} onChange={e=>{setKind(e.target.value as ImportKind);setReport(null);setDraft("");setError("");}}>
        <option value="openapi">OpenAPI 3.x (JSON)</option><option value="har">Browser HAR (JSON)</option>
      </select>
    </label>
    <label className="block text-sm font-medium">Paste specification or sanitised capture
      <Textarea className="mt-1 min-h-40 font-mono text-xs" value={source} onChange={e=>setSource(e.target.value)} placeholder="Paste JSON; maximum 300,000 characters" maxLength={300_000}/>
    </label>
    <div className="flex flex-wrap gap-2">
      <Button onClick={analyse} disabled={!source.trim()}>Analyse locally</Button>
      <Button variant="outline" onClick={()=>{setKind("openapi");setSource(demonstration);setReport(null);setDraft("");setError("");}}>Load safe example</Button>
      <Button variant="outline" onClick={()=>{setSource("");setReport(null);setDraft("");setError("");}}>Clear</Button>
    </div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {report&&<div className="space-y-3 rounded-lg border p-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Sanitised discovery</h3>
        <Badge variant="outline">{report.operations.length} proposed endpoints · not connected</Badge></div>
      <p className="text-xs text-muted-foreground">HTTPS host (informational only): {report.sourceHost??"not specified"} · Auth patterns: {report.authentication.join(", ")||"unknown"}</p>
      <ul className="space-y-1 text-sm">{report.operations.slice(0,20).map(op=><li key={op.id} className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">{op.method} {op.path} · query [{op.queryFields.join(", ")}] · body [{op.requestFields.join(", ")}]</li>)}</ul>
      {report.operations.length>20&&<p className="text-xs text-muted-foreground">First 20 shown; exported scaffold includes all permitted operations.</p>}
      {report.warnings.map((warning,i)=><p key={i} className="text-xs text-muted-foreground">• {warning}</p>)}
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Generated TypeScript draft</h3>
        <Button size="sm" variant="outline" onClick={copyDraft}>Copy draft</Button></div>
      <Textarea aria-label="Generated review-only TypeScript" className="min-h-48 font-mono text-xs" readOnly value={draft}/>
      <p className="text-xs text-muted-foreground">All generated methods deliberately throw REVIEW_ONLY. No credentials, live API calls, supplier approvals, migrations or tenant integrations are created.</p>
    </div>}
  </CardContent></Card>;
}
