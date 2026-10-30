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
    b.onLoad({filter: /.*/, namespace:'stub'}, args => ({contents: args.path === 'transport' ? 'export const useServerFn = fn => fn;' : 'export const prepareReviewStudy = async () => { throw new Error("No session") }; export const inspectReviewReport = prepareReviewStudy;', loader:'js'}));
  }}] });
  try {
    await writeFile(output, result.outputFiles[0].text);
    const { ReviewLabPanel } = await import(output.href);
    const html = renderToStaticMarkup(React.createElement(ReviewLabPanel,{tenantId:'11111111-1111-4111-8111-111111111111'}));
    for(const text of ['SaaS Review Lab','MiroFish is not connected','Download before leaving','Prepare study','Audience','Restore draft']) assert.ok(html.includes(text),text);
    assert.match(html,/disabled="">Prepare study/);
    assert.ok(!html.includes('Prepared — not executed'));
  } finally { await unlink(output).catch(()=>{}); }
});
