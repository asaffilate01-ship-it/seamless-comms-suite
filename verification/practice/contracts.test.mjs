import assert from 'node:assert/strict';
import {test} from 'node:test';
import {quoteTotal,serviceDefinition,PRACTICE_PACKS,practiceCommand} from '../../src/modules/practice/workspace-contracts.ts';
import {validatePracticeFile} from '../../src/modules/practice/files.server.ts';
test('pricing uses integer minor units and rejects unsafe totals',()=>{
 assert.equal(quoteTotal(10000,250,4,5000),16000);
 assert.throws(()=>quoteTotal(0,0.1,3,0));assert.throws(()=>quoteTotal(0,-1,3,0));
 assert.throws(()=>quoteTotal(100000000000,1,1,0));
});
test('industry templates are executable and work updates require a revision',()=>{
 for(const p of PRACTICE_PACKS)assert.equal(serviceDefinition.parse(p).phases.length,p.phases.length);
 assert.equal(practiceCommand.safeParse({operation:'phase.complete',jobId:'00000000-0000-4000-8000-000000000001',phaseId:'00000000-0000-4000-8000-000000000002'}).success,false);
 assert.equal(serviceDefinition.safeParse({...PRACTICE_PACKS[0],phases:[]}).success,false);
});
test('attachments reject disguised types and excessive payloads',()=>{
 assert.equal(validatePracticeFile(Buffer.from('%PDF-1.7\nfixture').toString('base64'),'application/pdf').length,16);
 assert.throws(()=>validatePracticeFile(Buffer.from('<html>bad</html>').toString('base64'),'application/pdf'));
 assert.throws(()=>validatePracticeFile(Buffer.from('<html>bad</html>').toString('base64'),'text/csv'));
 assert.throws(()=>validatePracticeFile(Buffer.alloc(5242881).toString('base64'),'image/png'));
 assert.throws(()=>validatePracticeFile('@@@','application/pdf'));
});
