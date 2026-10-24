import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankDossier,parseDraft,canRemove,changeSource} from '../../tools/product-research/editor-model.mjs';
import {planBuildPack} from '../../scripts/lib/product-research-model.mjs';
import {createBuildPack} from '../../scripts/lib/product-research.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('../../docs/factory/examples/product-research.json',import.meta.url),'utf8'));
test('unfinished drafts survive a save and reopen',()=>{
 const d=blankDossier();d.product='Unfinished project';
 assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(d))),d);
 assert.throws(()=>planBuildPack(d));
});
test('malformed drafts and oversized record lists are rejected',()=>{
 for(const d of [null,{}, {...blankDossier(),sources:[null]}, {...blankDossier(),sources:Array(101).fill({})}])assert.throws(()=>parseDraft(d));
 const d=fixture();d.features[0].acceptance=[{}];assert.throws(()=>parseDraft(d));
});
test('referenced source and observations cannot be removed',()=>{
 const d=fixture();assert.equal(canRemove(d,'sources','voxentri'),false);
 assert.equal(canRemove(d,'observations','brief-snapshot'),false);
 d.features=[];assert.equal(canRemove(d,'observations','brief-snapshot'),true);
});
test('editing source identity or access notes clears its local review',()=>{
 const source={...fixture().sources[0],review:'reviewed',reviewer:'Reviewer'};
 for(const key of ['url','basis','permissionNote']){
  const changed=changeSource(source,key,'changed');assert.equal(changed.review,'pending');assert.equal(changed.reviewer,'');
 }
 assert.equal(source.review,'reviewed');
});
test('browser and CLI packs have identical content and digest',async()=>{
 const input=fixture(),browser=planBuildPack(input),cli=createBuildPack(input);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(browser)));
 const digest=Buffer.from(bytes).toString('hex');
 assert.deepEqual({...browser,digest},cli);
});
