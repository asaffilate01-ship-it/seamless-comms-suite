import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {DossierEditor} from './DossierEditor';
import {blankDossier,parseDraft} from '../../../tools/product-research/editor-model.mjs';
import {listResearchProjects,readResearchProject,saveResearchProject} from './functions';

export function ResearchProjectsPanel({tenantId}:{tenantId:string}){
 const list=useServerFn(listResearchProjects),read=useServerFn(readResearchProject),save=useServerFn(saveResearchProject);
 const [offset,setOffset]=useState(0),[name,setName]=useState(''),[json,setJson]=useState(()=>JSON.stringify(blankDossier(),null,2)),[project,setProject]=useState<{id:string;revision:number}|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[dirty,setDirty]=useState(false);
 const draft=useMemo(()=>{try{return parseDraft(JSON.parse(json));}catch{return null;}},[json]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const pending=useRef<{signature:string;projectId:string;requestId:string}|null>(null);
 const projects=useQuery({queryKey:['research-projects',tenantId,offset],queryFn:()=>list({data:{tenantId,offset}}),retry:false});
 function download(){const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='research-dossier.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="my-6 space-y-4 rounded-xl border p-5">
  <h2 className="text-xl font-semibold">Product research projects</h2>
  <p className="text-sm text-muted-foreground">Create and edit research dossiers in this tenant workspace. Each save retains a revision. Dossiers are research drafts; reviewer names inside a file do not grant approval.</p>
  {projects.error&&<p role="alert">{projects.error.message}</p>}
  {projects.isLoading&&<p>Loading projects…</p>}
  <div className="flex flex-wrap gap-2">{projects.data?.projects.map(p=><button className="rounded border px-3 py-2 text-left" key={p.id} disabled={busy} onClick={async()=>{
   if(dirty&&!confirm('Replace unsaved edits? Download your current draft first if you need it.'))return;
   setBusy(true);try{const value=await read({data:{tenantId,projectId:p.id}});const parsed=parseDraft(JSON.parse(value.dossierJson));setProject(value);setName(value.name);setJson(JSON.stringify(parsed,null,2));setDirty(false);pending.current=null;setMessage('Opened revision '+value.revision);}catch(e){setMessage(e instanceof Error?e.message:'Open failed');}finally{setBusy(false);}
  }}>{p.name}<small className="block">Revision {p.revision}</small></button>)}</div>
  {!projects.isLoading&&!projects.error&&!projects.data?.projects.length&&<p>No projects on this page.</p>}
  <div className="flex gap-3"><button disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-25))}>Previous</button><button disabled={busy||projects.data?.projects.length!==25} onClick={()=>setOffset(offset+25)}>Next</button></div>
  <button disabled={busy} onClick={()=>{if(dirty&&!confirm('Discard unsaved edits?'))return;setProject(null);setName('');setJson(JSON.stringify(blankDossier(),null,2));setDirty(false);pending.current=null;setMessage('Name the project and add sources, observations and features below.');}}>New project</button>
  <label className="block">Project name<input className="mt-1 w-full rounded border bg-background p-2" value={name} maxLength={120} disabled={busy||!projects.data?.canWrite} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label>
  <label className="block">Upload dossier JSON<input className="block" type="file" accept=".json,application/json" disabled={busy||!projects.data?.canWrite} onChange={async e=>{
   const file=e.target.files?.[0];e.target.value='';if(!file)return;
   if(file.size>1000000){setMessage('Dossier exceeds 1 MB');return;}
   if(dirty&&!confirm('Replace the unsaved dossier content?'))return;
   setBusy(true);try{const text=await file.text();const parsed=parseDraft(JSON.parse(text));setJson(JSON.stringify(parsed,null,2));setDirty(true);setMessage('Dossier loaded. Save to retain it in this tenant.');}catch{setMessage('Invalid JSON file; existing draft preserved.');}finally{setBusy(false);}
  }}/></label>
  {draft?<DossierEditor value={draft} disabled={busy||!projects.data?.canWrite} onChange={value=>{setJson(JSON.stringify(value,null,2));setDirty(true);}}/>:<p role="alert">Invalid draft structure. Correct the advanced JSON or reopen a saved project.</p>}
  <details><summary>Advanced JSON</summary><label className="block">Dossier JSON<textarea className="mt-1 min-h-48 w-full rounded border bg-background p-2 font-mono text-xs" value={json} maxLength={1000000} disabled={busy||!projects.data?.canWrite} onChange={e=>{setJson(e.target.value);setDirty(true);}}/></label></details>
  <div className="flex flex-wrap gap-3"><button disabled={busy||!json} onClick={download}>Download draft</button><button className="rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy||!projects.data?.canWrite||!name.trim()||!draft||!dirty} onClick={async()=>{
   const signature=JSON.stringify([name,json,project]);
   if(pending.current?.signature!==signature)pending.current={signature,projectId:project?.id??pending.current?.projectId??crypto.randomUUID(),requestId:crypto.randomUUID()};
   const request=pending.current;setBusy(true);
   try{const result=await save({data:{tenantId,projectId:request.projectId,requestId:request.requestId,expectedRevision:project?.revision??0,name,dossierJson:json}});setProject({id:result.id,revision:result.revision});pending.current=null;setDirty(false);setMessage('Saved revision '+result.revision);await projects.refetch();}catch(e){setMessage(e instanceof Error?e.message:'Save failed');}finally{setBusy(false);}
  }}>{busy?'Working…':'Save revision'}</button></div>
  <p role="status" aria-live="polite">{message}{dirty?' · Unsaved changes':''}</p>
 </section>;
}
