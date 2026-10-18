import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function load(){
  const source=await readFile(new URL('../../src/modules/connectors/connector-intelligence.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal(compiled.diagnostics?.length??0,0);
  const mod={exports:{}};
  vm.runInNewContext(compiled.outputText,{module:mod,exports:mod.exports,URL,Set,Map});
  return mod.exports;
}
const {inspectConnectorSource,generateReviewOnlyConnector}=await load();
const responseSchema={properties:{quoteId:{type:'string'},price:{type:'number'},accessToken:{type:'string'}}};
const requestSchema={properties:{pickup:{type:'string'},dropoff:{type:'string'},creditCard:{type:'string'}}};
const quoteOperation={
  operationId:'createQuote', parameters:[{in:'query',name:'currency'},{in:'query',name:'api_key'}],
  requestBody:{content:{'application/json':{schema:requestSchema}}},
  responses:{'200':{content:{'application/json':{schema:responseSchema}}}},
};
const safeOpenApi=JSON.stringify({
  openapi:'3.0.3', info:{title:'Demonstration API'}, servers:[{url:'https://api.example.test'}],
  components:{securitySchemes:{bearer:{type:'http',scheme:'bearer'}}},
  paths:{'/v1/quotes':{post:quoteOperation}},
});

test('OpenAPI 3.x importer extracts structural keys only and inert TypeScript scaffold',()=>{
  const analyzed=inspectConnectorSource('openapi',safeOpenApi);
  assert.equal(analyzed.status,'review_only');
  assert.equal(analyzed.sourceHost,'api.example.test');
  assert.deepEqual([...analyzed.authentication],['bearer']);
  assert.equal(analyzed.operations.length,1);
  assert.equal(analyzed.operations[0].path,'/v1/quotes');
  assert.deepEqual([...analyzed.operations[0].queryFields],['currency']);
  assert.deepEqual([...analyzed.operations[0].requestFields],['dropoff','pickup']);
  assert.deepEqual([...analyzed.operations[0].responseFields],['price','quoteId']);
  const result=generateReviewOnlyConnector(analyzed);
  assert.match(result,/export class ReviewOnlyConnector/);
  assert.match(result,/REVIEW_ONLY/);
  assert.doesNotMatch(result,/fetch\s*\(|Authorization\s*:|api\.example\.test|creditCard|accessToken|api_key/i);
  const syntax=ts.createSourceFile('draft.ts',result,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(syntax.parseDiagnostics.length,0);
});

test('HAR importer discards tokens, payload values, contact fields, and path IDs',()=>{
  const secret='TOP_SECRET_PERSONAL_93892';
  const entry=(path,method,body,host='api.example.test')=>({
    request:{url:'https://' + host + path,method,headers:[{name:'Authorization',value:'Bearer ' + secret},{name:'Cookie',value:secret}],
      postData:{text:JSON.stringify(body)}},
    response:{status:200,content:{text:JSON.stringify({quoteId:'q-2',price:9,accessToken:secret,email:'private@example.test'})}}});
  const sample=JSON.stringify({log:{entries:[
    entry('/v1/orders/alice@example.test?currency=GBP&access_token='+secret,'POST',{item:'coffee',token:secret,customerEmail:'private@example.test'}),
    entry('/v1/orders/789?currency=USD','POST',{item:'tea',cvv:'123'}),
    entry('/analytics','GET',{},'other.example.test'),
  ]}});
  const analyzed=inspectConnectorSource('har',sample);
  assert.equal(analyzed.operations.length,1);
  assert.equal(analyzed.operations[0].path,'/v1/orders/{id}');
  assert.deepEqual([...analyzed.operations[0].queryFields],['currency']);
  assert.deepEqual([...analyzed.operations[0].requestFields],['item']);
  assert.deepEqual([...analyzed.operations[0].responseFields],['price','quoteId']);
  assert.deepEqual([...analyzed.authentication],['cookie','header_authorization']);
  assert.ok(analyzed.warnings.some(x=>x.includes('Other hosts')));
  const all=JSON.stringify(analyzed)+generateReviewOnlyConnector(analyzed);
  for(const forbidden of [secret,'private@example.test','alice@example.test','access_token','customerEmail','cvv'])
    assert.equal(all.includes(forbidden),false,forbidden);
});

test('unsafe input fails closed rather than performing a request or generating code',()=>{
  assert.throws(()=>inspectConnectorSource('openapi','{"openapi":"2.0","paths":{}}'),/OpenAPI 3/);
  assert.throws(()=>inspectConnectorSource('har',JSON.stringify({log:{entries:[{request:{url:'http://127.0.0.1/health',method:'GET'}}]}})),/HTTPS/);
  assert.throws(()=>inspectConnectorSource('openapi',' '),/non-empty/);
  assert.throws(()=>inspectConnectorSource('openapi','x'.repeat(300_001)),/up to/);
  assert.throws(()=>inspectConnectorSource('openapi','{'),/Invalid JSON/);
  const lots=Object.fromEntries(Array.from({length:81},(_,i)=>['/v1/quotes/' + i,{get:{responses:{'200':{}}}}]));
  assert.throws(()=>inspectConnectorSource('openapi',JSON.stringify({openapi:'3.1.0',paths:lots})),/maximum 80/);
  const malformed=JSON.stringify({openapi:'3.0.2',paths:{'//evil':{get:{responses:{'200':{}}}},'/safe':{get:{responses:{'200':{}}}}}});
  assert.equal(inspectConnectorSource('openapi',malformed).operations.length,1);
  const xs=inspectConnectorSource('openapi',safeOpenApi);
  xs.operations[0].id='unsafe();\nalert(1);';
  assert.throws(()=>generateReviewOnlyConnector(xs),/invalid operation/i);
});

test('Workbench contains only local import controls and explicitly disallows deployment',async()=>{
  const ui=await readFile(new URL('../../src/modules/connectors/ConnectorIntelligenceWorkbench.tsx',import.meta.url),'utf8');
  assert.match(ui,/inspectConnectorSource/);
  assert.match(ui,/generateReviewOnlyConnector/);
  assert.match(ui,/review-only/i);
  assert.doesNotMatch(ui,/\bfetch\s*\(|useServerFn|localStorage|sessionStorage|XMLHttpRequest/);
  const bridge=await readFile(new URL('../../src/routes/_authenticated/app.connector-hub.tsx',import.meta.url),'utf8');
  assert.match(bridge,/ConnectorIntelligenceWorkbench/);
});
