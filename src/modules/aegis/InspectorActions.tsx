import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {advanceAegisOperation} from './operations.functions';
import {changeAegisReport} from './reports.functions';
import {changeAegisCorrective} from './corrective.functions';
import {changeAegisHandover} from './handovers.functions';
import {transitionAegisResource} from './custody.functions';
import {acknowledgeAegisPostOrder} from './post-orders.functions';
import {inspectorActions} from './inspector-actions';
import type {QueueKind} from './control-room';
type Check={label:string;result:'pass'|'fail'|'not_applicable';finding:string};
export function InspectorActions({tenantId,kind,row:r,userId,role,acknowledged,onSaved,loading}:{tenantId:string;kind:QueueKind;row:any;userId:string;role:string;acknowledged:boolean;loading:boolean;onSaved:()=>Promise<unknown>}){
 const incident=useServerFn(advanceAegisOperation),report=useServerFn(changeAegisReport),corrective=useServerFn(changeAegisCorrective),handover=useServerFn(changeAegisHandover),resource=useServerFn(transitionAegisResource),receipt=useServerFn(acknowledgeAegisPostOrder),cache=useQueryClient();
 const [body,setBody]=useState<string>(r.body??''),[checks,setChecks]=useState<Check[]>(r.checks??[]),[summary,setSummary]=useState<string>(r.summary??''),[outstanding,setOutstanding]=useState<string>(r.outstanding??''),[evidence,setEvidence]=useState<string>(r.evidence??''),[note,setNote]=useState(''),[custodian,setCustodian]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const actions=inspectorActions(kind,r,userId,role,acknowledged),editReport=kind==='report'&&r.created_by===userId&&['draft','changes_requested'].includes(r.stage),editHandover=kind==='handover'&&r.created_by===userId&&['draft','returned'].includes(r.stage),editEvidence=kind==='corrective'&&r.assignee_id===userId&&['open','in_progress'].includes(r.stage),needsNote=(kind==='report'&&r.stage==='submitted')||(kind==='corrective'&&r.stage==='submitted')||(kind==='handover'&&r.stage==='offered')||['visitor','key','equipment'].includes(kind);
 const disabled=busy||loading;
 async function act(stage:string){if(disabled)return;setBusy(true);setError('');try{
  const base={tenantId,revision:r.revision};
  if(kind==='incident')await incident({data:{...base,id:r.id,status:stage as any}});
  else if(kind==='report')await report({data:{...base,reportId:r.id,stage:stage as any,body,checks,reviewNote:note}});
  else if(kind==='corrective')await corrective({data:{...base,actionId:r.id,stage:stage as any,evidence,reviewNote:note}});
  else if(kind==='handover')await handover({data:{...base,handoverId:r.id,stage:stage as any,summary,outstanding,response:note}});
  else if(kind==='instructions')await receipt({data:{tenantId,orderId:r.id}});
  else await resource({data:{...base,resourceId:r.id,stage:stage as any,note,custodianId:stage==='issued'?custodian||null:stage==='lost'?r.custodian_id:null}});
  await cache.invalidateQueries({predicate:q=>typeof q.queryKey[0]==='string'&&q.queryKey[0].startsWith('aegis-')&&q.queryKey[1]===tenantId});await onSaved();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(!actions.length)return <p className="rounded border p-3 text-sm text-muted-foreground">{kind==='instructions'&&acknowledged?'Your receipt for this version is recorded.':'No workflow action is available for your role and this recorded state.'}</p>;
 const input='mt-1 w-full rounded border bg-background p-2';
 return <section className="rounded-lg border border-primary/30 p-4"><h4 className="font-semibold">Work on this record</h4><p className="my-2 text-xs text-muted-foreground">Actions use the displayed revision and existing approval rules. Review the source evidence before submitting. Draft edits survive history paging within this revision. Refreshing to a changed server revision resets local edits; stale updates are refused.</p>
 {editReport&&<><label className="block text-sm">Report narrative<textarea aria-label="Inspector report narrative" maxLength={10000} disabled={disabled} value={body} onChange={e=>setBody(e.target.value)} className={input}/></label>{checks.map((c,i)=><div key={i} className="my-3 grid gap-2 sm:grid-cols-3"><input aria-label={`Inspector check ${i+1} label`} disabled={disabled} maxLength={160} value={c.label} onChange={e=>setChecks(checks.map((v,j)=>j===i?{...v,label:e.target.value}:v))} className={input}/><select aria-label={`Inspector check ${i+1} result`} disabled={disabled} value={c.result} onChange={e=>setChecks(checks.map((v,j)=>j===i?{...v,result:e.target.value as Check['result']}:v))} className={input}><option value="pass">Pass</option><option value="fail">Fail</option><option value="not_applicable">Not applicable</option></select><input aria-label={`Inspector check ${i+1} finding`} disabled={disabled} maxLength={2000} value={c.finding} onChange={e=>setChecks(checks.map((v,j)=>j===i?{...v,finding:e.target.value}:v))} placeholder="Finding / corrective action" className={input}/></div>)}<div className="my-3 flex gap-2"><Button variant="outline" size="sm" disabled={disabled||checks.length>=30} onClick={()=>setChecks([...checks,{label:'',result:'pass',finding:''}])}>Add check</Button><Button variant="outline" size="sm" disabled={disabled||!checks.length} onClick={()=>setChecks(checks.slice(0,-1))}>Remove last check</Button></div></>}
 {editHandover&&<><label className="block text-sm">Shift summary<textarea aria-label="Inspector shift summary" maxLength={5000} disabled={disabled} value={summary} onChange={e=>setSummary(e.target.value)} className={input}/></label><label className="block text-sm">Outstanding issues<textarea aria-label="Inspector outstanding issues" maxLength={5000} disabled={disabled} value={outstanding} onChange={e=>setOutstanding(e.target.value)} className={input}/></label></>}
 {editEvidence&&<label className="block text-sm">Remediation evidence<textarea aria-label="Inspector remediation evidence" maxLength={5000} disabled={disabled} value={evidence} onChange={e=>setEvidence(e.target.value)} className={input}/></label>}
 {needsNote&&<label className="block text-sm">Decision or handover note<textarea aria-label="Inspector decision note" maxLength={2000} disabled={disabled} value={note} onChange={e=>setNote(e.target.value)} className={input}/></label>}
 {actions.some(a=>a.stage==='issued')&&<label className="block text-sm">Custodian member reference<input aria-label="Inspector asset custodian UUID" value={custodian} disabled={disabled} onChange={e=>setCustodian(e.target.value)} className={input} placeholder="Existing tenant member UUID"/></label>}
 {error&&<p role="alert" className="my-3">{error}</p>}<div className="mt-3 flex flex-wrap gap-2">{actions.map(a=><Button key={a.stage} variant={['approved','closed','acknowledged','receipt','submitted'].includes(a.stage)?'default':'outline'} disabled={disabled||(needsNote&&!note.trim())||(a.stage==='issued'&&!custodian.trim())} onClick={()=>act(a.stage)}>{busy?'Saving…':a.label}</Button>)}</div></section>;
}
