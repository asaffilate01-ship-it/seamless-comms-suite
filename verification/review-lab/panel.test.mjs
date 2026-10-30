import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { writeFile, unlink } from 'node:fs/promises';

// Render the real component with server transport mocked; no backend session/provider calls.
test('initial panel renders usable labelled inputs and honest disconnected state', async () => {
  const output = new URL('./.panel-test.generated.mjs', import.meta.url);
  const result = await build({ entryPoints: ['src/modules/review-lab/ReviewLabPanel.tsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, plugins: [{ name: 'server-boundary', setup(b) {
    b.onResolve({filter: /^\.\/functions$/}, () => ({path: 'functions', namespace: 'stub'}));
    b.onResolve({filter: /^@tanstack\/react-start$/}, () => ({path: 'transport', namespace: 'stub'}));
    b.onLoad({filter: /.*/, namespace:'stub'}, args => ({contents: args.path === 'transport' ? 'export const useServerFn = fn => fn;' : 'export const prepareReviewStudy = async () => { throw new Error("No session") }; export const inspectReviewReport = prepareReviewStudy; export const inspectReviewTranscript = prepareReviewStudy; export const exportReviewExperiments = prepareReviewStudy; export const restoreReviewSession = prepareReviewStudy; export const exportReviewSession = prepareReviewStudy;', loader:'js'}));
  }}] });
  try {
    await writeFile(output, result.outputFiles[0].text);
    const { ReviewLabPanel } = await import(output.href);
    const html = renderToStaticMarkup(React.createElement(ReviewLabPanel,{tenantId:'11111111-1111-4111-8111-111111111111'}));
    for(const text of ['SaaS Review Lab','MiroFish is not connected','Download before leaving','Prepare study','Audience','Restore draft']) assert.ok(html.includes(text),text);
    assert.match(html,/disabled="">Prepare study/);
    assert.ok(!html.includes('Prepared — not executed'));
    assert.ok(html.includes('Restore session file'));
    assert.ok(html.includes('not cloud history'));
    assert.ok(!html.includes('Validate and restore session'));
    assert.ok(!/disabled="">Download draft/.test(html), 'unfinished drafts remain downloadable');
  } finally { await unlink(output).catch(()=>{}); }
});

test('discussion renders untrusted text safely and shows coverage and filters', async () => {
  const output = new URL('./.discussion-test.generated.mjs', import.meta.url);
  const result = await build({entryPoints:['src/modules/review-lab/DiscussionPanel.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
  try {
    await writeFile(output,result.outputFiles[0].text);
    const {DiscussionPanel}=await import(output.href);
    const transcript={version:1,studyDigest:'a'.repeat(64),classification:'unverified_simulated_feedback',coverage:{suppliedTurns:1,plannedTurns:6},messages:[{id:'m1',agentId:'persona-1',round:1,text:'<script>alert(1)</script>',evidenceIds:[]}]};
    const html=renderToStaticMarkup(React.createElement(DiscussionPanel,{transcript}));
    assert.ok(html.includes('1 of 6 planned turns supplied'));
    assert.ok(html.includes('All personas')); assert.ok(html.includes('All rounds'));
    assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('not a live chat'));
  } finally { await unlink(output).catch(()=>{}); }
});
