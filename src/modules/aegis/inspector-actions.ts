import type {QueueKind} from './control-room';
import {resourceActions,type ResourceKind} from './custody.ts';
export type InspectorAction={label:string;stage:string};
export function inspectorActions(kind:QueueKind,row:any,userId:string,role:string,acknowledged=false):InspectorAction[]{
 const admin=['owner','admin'].includes(role);
 if(!userId||!['owner','admin','agent'].includes(role))return [];
 const action=(stage:string,label:string)=>({stage,label});
 if(kind==='incident'){const next:Record<string,string>={open:'review',review:'resolved',resolved:'closed'};return admin&&Object.hasOwn(next,row.status)?[action(next[row.status],'Move incident to '+next[row.status])]:[];}
 if(kind==='report'){
  if(row.created_by===userId&&['draft','changes_requested'].includes(row.stage))return [action('draft','Save draft'),action('submitted','Submit for review')];
  if(admin&&row.created_by!==userId&&row.stage==='submitted')return [action('approved','Approve report'),action('changes_requested','Request changes')];
 }
 if(kind==='corrective'){
  if(row.assignee_id===userId&&row.stage==='open')return [action('in_progress','Start remediation')];
  if(row.assignee_id===userId&&row.stage==='in_progress')return [action('in_progress','Save progress'),action('submitted','Submit for verification')];
  if(admin&&row.assignee_id!==userId&&row.stage==='submitted')return [action('closed','Verify and close'),action('in_progress','Return for work')];
 }
 if(kind==='handover'){
  if(row.created_by===userId&&['draft','returned'].includes(row.stage))return [action('draft','Save draft'),action('offered','Offer handover')];
  if(row.incoming_id===userId&&row.stage==='offered')return [action('acknowledged','Acknowledge receipt'),action('returned','Return for clarification')];
 }
 if(kind==='instructions'&&row.is_current&&!acknowledged)return [action('receipt','I have read this version')];
 if(['visitor','key','equipment'].includes(kind))return resourceActions(kind as ResourceKind,row.stage,admin).map(stage=>action(stage,({approved:'Approve visit',cancelled:'Cancel visit',onsite:'Record arrival',departed:'Record departure',issued:'Issue asset',returned:'Record asset return',maintenance:'Send for maintenance',available:'Release from maintenance',lost:'Record asset loss'} as Record<string,string>)[stage]));
 return [];
}

export function sourcePlaceholder<T>(previous:T|undefined,key:readonly unknown[]|undefined,tenantId:string,kind:string,sourceId:string):T|undefined{return key?.[0]==='aegis-source-record'&&key[1]===tenantId&&key[2]===kind&&key[3]===sourceId?previous:undefined;}
