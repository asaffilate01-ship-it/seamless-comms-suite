import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
import ts from 'typescript';
import {JSDOM} from 'jsdom';

test('history UI restores only after confirmation and blocks review of unsaved edits',async()=>{
 const rootDir=fileURLToPath(new URL('../../',import.meta.url)),temp=mkdtempSync(join(rootDir,'.research-ui-test-'));
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
 const prior={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,confirm:globalThis.confirm};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const React=await import('react'),{createRoot}=await import('react-dom/client');
 const state={data:{revisions:[{revision:1,name:'Earlier',saved_by:'saver',saved_at:'2026-10-24'}],reviews:[],canReview:true},calls:[],restored:null};
 globalThis.__researchHistoryTest=state;
 writeFileSync(join(temp,'boundary.mjs'),`export const useServerFn=f=>f; export const useQuery=()=>({data:globalThis.__researchHistoryTest.data,refetch:async()=>{}});
 export const listResearchHistory=async()=>{}; export const exportResearchHandoff=async()=>{throw new Error("An authenticated review is required for this revision.")};
 export const readResearchRevision=async input=>{globalThis.__researchHistoryTest.calls.push(input);return {name:'Earlier',dossierJson:'{}'}};
 export const reviewResearchProject=async input=>{globalThis.__researchHistoryTest.calls.push(input)};`);
 let source=readFileSync(join(rootDir,'src/modules/product-research/ResearchHistory.tsx'),'utf8');
 source=source.replaceAll("'@tanstack/react-query'","'./boundary.mjs'").replaceAll("'@tanstack/react-start'","'./boundary.mjs'").replaceAll("'./functions'","'./boundary.mjs'");
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(compiled.diagnostics.length,0);writeFileSync(join(temp,'history.mjs'),compiled.outputText);
 const {ResearchHistory}=await import(pathToFileURL(join(temp,'history.mjs')).href);
 const root=createRoot(document.getElementById('root'));
 const props={tenantId:'tenant',project:{id:'project',revision:2},disabled:false,canWrite:true,dirty:true,onRestore:value=>{state.restored=value;},onBusy:()=>{},onMessage:()=>{}};
 const render=()=>React.act(async()=>root.render(React.createElement(ResearchHistory,props)));
 const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
 try{
  await render();assert.equal(document.querySelector('fieldset').disabled,true);assert.equal(button('Download reviewed handoff').disabled,true);
  globalThis.confirm=()=>false;await React.act(async()=>button('Restore as draft').click());assert.equal(state.calls.length,0);
  globalThis.confirm=()=>true;await React.act(async()=>button('Restore as draft').click());assert.deepEqual(state.calls[0],{data:{tenantId:'tenant',projectId:'project',revision:1}});assert.equal(state.restored.name,'Earlier');
  props.dirty=false;await render();assert.equal(document.querySelector('fieldset').disabled,false);assert.equal(button('Download reviewed handoff').disabled,false);let status='';props.onMessage=value=>{status=value;};await render();await React.act(async()=>button('Download reviewed handoff').click());assert.match(status,/authenticated review is required/);
  const area=document.querySelector('textarea');
  await React.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(area,'Checked evidence');area.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  assert.equal(button('Record review').disabled,false);
  await React.act(async()=>button('Record review').click());assert.deepEqual(state.calls[1],{data:{tenantId:'tenant',projectId:'project',revision:2,decision:'reviewed',note:'Checked evidence'}});
  props.canWrite=false;state.data.canReview=false;await render();assert.equal(button('Restore as draft').disabled,true);assert.equal(button('Record review'),undefined);
 }finally{await React.act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,prior);delete globalThis.IS_REACT_ACT_ENVIRONMENT;delete globalThis.__researchHistoryTest;rmSync(temp,{recursive:true,force:true});}
});
