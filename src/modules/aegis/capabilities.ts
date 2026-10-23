/** Research-backed build scope, not a claim that any capability is live. */
export const AEGIS_PRODUCT_KEY='aegis-command';
export const aegisCapabilities=[
 {key:'command',name:'Command centre & multi-site operations',benchmark:'Ctrl Room · TrackTik · GuardsPro',shared:'Dispatch, Geo, events, tenant scope',gap:'Live site/shift projections and exception queues'},
 {key:'patrol',name:'GPS / QR / NFC patrol assurance',benchmark:'Ctrl Room · TrackTik · GuardsPro',shared:'Field Agent, Geo, private evidence storage',gap:'Checkpoint provisioning, signed evidence, offline sync and replay protection'},
 {key:'incidents',name:'Incident reporting & investigations',benchmark:'Ctrl Room · TrackTik · Silvertrac',shared:'Cases, documents, audit, review queues',gap:'Security incident schema, evidence custody, severity and resolution stages'},
 {key:'workforce',name:'Scheduling, attendance & compliance',benchmark:'Ctrl Room · TrackTik · Connecteam · GuardsPro',shared:'Identity, scheduling, skills, approvals',gap:'Licence expiry, fatigue, breaks, leave, swaps and geofenced attendance'},
 {key:'safety',name:'Lone worker, SOS & alarm response',benchmark:'Ctrl Room · TrackTik · GuardsPro',shared:'Communications, dispatch, escalation policies',gap:'Acknowledged delivery, retry workers, escalation timers and operational acceptance'},
 {key:'commercial',name:'Contracts, payroll preparation & billing',benchmark:'Ctrl Room · TrackTik · GuardsPro',shared:'Billing, finance adapters, approval gates',gap:'Contract rates, overtime rules, reconciliation and provider exports'},
 {key:'access',name:'Visitors, keys, vehicles & equipment',benchmark:'TrackTik · GuardsPro · Silvertrac',shared:'Forms, assets, CRM, audit',gap:'Custody, visitor permissions, parking and maintenance workflows'},
 {key:'client',name:'Client portal & verified service reports',benchmark:'Ctrl Room · TrackTik · Silvertrac · GuardsPro',shared:'Portal identities, documents, analytics',gap:'Client/site scope, approved-only reports, SLAs and scheduled delivery'},
 {key:'intelligence',name:'Omniqora Intelligence & agent workflows',benchmark:'TrackTik AI reporting; differentiated Aegis target',shared:'AI governance, approved use cases, budgeted queue, provider bindings',gap:'Tenant-scoped source adapters, evaluations and separately approved runtime activation'}
] as const;
export const aegisStages=[
 'Factory product registration and source mapping',
 'Tenant/agency/site/role model and security operations data plane',
 'Officer attendance, patrol evidence and incident-to-dispatch workflows',
 'Omniqora read-only Intelligence with citations and human review',
 'Provider sandbox validation, offline field QA and pilot acceptance',
] as const;
export type Readiness={productActive:boolean;governanceEntitled:boolean;runtimeEntitled:boolean;providerVerified:boolean};
export function aegisReadiness(s:Readiness){return {canConfigure:s.productActive&&s.governanceEntitled,canRequestRuntime:s.productActive&&s.runtimeEntitled&&s.providerVerified,live:false as const,blockers:[!s.productActive&&'Active Aegis tenant product required',!s.governanceEntitled&&'AI governance entitlement required',!s.runtimeEntitled&&'Intelligence runtime entitlement required',!s.providerVerified&&'Fresh verified provider binding required'].filter(Boolean) as string[]}}
