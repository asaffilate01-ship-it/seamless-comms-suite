import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT = /^[a-z0-9]{20}$/;
const SHA = /^[0-9a-f]{40}$/;

/** No network calls or mutations. Errors deliberately never echo input values. */
export function validateStagingTarget(env) {
  for (const key of ['PROJECT_REF', 'APPROVED_STAGING_PROJECT_REF', 'PRODUCTION_PROJECT_REF']) {
    if (typeof env[key] !== 'string' || !PROJECT.test(env[key])) {
      throw new Error(`Missing or invalid ${key}`);
    }
  }
  if (env.PROJECT_REF !== env.APPROVED_STAGING_PROJECT_REF) {
    throw new Error('Requested project is not the approved staging project');
  }
  if (env.PROJECT_REF === env.PRODUCTION_PROJECT_REF) {
    throw new Error('Staging and production projects must be different');
  }
  if (!['dry-run', 'apply'].includes(env.MODE)) throw new Error('Invalid migration mode');
  if (!SHA.test(env.EXPECTED_SHA ?? '') || !SHA.test(env.CHECKED_OUT_SHA ?? '') ||
      env.EXPECTED_SHA !== env.CHECKED_OUT_SHA) {
    throw new Error('Expected release SHA does not match the checked-out commit');
  }
  if (env.MODE === 'apply' && env.CONFIRMATION !== 'MIGRATE-STAGING') {
    throw new Error('Apply requires the exact MIGRATE-STAGING confirmation');
  }
  for (const key of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']) {
    if (typeof env[key] !== 'string' || env[key].trim().length === 0) {
      throw new Error(`Missing ${key}`);
    }
  }
  return { target: 'approved-staging', mode: env.MODE, sha: env.CHECKED_OUT_SHA };
}

/** Reject files the CLI might silently skip, duplicate timestamps and symlinks. */
export function migrationManifest(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (!entries.length) throw new Error('No SQL migrations found');
  const versions = new Set();
  return entries.map((entry) => {
    const match = /^(\d{14})_[a-zA-Z0-9_.-]+\.sql$/.exec(entry.name);
    if (!entry.isFile() || !match) throw new Error('Invalid migration filename or non-regular SQL file');
    if (versions.has(match[1])) throw new Error('Duplicate migration timestamp');
    versions.add(match[1]);
    const content = readFileSync(resolve(directory, entry.name));
    return { version: match[1], file: entry.name, sha256: createHash('sha256').update(content).digest('hex') };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'target') {
      console.log(JSON.stringify(validateStagingTarget(process.env), null, 2));
    } else if (process.argv[2] === 'manifest' && process.argv.length <= 4) {
      console.log(JSON.stringify(migrationManifest(process.argv[3] ?? 'supabase/migrations'), null, 2));
    } else {
      throw new Error('Usage: node verification/staging/guard.mjs target|manifest [migration-directory]');
    }
  } catch (error) {
    // Filesystem errors can contain paths; do not forward arbitrary exception text.
    const known = error instanceof Error && !('code' in error);
    console.error(known ? error.message : 'Migration inventory could not be read');
    process.exitCode = 1;
  }
}
