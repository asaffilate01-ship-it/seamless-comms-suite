import {useState} from 'react';
import type {ReactNode} from 'react';
import {Link} from '@tanstack/react-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {RefreshCw,Plus,ChevronUp,ChevronDown,Trash2,ShieldCheck} from 'lucide-react';
import {AppShell} from '@/components/app/shell';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Card,CardContent} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {createProspectList} from '@/modules/shared-engines/functions';
import {getSalesWorkspace,createSalesSequence,setSalesSequenceStatus,enrolSalesPerson,prepareSalesActions,completeSalesAction,approveSalesContent,controlSalesEnrolment,recordSalesOutcome,saveSalesProspect} from './functions';
import type {SalesStep,SalesAction} from './contracts';

const selectClass='h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50';
const initialSteps:SalesStep[]=[
 {kind:'call',title:'Discovery call task',body:'Review the prospect and record the outcome of a permitted manual call.',delayMinutes:0},
 {kind:'task',title:'Prepare the agreed follow-up',body:'Use the discovery notes to prepare the next sales action.',delayMinutes:1440},
];
const statusLabels:Record<SalesAction['status'],string>={manual_open:'Manual action open',pending_review:'Content review required',approved_blocked:'Content approved · delivery blocked',completed:'Completed',cancelled:'Cancelled'};
const readable=(value:string)=>value.replaceAll('_',' ');
const date=(value:string|null)=>value?new Date(value).toLocaleString():'—';
function Field({label,children}:{label:string;children:ReactNode}){return <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;}
function Panel({title,children}:{title:string;children:ReactNode}){return <Card><CardContent className="space-y-4 p-5"><h2 className="text-lg font-semibold">{title}</h2>{children}</CardContent></Card>;}
function Empty({children}:{children:ReactNode}){return <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">{children}</p>;}

// The route keys this component by tenantId. Switching tenants clears local
// selections, draft text, completion notes and manual outcome evidence.
export function SalesWorkspace({tenantId}:{tenantId:string}){
 const queryClient=useQueryClient();
 const get=useServerFn(getSalesWorkspace),createList=useServerFn(createProspectList),saveProspect=useServerFn(saveSalesProspect);
 const createSequence=useServerFn(createSalesSequence),setSequenceStatus=useServerFn(setSalesSequenceStatus),enrol=useServerFn(enrolSalesPerson);
 const prepare=useServerFn(prepareSalesActions),complete=useServerFn(completeSalesAction),approve=useServerFn(approveSalesContent);
 const control=useServerFn(controlSalesEnrolment),record=useServerFn(recordSalesOutcome);
 const [productKey,setProductKey]=useState(''),[searchText,setSearchText]=useState(''),[search,setSearch]=useState('');
 const [tab,setTab]=useState('prospects'),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [personId,setPersonId]=useState(''),[listId,setListId]=useState(''),[listName,setListName]=useState('');
 const [fit,setFit]=useState(50),[intent,setIntent]=useState(50),[engagement,setEngagement]=useState(50),[reason,setReason]=useState('');
 const [sequenceName,setSequenceName]=useState(''),[steps,setSteps]=useState<SalesStep[]>(initialSteps),[sequenceId,setSequenceId]=useState('');
 const [notes,setNotes]=useState<Record<string,string>>({}),[showHistory,setShowHistory]=useState(false);
 const [outcomePerson,setOutcomePerson]=useState(''),[outcome,setOutcome]=useState<'replied'|'meeting_booked'|'opt_out'>('replied'),[outcomeNote,setOutcomeNote]=useState('');
 const q=useQuery({queryKey:['sales-workspace',tenantId,productKey,search],queryFn:()=>get({data:{tenantId,productKey:productKey||null,search}}),retry:false});
 const d=q.data;
 const canWrite=!!d&&['owner','admin','agent','platform_admin'].includes(d.role);
 const canAdmin=!!d&&['owner','admin','platform_admin'].includes(d.role);
 const suppressed=new Set(d?.suppressedPersonIds??[]);
 const people=new Map((d?.people??[]).map(p=>[p.id,{id:p.id,display_name:p.display_name}]));
 for(const en of d?.enrolments??[])if(en.person)people.set(en.person.id,en.person);
 const selectedPerson=people.get(personId);
 const sequencesById=new Map((d?.sequences??[]).map(s=>[s.id,s]));
 const enrolmentsById=new Map((d?.enrolments??[]).map(en=>[en.id,en]));
 const openActions=(d?.actions??[]).filter(a=>!['completed','cancelled'].includes(a.status));
 const shownActions=showHistory?(d?.actions??[]):openActions;
 async function run(work:()=>Promise<unknown>,message:string){
  if(busy)return false;
  setBusy(true);setError('');setNotice('');
  try{await work();setNotice(message);await Promise.all([queryClient.invalidateQueries({queryKey:['sales-workspace',tenantId]}),queryClient.invalidateQueries({queryKey:['shared-engines',tenantId]})]);return true;}
  catch(e){setError(e instanceof Error?e.message:'The sales action failed. No success has been assumed.');return false;}
  finally{setBusy(false);}
 }
 function patchStep(index:number,patch:Partial<SalesStep>){setSteps(current=>current.map((s,i)=>i===index?{...s,...patch}:s));}
 function moveStep(index:number,offset:number){setSteps(current=>{const next=[...current];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});}
 const disabled=busy||!canWrite;

 return <AppShell title="Omniqora Sales" subtitle="Prospect lists, controlled sales cadences and a CRM-linked daily action queue."
  actions={<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy||q.isFetching} onClick={()=>void q.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button><Button size="sm" disabled={disabled||!d} onClick={()=>void run(async()=>{const result=await prepare({data:{tenantId}});setNotice(`Prepared ${result.prepared}; reconciled ${result.reconciled}. No messages sent.`);},'Due actions prepared across this tenant. No messages sent.')} >Prepare tenant-wide due actions</Button></div>}>
  <div className="space-y-6">
   <div className="rounded-lg border p-4">
    <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5"/><span>Controlled pilot: outbound delivery is off</span><Badge variant="outline">Review only</Badge></div>
    <p className="mt-2 text-sm text-muted-foreground">Call and task steps create CRM work, not telephone calls. Email, WhatsApp and SMS steps create drafts; approving their content never sends them. Preparation handles up to 50 due enrollments across all products in this tenant.</p>
   </div>
   {notice&&<p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
   {error&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
   {q.isPending&&<p role="status">Loading your sales workspace…</p>}
   {q.isError&&<div role="alert" className="rounded-lg border border-destructive p-5"><h2 className="font-semibold">Sales workspace unavailable</h2><p className="mt-2 text-sm">{q.error instanceof Error?q.error.message:'Unable to read sales data.'}</p><p className="mt-2 text-sm text-muted-foreground">This workspace requires tenant membership, the Omniqora Sales Engagement entitlement and the sales runtime migration. No demo records are substituted for missing live data.</p></div>}
   {d&&<>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
     ['Loaded prospect memberships',d.members.length],['Loaded active enrollments',d.enrolments.filter(en=>en.status==='active').length],
     ['Loaded manual actions',openActions.filter(a=>a.status==='manual_open').length],['Loaded drafts for review',openActions.filter(a=>a.status==='pending_review').length],
    ].map(([label,value])=><Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
    <div className="grid gap-4 rounded-lg border p-4 lg:grid-cols-3">
     <Field label="View product"><select className={selectClass} value={productKey} onChange={e=>{setProductKey(e.target.value);setListId('');setSequenceId('');}}><option value="">All products in this tenant</option>{d.products.map(p=><option key={p.product_key} value={p.product_key}>{p.name}</option>)}</select></Field>
     <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();setSearch(searchText);setPersonId('');}}><div className="flex-1"><Field label="Search existing CRM people"><Input value={searchText} maxLength={80} onChange={e=>setSearchText(e.target.value)} placeholder="Name"/></Field></div><Button type="submit" variant="outline">Search</Button></form>
     <Field label="Contact for prospect lists and enrollment"><select className={selectClass} value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">Select an existing CRM person</option>{[...people.values()].map(p=><option key={p.id} value={p.id}>{p.display_name}{suppressed.has(p.id)?' — sales opt-out':''}</option>)}</select></Field>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-sm"><Link className="underline" to="/app/crm">Open CRM and pipeline</Link><Link className="underline" to="/app/shared-engines">Shared engines and proposals</Link><Link className="underline" to="/app/contact-centre">Contact centre</Link>{!canWrite&&<Badge variant="outline">Read-only role</Badge>}{personId&&suppressed.has(personId)&&<Badge variant="destructive">Selected contact has a sales opt-out</Badge>}</div>
    <Tabs value={tab} onValueChange={setTab}>
     <TabsList className="h-auto flex-wrap"><TabsTrigger value="prospects">Prospect lists</TabsTrigger><TabsTrigger value="sequences">Sequences</TabsTrigger><TabsTrigger value="queue">Action queue</TabsTrigger><TabsTrigger value="controls">Follow-up controls</TabsTrigger></TabsList>
     <TabsContent value="prospects" className="mt-5 space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
       <Panel title="Create a prospect list"><form className="space-y-3" onSubmit={async e=>{e.preventDefault();await run(async()=>{const list=await createList({data:{tenantId,productKey:productKey||null,name:listName,description:null,sourceType:'manual',criteria:{}}});setListId(list.id);setListName('');},'Prospect list created.');}}><Field label="List name"><Input required maxLength={200} value={listName} onChange={e=>setListName(e.target.value)}/></Field><p className="text-xs text-muted-foreground">Uses the existing shared prospect-list table. The selected product is a sales context, not a connection to a separate product database.</p><Button type="submit" disabled={disabled||!listName.trim()}>Create list</Button></form></Panel>
       <Panel title="Add or update a scored prospect"><form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(()=>saveProspect({data:{tenantId,listId,personId,fit,intent,engagement,reason}}),'Prospect membership and scoring evidence saved.');}}>
        <Field label="Active prospect list"><select className={selectClass} value={listId} onChange={e=>setListId(e.target.value)} required><option value="">Choose a list</option>{d.lists.filter(l=>l.status==='active').map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <p className="text-sm">Contact: <strong>{selectedPerson?.display_name??'Select a CRM contact above'}</strong></p>
        <div className="grid grid-cols-3 gap-3">{([{label:'Fit',value:fit,set:setFit},{label:'Intent',value:intent,set:setIntent},{label:'Engagement',value:engagement,set:setEngagement}]).map(s=><Field key={s.label} label={s.label+' / 100'}><Input type="number" min={0} max={100} step={1} required value={s.value} onChange={e=>s.set(Number(e.target.value))}/></Field>)}</div>
        <Field label="Evidence for these manual scores"><Textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Record verified fit, intent and engagement evidence."/></Field>
        <p className="text-xs text-muted-foreground">Score = mean of fit, intent and engagement. This is explainable manual scoring, not an AI prediction.</p><Button type="submit" disabled={disabled||!listId||!personId||!reason.trim()}>Save prospect and evidence</Button>
       </form></Panel>
      </div>
      <Panel title="Prospect memberships">{d.members.length===0?<Empty>No prospect memberships loaded. Create a list and add an existing CRM person.</Empty>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Person</th><th className="p-2">List</th><th className="p-2">Score</th><th className="p-2">Evidence / status</th></tr></thead><tbody>{d.members.filter(m=>!listId||m.list_id===listId).map(m=><tr key={m.id} className="border-b align-top"><td className="p-2">{m.person?.display_name??'Legacy lead/company membership'}</td><td className="p-2">{d.lists.find(l=>l.id===m.list_id)?.name??'List'}</td><td className="p-2">{m.total_score===null?'—':Number(m.total_score).toFixed(1)}</td><td className="p-2"><p>{m.person_id&&suppressed.has(m.person_id)?'Sales opt-out':readable(m.status)}</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{(m.score_reasons??[]).map(x=>x&&typeof x==='object'?x.reason:'').filter(Boolean).join(' · ')}</p></td></tr>)}</tbody></table></div>}</Panel>
     </TabsContent>
     <TabsContent value="sequences" className="mt-5 space-y-5">
      <Panel title="Build a controlled cadence"><form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{const id=await createSequence({data:{tenantId,name:sequenceName,productKey:productKey||null,steps}});setSequenceId(id);setSequenceName('');},'Sequence saved as a draft. An administrator must activate it before enrollment.');}}>
       <Field label="Sequence name"><Input required maxLength={160} value={sequenceName} onChange={e=>setSequenceName(e.target.value)} placeholder="Haccora discovery / Dishbee restaurant introduction"/></Field>
       <p className="text-sm text-muted-foreground">Each delay starts at enrollment or completion of the preceding step. Message steps remain blocked after content review, so later steps do not advance on an unsent message. Existing enrollments keep an immutable snapshot.</p>
       <div className="space-y-4">{steps.map((step,index)=><fieldset className="space-y-3 rounded-lg border p-4" key={index}><legend className="px-1 text-sm font-semibold">Step {index+1}</legend><div className="grid gap-3 md:grid-cols-3">
        <Field label="Action type"><select className={selectClass} value={step.kind} onChange={e=>patchStep(index,{kind:e.target.value as SalesStep['kind']})}><option value="call">Manual call task</option><option value="task">Sales task</option><option value="email">Email draft</option><option value="whatsapp">WhatsApp draft</option><option value="sms">SMS draft</option></select></Field>
        <Field label="Title"><Input required maxLength={200} value={step.title} onChange={e=>patchStep(index,{title:e.target.value})}/></Field>
        <Field label="Wait before this step (minutes)"><Input type="number" min={0} max={525600} step={1} required value={step.delayMinutes} onChange={e=>patchStep(index,{delayMinutes:Number(e.target.value)})}/></Field>
       </div>{step.kind==='email'&&<Field label="Email subject"><Input maxLength={300} value={step.subject??''} onChange={e=>patchStep(index,{subject:e.target.value})}/></Field>}
       <Field label={['call','task'].includes(step.kind)?'Task instructions':'Draft content (not automatically sent)'}><Textarea maxLength={5000} value={step.body} required={!['call','task'].includes(step.kind)} onChange={e=>patchStep(index,{body:e.target.value})}/></Field>
       <div className="flex gap-2"><Button type="button" size="sm" variant="outline" aria-label={'Move step '+(index+1)+' up'} disabled={index===0} onClick={()=>moveStep(index,-1)}><ChevronUp className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" aria-label={'Move step '+(index+1)+' down'} disabled={index===steps.length-1} onClick={()=>moveStep(index,1)}><ChevronDown className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" disabled={steps.length===1} onClick={()=>setSteps(current=>current.filter((_,i)=>i!==index))}><Trash2 className="mr-1 h-4 w-4"/>Remove</Button></div></fieldset>)}</div>
       <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={steps.length>=30} onClick={()=>setSteps(current=>[...current,{kind:'task',title:'Follow-up task',body:'',delayMinutes:1440}])}><Plus className="mr-2 h-4 w-4"/>Add step</Button><Button type="submit" disabled={disabled||!sequenceName.trim()}>Save draft sequence</Button></div>
      </form></Panel>
      <Panel title="Sequence library">{d.sequences.length===0?<Empty>No managed sequences yet. Legacy Growth records are preserved but not automatically activated.</Empty>:<div className="space-y-3">{d.sequences.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.product_key??'Tenant-wide'} · {s.steps.length} steps · {s.status}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{setSequenceName((s.name+' (copy)').slice(0,160));setSteps(s.steps.map(step=>({...step})));}}>Use as new draft</Button>{s.status!=='archived'&&<><Button size="sm" variant="outline" disabled={busy||(s.status==='active'?!canWrite:!canAdmin)} onClick={()=>void run(()=>setSequenceStatus({data:{tenantId,sequenceId:s.id,status:s.status==='active'?'paused':'active'}}),'Sequence status updated. This does not send messages.')} >{s.status==='active'?'Pause':'Activate'}</Button><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{if(window.confirm('Archive this sequence and cancel its open managed follow-up tasks?'))void run(()=>setSequenceStatus({data:{tenantId,sequenceId:s.id,status:'archived'}}),'Sequence archived and its pending managed work cancelled.');}}>Archive</Button></>}</div></div>)}</div>}</Panel>
      <Panel title="Enroll an existing CRM person"><form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(()=>enrol({data:{tenantId,sequenceId,personId,leadId:null}}),'Enrollment saved. Repeated requests preserve the existing state and never restart a terminal enrollment.');}}><Field label="Active sequence"><select className={selectClass} value={sequenceId} onChange={e=>setSequenceId(e.target.value)} required><option value="">Choose an active sequence</option>{d.sequences.filter(s=>s.status==='active').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><p className="text-sm">Contact: <strong>{selectedPerson?.display_name??'Select a CRM person above'}</strong></p><Button type="submit" disabled={disabled||!sequenceId||!personId||suppressed.has(personId)}>Enroll selected person</Button></form></Panel>
     </TabsContent>
     <TabsContent value="queue" className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Use Prepare tenant-wide due actions to create due work or reconcile tasks completed in CRM.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)}/>Include loaded history</label></div>
      {shownActions.length===0?<Empty>No actions in this view. An active enrollment must be due before preparation creates work.</Empty>:shownActions.map(a=>{
       const en=enrolmentsById.get(a.enrolment_id),seq=en?sequencesById.get(en.sequence_id):undefined;
       const actionable=en?.status==='active'&&seq?.status==='active';
       return <Panel key={a.id} title={a.title}><div className="flex flex-wrap gap-2"><Badge variant="outline">{a.kind==='call'?'Call task':a.kind}</Badge><Badge variant={a.status==='approved_blocked'?'secondary':'outline'}>{statusLabels[a.status]}</Badge></div><p className="text-sm">{en?.person?.display_name??'CRM person'} · {seq?.name??'Sequence'} · Step {a.step_index+1}</p>{a.subject&&<p className="text-sm font-medium">Subject: {a.subject}</p>}<p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.body||'No additional instructions.'}</p>
        {a.status==='manual_open'&&<div className="space-y-3"><Field label="Record the completed work and outcome"><Textarea maxLength={1000} value={notes[a.id]??''} onChange={e=>setNotes(current=>({...current,[a.id]:e.target.value}))}/></Field><Button size="sm" disabled={disabled||!actionable||!(notes[a.id]??'').trim()} onClick={()=>void run(()=>complete({data:{tenantId,actionId:a.id,note:notes[a.id]??''}}),'Manual work recorded, linked CRM task completed and cadence advanced.')}>Complete manual action</Button></div>}
        {a.status==='pending_review'&&<Button size="sm" disabled={busy||!canAdmin||!actionable} onClick={()=>void run(()=>approve({data:{tenantId,actionId:a.id}}),'Content approved. Delivery remains blocked; no message was sent.')}>Approve content only</Button>}
        {a.status==='approved_blocked'&&<p className="rounded-md border p-3 text-sm">Not sent. Provider delivery, channel permission checks, signed inbound events and delivery receipts must be implemented and verified before this step can advance.</p>}
        {!actionable&&!['completed','cancelled'].includes(a.status)&&<p className="text-xs text-muted-foreground">The enrollment or sequence is paused or inactive.</p>}
        {a.completion_note&&<p className="text-sm">Completion: {a.completion_note}</p>}
       </Panel>;
      })}
     </TabsContent>
     <TabsContent value="controls" className="mt-5 space-y-5">
      <Panel title="Enrollment controls">{d.enrolments.length===0?<Empty>No managed enrollments loaded.</Empty>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Person / sequence</th><th className="p-2">Status / next action</th><th className="p-2">Controls</th></tr></thead><tbody>{d.enrolments.map(en=><tr key={en.id} className="border-b align-top"><td className="p-2"><p className="font-medium">{en.person?.display_name??'CRM person'}</p><p className="text-xs text-muted-foreground">{sequencesById.get(en.sequence_id)?.name??'Sequence'}</p></td><td className="p-2"><p>{readable(en.status)}{en.stop_reason?' · '+readable(en.stop_reason):''}</p><p className="text-xs text-muted-foreground">{date(en.next_action_at)}</p></td><td className="p-2"><div className="flex flex-wrap gap-2">{['active','paused'].includes(en.status)&&<><Button size="sm" variant="outline" disabled={disabled} onClick={()=>void run(()=>control({data:{tenantId,enrolmentId:en.id,command:en.status==='active'?'pause':'resume'}}),'Enrollment status updated.')}>{en.status==='active'?'Pause':'Resume'}</Button><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{if(window.confirm('Cancel this enrollment and its open managed work?'))void run(()=>control({data:{tenantId,enrolmentId:en.id,command:'cancel'}}),'Enrollment and pending managed work cancelled.');}}>Cancel</Button></>}<Button size="sm" variant="outline" disabled={disabled} onClick={()=>{setOutcomePerson(en.person_id);setOutcome('replied');}}>Select for outcome</Button></div></td></tr>)}</tbody></table></div>}</Panel>
      <Panel title="Record a reply, booking or sales opt-out"><form className="space-y-3" onSubmit={e=>{e.preventDefault();if(outcome==='opt_out'&&!window.confirm('Record a tenant-wide sales opt-out? This blocks new managed enrollment and cancels pending managed sales work for this person.'))return;void run(async()=>{await record({data:{tenantId,personId:outcomePerson,outcome,idempotencyKey:crypto.randomUUID(),note:outcomeNote}});setOutcomeNote('');},'Outcome recorded and pending managed sales follow-up stopped for this person.');}}>
       <div className="grid gap-3 md:grid-cols-2"><Field label="Person"><select className={selectClass} value={outcomePerson} onChange={e=>setOutcomePerson(e.target.value)} required><option value="">Choose a CRM person</option>{[...people.values()].map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field><Field label="Observed outcome"><select className={selectClass} value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}><option value="replied">Reply received (manually recorded)</option><option value="meeting_booked">Meeting booked elsewhere (record outcome)</option><option value="opt_out">Sales opt-out</option></select></Field></div>
       <Field label="Source / evidence for this outcome"><Textarea required maxLength={1000} value={outcomeNote} onChange={e=>setOutcomeNote(e.target.value)} placeholder="Record where and when the person replied, booked or opted out. Do not paste unnecessary personal data."/></Field>
       <p className="text-sm text-muted-foreground">This stops the person's managed sales cadences across this tenant. It does not create a calendar event or represent an automatic inbox integration. A sales opt-out persists and cannot be cleared here.</p><Button type="submit" disabled={disabled||!outcomePerson||!outcomeNote.trim()}>Record outcome and stop follow-up</Button>
      </form></Panel>
     </TabsContent>
    </Tabs>
    <p className="text-xs text-muted-foreground">This controlled-pilot view is bounded: up to {d.limits.people} matching CRM people, {d.limits.lists} lists, {d.limits.members} memberships, {d.limits.sequences} sequences, {d.limits.enrolments} recent enrollments and {d.limits.actions} actions. Counters describe loaded records, not portfolio-wide totals. Product filters affect the view; preparation and outcome stopping are tenant-wide.</p>
   </>}
  </div>
 </AppShell>;
}
