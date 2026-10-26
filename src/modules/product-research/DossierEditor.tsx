import {useMemo,useState} from 'react';
import {templates,canRemove,changeSource,type Dossier} from '../../../tools/product-research/editor-model.mjs';
import {planBuildPack} from '../../../scripts/lib/product-research-model.mjs';

type Group='sources'|'observations'|'features';
const limits={sources:100,observations:300,features:150};
const fields:Record<Group,{key:string;label:string;options?:string[];area?:boolean}[]>={
 sources:[{key:'url',label:'Source URL'},{key:'basis',label:'Access basis',options:['owned','public-observation','licensed','permission']},{key:'permissionNote',label:'Access and permission notes',area:true},{key:'review',label:'Local review state',options:['pending','reviewed']},{key:'reviewer',label:'Local reviewer name'}],
 observations:[{key:'sourceId',label:'Source'},{key:'method',label:'Method',options:['manual','rea','web-intelligence']},{key:'kind',label:'Evidence kind',options:['observed','inferred']},{key:'summary',label:'Observation summary',area:true},{key:'evidenceRef',label:'Evidence reference'}],
 features:[{key:'title',label:'Feature title'},{key:'decision',label:'Decision',options:['build','defer','exclude']},{key:'area',label:'Area',options:['frontend','backend','integration','data']},{key:'requirement',label:'Original requirement',area:true},{key:'acceptance',label:'Acceptance tests — one per line',area:true}],
};
const control='mt-1 w-full rounded border bg-background p-2 text-sm';
export function DossierEditor({value,onChange,disabled}:{value:Dossier;onChange:(value:Dossier)=>void;disabled:boolean}){
 const [exportError,setExportError]=useState('');
 const [tab,setTab]=useState<Group|'review'>('sources');
 const review=useMemo(()=>{try{return {pack:planBuildPack(value),error:''};}catch(e){return {pack:null,error:e instanceof Error?e.message:'Complete the dossier fields'};}},[value]);
 function update(group:Group,index:number,key:string,input:string|string[]){
  const rows=value[group].map((row,i)=>i!==index?row:group==='sources'?changeSource(row,key,String(input)):{...row,[key]:input});
  onChange({...value,[group]:rows});
 }
 function add(group:Group){onChange({...value,[group]:[...value[group],{...structuredClone(templates[group]),id:group+'-'+crypto.randomUUID()}]});}
 async function exportPack(){
  if(!review.pack)return;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(review.pack)));
  const pack={...review.pack,digest:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')};
  const url=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='implementation-build-pack.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="space-y-4">
  <fieldset disabled={disabled} className="grid gap-3 md:grid-cols-2">
   <label>Product<input className={control} maxLength={120} value={value.product} onChange={e=>onChange({...value,product:e.target.value})}/></label>
   <label>Target repository<input className={control} maxLength={200} placeholder="owner/repository" value={value.repository} onChange={e=>onChange({...value,repository:e.target.value})}/></label>
   <label>Scope<select className={control} value={value.scope} onChange={e=>onChange({...value,scope:e.target.value})}><option value="selected-features">Selected features</option><option value="whole-product">Whole product</option></select></label>
  </fieldset>
  {exportError&&<p role="alert">{exportError}</p>}
  <div className="flex flex-wrap gap-2" aria-label="Dossier sections">{(['sources','observations','features','review'] as const).map(group=><button key={group} type="button" aria-pressed={tab===group} className={'rounded border px-3 py-2 '+(tab===group?'bg-muted':'')} onClick={()=>setTab(group)}>{group==='review'?'Build review':group[0].toUpperCase()+group.slice(1)}{group!=='review'?' ('+value[group].length+')':''}</button>)}</div>
  {tab==='review'?<div className="space-y-3">
   <p className="text-sm text-muted-foreground">Preview uses the current draft, including unsaved edits. Planning readiness does not authorise generation or deployment.</p>
   {review.error&&<p role="status">{review.error}. Complete the corresponding fields.</p>}
   {review.pack&&<><p>{review.pack.implementation.tasks.length} selected features; {review.pack.implementation.deferred.length} deferred or excluded.</p>
    {review.pack.implementation.tasks.map(task=><article key={task.id} className="space-y-2 rounded border p-4"><h3 className="font-semibold">{task.title}</h3><p>{task.state}</p><p>{task.requirement}</p><ul className="list-disc pl-5">{task.acceptance.map((line,i)=><li key={i}>{line}</li>)}</ul>{task.blockers.map((line,i)=><p key={i} className="text-amber-600">{line}</p>)}</article>)}
    <button type="button" className="rounded border px-3 py-2" onClick={()=>{setExportError('');void exportPack().catch(()=>setExportError('Build pack could not be downloaded. Please try again.'));}}>Download build pack</button></>}
  </div>:<div className="space-y-4">
   <p className="text-sm text-muted-foreground">{tab==='sources'?'Changing source details clears its local review.':'Use concise descriptions and evidence references. Do not include secrets or raw proprietary source.'}</p>
   {!value[tab].length&&<p>No {tab} yet. Add a record below.</p>}
   {value[tab].map((row,index)=><fieldset key={row.id} disabled={disabled} className="space-y-3 rounded border p-4">
    <legend className="px-1 text-sm">{tab} {index+1}</legend>
    <div className="grid gap-3 md:grid-cols-2">{fields[tab].map(field=>{
     const current=row[field.key];const text=Array.isArray(current)?current.join('\n'):current;
     const sourceOptions=tab==='observations'&&field.key==='sourceId';
     return <label key={field.key} className={field.area?'md:col-span-2':''}>{field.label}
      {sourceOptions?<select className={control} value={text} onChange={e=>update(tab,index,field.key,e.target.value)}><option value="">Choose a source</option>{value.sources.map(s=><option key={s.id} value={s.id}>{String(s.url||s.id)}</option>)}</select>:
      field.options?<select className={control} value={text} onChange={e=>update(tab,index,field.key,e.target.value)}>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:
      field.area?<textarea className={control+' min-h-24'} maxLength={field.key==='acceptance'?20000:4000} value={text} onChange={e=>update(tab,index,field.key,field.key==='acceptance'?e.target.value.split('\n'):e.target.value)}/>:
      <input className={control} maxLength={field.key==='evidenceRef'?500:field.key==='title'?150:field.key==='reviewer'?150:2000} value={text} onChange={e=>update(tab,index,field.key,e.target.value)}/>}
     </label>;
    })}</div>
    {tab==='features'&&<fieldset className="space-y-2"><legend>Supporting observations</legend>{value.observations.map(o=><label className="flex items-start gap-2" key={o.id}><input type="checkbox" checked={(row.observationIds as string[]).includes(o.id)} onChange={e=>update('features',index,'observationIds',e.target.checked?[...(row.observationIds as string[]),o.id]:(row.observationIds as string[]).filter(id=>id!==o.id))}/><span>{String(o.summary||o.id)}</span></label>)}</fieldset>}
    <button type="button" disabled={!canRemove(value,tab,row.id)} title="Remove references before deleting a source or observation" className="rounded border px-3 py-2" onClick={()=>{if(confirm('Remove this record?'))onChange({...value,[tab]:value[tab].filter(x=>x.id!==row.id)});}}>Remove record</button>
   </fieldset>)}
   <button type="button" className="rounded border px-3 py-2" disabled={disabled||value[tab].length>=limits[tab]||(tab==='observations'&&!value.sources.length)||(tab==='features'&&!value.observations.length)} onClick={()=>add(tab)}>Add {tab==='sources'?'source':tab==='observations'?'observation':'feature'}</button>
  </div>}
 </div>;
}
