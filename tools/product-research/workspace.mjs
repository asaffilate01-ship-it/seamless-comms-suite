import {planBuildPack} from '../../scripts/lib/product-research-model.mjs';
import {blankDossier,templates,parseDraft,canRemove,changeSource} from './editor-model.mjs';
let dossier=blankDossier(),dirty=false,tab='sources';
const $=id=>document.getElementById(id);
const status=message=>{$('status').textContent=message;};
const changed=()=>{dirty=true;status('Unsaved changes — download the dossier to keep them.');};
function el(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
function field(label,value,onChange,options=null,area=false){
 const wrapper=el('label',label);const control=el(options?'select':area?'textarea':'input');
 if(options){for(const [key,title] of options){const option=el('option',title);option.value=key;control.append(option);}}
 else control.maxLength=4000;
 control.value=value;control.addEventListener('input',()=>{onChange(control.value);changed();});wrapper.append(control);return wrapper;
}
const options=values=>values.map(v=>[v,v]);
function card(group,row,title){
 const node=el('article',null,'record'),head=el('div',null,'section-head');head.append(el('h3',title));
 const remove=el('button','Remove');remove.type='button';remove.className='danger';
 remove.disabled=!canRemove(dossier,group,row.id);remove.title=remove.disabled?'Remove references to this record first':'Remove record';
 remove.onclick=()=>{if(confirm('Remove this record?')){dossier[group]=dossier[group].filter(x=>x.id!==row.id);changed();render();}};
 head.append(remove);node.append(head,el('p',row.id,'subtle'));return node;
}
function render(){
 for(const key of ['product','repository','scope'])$(key).value=dossier[key];
 renderSources();renderObservations();renderFeatures();
 if(tab==='review')renderReview();
}
function renderSources(){
 const list=$('source-list');list.replaceChildren();
 for(const row of dossier.sources){
  const node=card('sources',row,'Source'),grid=el('div',null,'grid');
  const update=(key,value)=>{Object.assign(row,changeSource(row,key,value));if(!['review','reviewer'].includes(key)){reviewControl.querySelector('select').value='pending';reviewerControl.querySelector('input').value='';}};
  const reviewControl=field('Review state',row.review,v=>update('review',v),options(['pending','reviewed']));
  const reviewerControl=field('Reviewer name (local record)',row.reviewer,v=>update('reviewer',v));
  grid.append(field('Source URL',row.url,v=>update('url',v)),field('Access basis',row.basis,v=>update('basis',v),options(['owned','public-observation','licensed','permission'])),field('Permission / access notes',row.permissionNote,v=>update('permissionNote',v),null,true),reviewControl,reviewerControl);
  node.append(grid);list.append(node);
 }if(!dossier.sources.length)list.append(el('p','Add a source to begin.','empty'));
 $('add-source').disabled=dossier.sources.length>=100;
}
function renderObservations(){
 const list=$('observation-list');list.replaceChildren();
 for(const row of dossier.observations){
  const node=card('observations',row,'Observation'),grid=el('div',null,'grid');
  grid.append(field('Source',row.sourceId,v=>row.sourceId=v,[['','Choose a source'],...dossier.sources.map(s=>[s.id,s.url||s.id])]),field('Method',row.method,v=>row.method=v,options(['manual','rea','web-intelligence'])),field('Evidence kind',row.kind,v=>row.kind=v,options(['observed','inferred'])),field('Evidence reference',row.evidenceRef,v=>row.evidenceRef=v),field('Observation summary',row.summary,v=>row.summary=v,null,true));
  node.append(grid);list.append(node);
 }if(!dossier.observations.length)list.append(el('p','Add an observation and link it to a source.','empty'));
 $('add-observation').disabled=!dossier.sources.length||dossier.observations.length>=300;
}
function renderFeatures(){
 const list=$('feature-list');list.replaceChildren();
 for(const row of dossier.features){
  const node=card('features',row,row.title||'New feature'),grid=el('div',null,'grid');
  grid.append(field('Feature title',row.title,v=>row.title=v),field('Decision',row.decision,v=>row.decision=v,options(['build','defer','exclude'])),field('Area',row.area,v=>row.area=v,options(['frontend','backend','integration','data'])),field('Original requirement',row.requirement,v=>row.requirement=v,null,true),field('Acceptance tests — one per line',row.acceptance.join('\n'),v=>row.acceptance=v.split('\n').filter(s=>s.trim()),null,true));
  const checks=el('fieldset',null,'checks full');checks.append(el('legend','Supporting observations'));
  for(const observation of dossier.observations){const label=el('label');const check=el('input');check.type='checkbox';check.checked=row.observationIds.includes(observation.id);check.onchange=()=>{row.observationIds=check.checked?[...row.observationIds,observation.id]:row.observationIds.filter(id=>id!==observation.id);changed();};label.append(check,document.createTextNode(observation.summary||observation.id));checks.append(label);}
  grid.append(checks);node.append(grid);list.append(node);
 }if(!dossier.features.length)list.append(el('p','Add an original requirement supported by your observations.','empty'));
 $('add-feature').disabled=!dossier.observations.length||dossier.features.length>=150;
}
function renderReview(){
 const list=$('review-list');list.replaceChildren();
 try{
  const pack=planBuildPack(dossier);
  list.append(el('p',`${pack.implementation.tasks.length} selected · ${pack.implementation.deferred.length} deferred or excluded`));
  for(const task of pack.implementation.tasks){const node=el('article',null,'record');node.append(el('h3',task.title),el('p',task.state,'badge'),el('p',task.requirement));const acceptance=el('ul');for(const line of task.acceptance)acceptance.append(el('li',line));node.append(acceptance);for(const blocker of task.blockers)node.append(el('p',blocker,'blocker'));list.append(node);}
 }catch{list.append(el('p','Complete the required project, source, evidence and feature fields before exporting a build pack.','blocker'));}
}
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const key of ['product','repository','scope'])$(key).oninput=event=>{dossier[key]=event.target.value;changed();};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{tab=button.dataset.tab;for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',String(b===button));for(const section of document.querySelectorAll('.tab'))section.hidden=section.id!==tab;render();};
for(const [button,group,prefix] of [['add-source','sources','source'],['add-observation','observations','observation'],['add-feature','features','feature']])$(button).onclick=()=>{dossier[group].push({...structuredClone(templates[group]),id:prefix+'-'+crypto.randomUUID()});changed();render();};
$('new').onclick=()=>{if(dirty&&!confirm('Discard unsaved changes?'))return;dossier=blankDossier();dirty=false;render();status('New dossier. Download it when you want to keep your work.');};
$('save').onclick=()=>{try{download('research-dossier.json',parseDraft(dossier));dirty=false;status('Dossier download requested. Keep this file to reopen your work.');}catch{status('The draft has invalid fields and could not be downloaded.');}};
$('export').onclick=async()=>{try{const pack=planBuildPack(dossier);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(pack)));download('implementation-build-pack.json',{...pack,digest:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')});status('Build pack download requested. Your editable dossier must be downloaded separately.');}catch{status('Cannot export: complete the fields and check Build review.');}};
$('import').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1_000_000)throw new Error();const next=parseDraft(JSON.parse(await file.text()));if(dirty&&!confirm('Replace the current unsaved dossier?'))return;dossier=next;dirty=false;render();status('Dossier opened. Changes stay in this browser until downloaded.');}catch{status('Could not open this dossier. Use a version 1 dossier under 1 MB. Current work was preserved.');}finally{event.target.value='';}};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
render();
