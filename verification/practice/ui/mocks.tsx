import React from 'react';
export const useServerFn=(fn:any)=>fn;
export const Link=({to,children,...props}:any)=><a href={to} {...props}>{children}</a>;
export const AppShell=({title,subtitle,actions,children}:any)=><main className="min-h-screen bg-surface-2 p-4 md:p-8"><header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div>{actions}</header>{children}</main>;
const service={id:'service',service_key:'accounts',name:'Accounts preparation',industry:'Accounting',currency:'GBP',base_minor:25000,unit_minor:1000,recurrence:'monthly',version:1,phases:[{title:'Collect records',budgetMinutes:30},{title:'Preparation',budgetMinutes:120},{title:'Review',budgetMinutes:45}]};
const jobs=[{id:'job',client_id:'client',template_id:'service',template_snapshot:service,service_key:'accounts',period_key:'2026-09',status:'collecting',progress:0,internal_due_at:'2020-09-28',due_at:'2026-10-07',work_version:1,assigned_user_ids:['owner']},{id:'job2',client_id:'client2',template_id:'service',template_snapshot:service,service_key:'accounts',period_key:'2026-09',status:'review',progress:67,internal_due_at:'2026-10-01',due_at:'2026-10-10',work_version:2,assigned_user_ids:[]}];
const dataset={clients:[{id:'client',legal_name:'Aster Trading Ltd',status:'active',client_kind:'company',country_code:'GB'},{id:'client2',legal_name:'Northbank Studio',status:'onboarding',client_kind:'company',country_code:'GB'}],services:[service],jobs,phases:[{id:'phase1',engagement_id:'job',position:0,title:'Collect records',budget_minutes:30},{id:'phase2',engagement_id:'job',position:1,title:'Preparation',budget_minutes:120}],requests:[{id:'request',client_id:'client',engagement_id:'job',title:'Missing September bank statement',due_at:'2026-09-27',status:'outstanding',chase_count:0},{id:'request2',client_id:'client2',engagement_id:'job2',title:'Confirm director expenses',status:'submitted',response:'All expenses were incurred for the business.'}],time:[],proposals:[{id:'proposal',client_id:'client',service_snapshot:service,total_minor:30000,currency:'GBP',status:'draft',expires_at:'2027-01-01',terms:'Monthly bookkeeping and accounts preparation.'}],audit:[],schedules:[],crmCompanies:[],members:[{user_id:'owner',role:'owner'}],userId:'owner',truncated:false};
export async function listPracticeWorkspaces(){return [{id:'workspace',tenant_id:'tenant',product_key:'taxcenda',role:'owner'}]}
export async function getPracticeWorkspace(){return structuredClone(dataset)}
export async function mutatePracticeWorkspace({data}:any){(window as any).__lastCommand=data.command;return {id:'saved'}}
export async function createPracticeClient(){return {id:'saved'}}
export async function addPracticeClientPortalUser(){return {id:'saved'}}
export async function requestTenantModule(){return {id:'saved'}}
export async function configurePracticeAutomation(){return 'saved'}
export async function listPracticeRequestFiles(){return []}
export async function uploadPracticeRequestFile(){return {id:'saved'}}
export async function downloadPracticeRequestFile(){return {url:'#'}}
