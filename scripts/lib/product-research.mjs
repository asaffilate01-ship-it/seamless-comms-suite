import { createHash } from 'node:crypto';

const fail = (message) => { throw new Error(message); };
const text = (value, label, max = 4000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Invalid ${label}`);
  return value.trim();
};
const rows = (value, label, max) => {
  if (!Array.isArray(value) || !value.length || value.length > max) fail(`Invalid ${label}`);
  return value;
};
const choice = (value, allowed, label) => allowed.includes(value) ? value : fail(`Invalid ${label}`);
const id = (value) => /^[a-z][a-z0-9-]{0,79}$/.test(text(value, 'ID', 80)) ? value : fail('Invalid ID');
function unique(items, label) {
  if (new Set(items.map(item => item.id)).size !== items.length) fail(`Duplicate ${label} ID`);
  return items;
}
function reference(value) {
  const url = new URL(text(value, 'source URL', 2000));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    fail('Source URL must be HTTPS without credentials, query or fragment');
  }
  return url.href;
}

/** Offline development data only. No crawling, execution, tenant access or authority grants. */
export function validateDossier(input) {
  if (!input || input.version !== 1) fail('Expected dossier version 1');
  const repository = text(input.repository, 'target repository', 200);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('Invalid target repository');
  const sources = unique(rows(input.sources, 'sources', 100).map(source => ({
    id: id(source.id), url: reference(source.url),
    basis: choice(source.basis, ['owned', 'public-observation', 'licensed', 'permission'], 'source basis'),
    permissionNote: text(source.permissionNote, 'source permission note'),
    review: choice(source.review, ['pending', 'reviewed'], 'source review'),
    reviewer: source.review === 'reviewed' ? text(source.reviewer, 'source reviewer', 150) : '',
  })), 'source');
  const observations = unique(rows(input.observations, 'observations', 300).map(observation => ({
    id: id(observation.id), sourceId: id(observation.sourceId),
    method: choice(observation.method, ['manual', 'rea', 'web-intelligence'], 'observation method'),
    kind: choice(observation.kind, ['observed', 'inferred'], 'evidence kind'),
    summary: text(observation.summary, 'observation'),
    evidenceRef: text(observation.evidenceRef, 'evidence reference', 500),
  })), 'observation');
  for (const observation of observations) {
    if (!sources.some(source => source.id === observation.sourceId)) fail('Unknown observation source');
  }
  const features = unique(rows(input.features, 'features', 150).map(feature => ({
    id: id(feature.id), title: text(feature.title, 'feature title', 150),
    decision: choice(feature.decision, ['build', 'defer', 'exclude'], 'feature decision'),
    area: choice(feature.area, ['frontend', 'backend', 'integration', 'data'], 'feature area'),
    requirement: text(feature.requirement, 'original requirement'),
    acceptance: rows(feature.acceptance, 'acceptance tests', 20).map(value => text(value, 'acceptance test', 1000)),
    observationIds: [...new Set(rows(feature.observationIds, 'feature evidence', 30).map(id))],
  })), 'feature');
  for (const feature of features) {
    if (feature.observationIds.some(key => !observations.some(item => item.id === key))) fail('Unknown feature observation');
  }
  return {
    version: 1, product: text(input.product, 'product', 120), repository,
    scope: choice(input.scope, ['selected-features', 'whole-product'], 'scope'),
    sources, observations, features,
  };
}

/** Outputs requirements, not source recovery or code generation. */
export function createBuildPack(input) {
  const dossier = validateDossier(input);
  const selected = dossier.features.filter(feature => feature.decision === 'build');
  const tasks = selected.map(feature => {
    const evidence = feature.observationIds.map(key => dossier.observations.find(item => item.id === key));
    const sources = [...new Set(evidence.map(item => item.sourceId))].map(key => dossier.sources.find(item => item.id === key));
    const blockers = sources.filter(source => source.review !== 'reviewed').map(source => `Review source ${source.id}`);
    if (evidence.some(item => item.kind === 'inferred')) blockers.push('Confirm inferred behaviour with direct evidence');
    return {
      id: feature.id, title: feature.title, area: feature.area,
      requirement: feature.requirement, acceptance: feature.acceptance,
      observationIds: feature.observationIds,
      state: blockers.length ? 'needs-research' : 'ready-for-planning', blockers,
    };
  });
  const implementation = {
    version: 1, product: dossier.product, repository: dossier.repository, scope: dossier.scope,
    status: 'development-draft', executable: false, tasks,
    deferred: dossier.features.filter(feature => feature.decision !== 'build').map(({id, title, decision}) => ({id, title, decision})),
  };
  // Keep raw observations out of the builder payload; preserve traceability in a separate evidence manifest.
  const evidence = {sources: dossier.sources, observations: dossier.observations};
  return {
    implementation, evidence,
    digest: createHash('sha256').update(JSON.stringify({implementation, evidence})).digest('hex'),
  };
}
