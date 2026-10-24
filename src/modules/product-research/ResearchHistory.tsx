import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {listResearchHistory,readResearchRevision,reviewResearchProject} from './functions';

export function ResearchHistory({tenantId,project,disabled,canWrite,dirty,onRestore,onBusy,onMessage}:{tenantId:string;project:{id:string;revision:number};disabled:boolean;canWrite:boolean;dirty:boolean;onRestore:(value:{name:string;dossierJson:string})=>void;onBusy:(value:boolean)=>void;onMessage:(value:string)=>void}){
 const list=useServerFn(listResearchHistory),read=useServerFn(readResearchRevision),review=useServerFn(reviewResearchProject);
 const [offset,setOffset]=useState(0),[note,setNote]=useState(''),[decision,setDecision]=useState<'reviewed'|'changes_requested'>('reviewed');
 const history=useQuery({queryKey:['research-history',tenantId,project.id,project.revision,offset],queryFn:()=>list({data:{tenantId,projectId:project.id,offset}}),retry:false});
 return <section className="space-y-3 rounded border p-4">
  <h3 className="font-semibold">Saved history and reviews</h3>
  <p className="text-sm">Reviews apply only to the saved revision shown. They do not authorise code execution or publishing. Restoring creates an unsaved draft; save it as a new revision.</p>
  {history.isLoading&&<p>Loading history…</p>}{history.error&&<p role="alert">{history.error.message}</p>}
  {history.data?.revisions.map(r=><article key={r.revision} className="space-y-2 rounded border p-3">
   <p>Revision {r.revision}: {r.name} · {r.saved_at}</p>
   <p className="break-all text-xs">Saved by {r.saved_by}</p>
   {history.data.reviews.filter(v=>v.revision===r.revision).map(v=><div key={v.reviewer_id} className="break-words text-sm"><p>{v.decision==='reviewed'?'Reviewed':'Changes requested'} · {v.reviewed_at}</p><p className="break-all">Reviewer: {v.reviewer_id}</p><p className="whitespace-pre-wrap">{v.note}</p></div>)}
   {!history.data.reviews.some(v=>v.revision===r.revision)&&<p className="text-sm">No authenticated review recorded.</p>}
   <button disabled={disabled||!canWrite} onClick={async()=>{
    if(!confirm(`Load revision ${r.revision} as a draft?${dirty?' This replaces your unsaved edits.':''} Source review labels will reset.`))return;
    onBusy(true);try{onRestore(await read({data:{tenantId,projectId:project.id,revision:r.revision}}));onMessage('Loaded revision '+r.revision+' as a draft. Save to create a new revision.');}catch(e){onMessage(e instanceof Error?e.message:'Restore failed');}finally{onBusy(false);}
   }}>Restore as draft</button>
  </article>)}
  <div className="flex gap-3"><button disabled={disabled||offset===0} onClick={()=>setOffset(Math.max(0,offset-25))}>Newer revisions</button><button disabled={disabled||history.data?.revisions.length!==25} onClick={()=>setOffset(offset+25)}>Older revisions</button></div>
  {history.data?.canReview&&<fieldset disabled={disabled||dirty} className="space-y-2">
   <legend>Review saved revision {project.revision}</legend>
   {dirty&&<p>Save or reopen the project before reviewing.</p>}
   <label className="block">Decision<select className="ml-2 rounded border bg-background p-2" value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}><option value="reviewed">Reviewed</option><option value="changes_requested">Changes requested</option></select></label>
   <label className="block">Review notes<textarea className="block w-full rounded border bg-background p-2" value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></label>
   <button disabled={!note.trim()} onClick={async()=>{
    onBusy(true);try{await review({data:{tenantId,projectId:project.id,revision:project.revision,decision,note}});setNote('');onMessage('Review recorded for revision '+project.revision);await history.refetch();}catch(e){onMessage(e instanceof Error?e.message:'Review failed');}finally{onBusy(false);}
   }}>Record review</button>
   <p className="text-xs">Your signed-in identity is recorded. Each reviewer can record one permanent decision per revision.</p>
  </fieldset>}
 </section>;
}
