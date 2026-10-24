import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
import ts from 'typescript';
import {JSDOM} from 'jsdom';

test('hosted visual editor supports record creation, evidence review and read-only users',async()=>{
 const rootDir=fileURLToPath(new URL('../../',import.meta.url));
 const temp=mkdtempSync(join(rootDir,'.research-ui-test-'));
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
 const prior={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const React=await import('react');const {createRoot}=await import('react-dom/client');
 const source=readFileSync(join(rootDir,'src/modules/product-research/DossierEditor.tsx'),'utf8');
 let compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const path of ['tools/product-research/editor-model.mjs','scripts/lib/product-research-model.mjs'])compiled=compiled.replace('../../../'+path,pathToFileURL(join(rootDir,path)).href);
 writeFileSync(join(temp,'editor.mjs'),compiled);
 const {DossierEditor}=await import(pathToFileURL(join(temp,'editor.mjs')).href);
 const {blankDossier}=await import('../../tools/product-research/editor-model.mjs');
 let latest=blankDossier(),locked=false;
 function Harness(){const [value,setValue]=React.useState(latest);latest=value;return React.createElement(DossierEditor,{value,disabled:locked,onChange:setValue});}
 const root=createRoot(document.getElementById('root'));
 const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
 try{
  await React.act(async()=>root.render(React.createElement(Harness)));
  await React.act(async()=>button('Add source').click());
  assert.equal(latest.sources.length,1);
  assert.equal(latest.sources[0].review,'pending');
  await React.act(async()=>button('Observations (0)').click());
  await React.act(async()=>button('Add observation').click());
  assert.equal(latest.observations.length,1);
  await React.act(async()=>button('Build review').click());
  assert.match(document.body.textContent,/Complete the corresponding fields/);
  assert.equal(button('Download build pack'),undefined);
  locked=true;await React.act(async()=>root.render(React.createElement(Harness)));
  await React.act(async()=>button('Sources (1)').click());
  assert.equal(button('Add source').disabled,true);
  assert.ok([...document.querySelectorAll('fieldset')].some(f=>f.disabled));
  await React.act(async()=>button('Add source').click());
  assert.equal(latest.sources.length,1);
 }finally{
  await React.act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,prior);delete globalThis.IS_REACT_ACT_ENVIRONMENT;rmSync(temp,{recursive:true,force:true});
 }
});
