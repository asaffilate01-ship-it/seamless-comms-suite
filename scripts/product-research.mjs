import { open } from 'node:fs/promises';
import { createBuildPack } from './lib/product-research.mjs';

// Explicit input and output files; never executes content, URLs or REA commands.
try {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node scripts/product-research.mjs dossier.json build-pack.json');
  const source = await open(input, 'r');
  let data;
  try {
    if (!(await source.stat()).isFile() || (await source.stat()).size > 1_000_000) throw new Error('Dossier must be a file of at most 1 MB');
    data = await source.readFile('utf8');
    if (Buffer.byteLength(data) > 1_000_000) throw new Error('Dossier exceeds 1 MB');
  } finally { await source.close(); }
  const pack = createBuildPack(JSON.parse(data));
  const destination = await open(output, 'wx', 0o600);
  try { await destination.writeFile(JSON.stringify(pack, null, 2) + '\n'); }
  finally { await destination.close(); }
  console.log(`Build pack saved: ${pack.implementation.tasks.length} selected features; no generation or deployment performed.`);
} catch (error) {
  // Do not print malformed JSON, supplied URLs or raw observations into CI logs.
  console.error(error instanceof SyntaxError ? 'Invalid dossier JSON' : error.code ? `File operation failed (${error.code})` : error.message);
  process.exitCode = 1;
}
