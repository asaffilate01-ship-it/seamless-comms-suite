export const securityAreas=[
 {key:'static-guarding',name:'Building & static guarding',features:'Posts, reception, perimeter checks, opening/closing, lock-up and handovers'},
 {key:'close-protection',name:'Close protection',features:'Restricted engagements, team credentials, approved briefs, welfare and client confidentiality'},
 {key:'access-control',name:'Access & visitor management',features:'Visitor appointments, contractor permits, badges, zone approvals, keys and access event review'},
 {key:'mobile-patrol',name:'Mobile patrol & response',features:'Patrol runs, checkpoints, keyholding, alarm call-outs, dispatch and proof of attendance'},
 {key:'event-security',name:'Events & venues',features:'Deployment plans, door supervision, stewards, contractor coordination and incident logging'},
 {key:'control-room',name:'Control room & monitoring',features:'Alarm queues, CCTV references, operator handovers, escalation and response acknowledgement'},
 {key:'retail',name:'Retail & loss prevention',features:'Store assignments, stock-loss incident evidence, staff safety and reviewable reports'},
 {key:'industrial',name:'Industrial, construction & logistics',features:'Gatehouse, delivery records, contractor access, inspections and equipment custody'},
 {key:'residential',name:'Residential & estate security',features:'Concierge, resident-authorised visitors, communal patrols and maintenance referrals'},
 {key:'journey',name:'Protective travel & journey coordination',features:'Restricted trip briefs, authorised contacts, transport assignments and welfare check-ins'},
 {key:'investigations',name:'Investigations & evidence',features:'Case references, evidence provenance, access reviews, retention and disclosure approvals'},
 {key:'life-safety',name:'Fire, life safety & resilience',features:'Inspection schedules, evacuation exercise records, defects, response plans and corrective tasks'},
 {key:'workforce',name:'Workforce & compliance',features:'Credentials, training, availability, licences, rotas, breaks, welfare and supervisor review'},
 {key:'commercial',name:'Clients, contracts & commercial',features:'Service agreements, agreed rates, verified hours, invoice preparation, SLA reports and client portals'}
] as const;
export type SecurityArea=typeof securityAreas[number]['key'];
export const restrictedAreas=['close-protection','journey','investigations'] as const;
export const operationStages={site:['draft','active','archived'],engagement:['draft','scheduled','active','completed','cancelled'],incident:['open','review','resolved','closed']} as const;
export function canSeeRestricted(role:string){return ['owner','admin'].includes(role)}
