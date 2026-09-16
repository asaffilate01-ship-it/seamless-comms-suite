# Retained source references

These two earlier Vinext applications are preserved for follow-on integration. Neither is imported, built, deployed or mounted by the current TanStack/Lovable application. Their manifests and hosting metadata describe their original environments, not this repository's deployment.

- `ai-intelligence-pilot/`: the earlier combined AI pilot, including reception/voice and integration contracts.
- `intelligence-engine/`: the earlier intelligence full-suite engine and its separate tests.

The active application is the repository root. Business360, transformation and the specialist AI hub run from `services/transformation/`; current knowledge/compliance integration runs through `src/modules/rrci/` and `services/rrci/`. Do not replace root routing, lockfiles or hosting configuration with files from these references.

Reference applications were not rebuilt or verified in the September 16 integration. Historical reports inside them are evidence of earlier work only.
