import {connectionConfig, fetchSnapshot} from './control-plane.mjs';
// Run explicitly by an operator; does not provision or activate a workspace.
try {
  const country = process.argv[2];
  const config = connectionConfig(process.env, country);
  const snapshot = await fetchSnapshot(config);
  console.log(JSON.stringify({country, product: 'eventplanr', snapshotVerified: true,
    productionReady: false, note: 'Connection snapshot only; no provider or customer journey tested'}));
} catch {
  console.error('Factory preflight failed. Verify the protected binding, country and active product; no credentials or response bodies are logged.');
  process.exitCode = 1;
}
