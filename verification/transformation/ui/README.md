# Workspace integration verification

From this directory, run `npm ci --ignore-scripts`, `npx --no-install tsc --noEmit`, then `node dom-check.mjs`. Requires Node 20+ and Python 3.11+. The script bundles the package UI, starts an isolated Python service on loopback port 8093 and drives React through jsdom using the signed Node caller.

The backend seeds fictional company data and explicitly substitutes model/connector contract fixtures. It never calls a real provider or customer system. The key in these scripts is a fictional local test value, not a deployment secret.

The check covers 24 interactions across the existing workspace and new AI hub. Results are written to `../ui-results.json`. This is DOM interaction verification, not actual-browser screenshot/layout validation or live model quality testing. Generated `component.mjs`, `server-client.mjs`, `node_modules/` and temporary databases are not source deliverables.
