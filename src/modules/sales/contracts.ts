import {z} from 'zod';

export const salesScope=z.object({tenantId:z.string().uuid()});
export const salesStep=z.object({
 kind:z.enum(['call','task','email','whatsapp','sms']),
 title:z.string().trim().min(1).max(200),
 body:z.string().max(5000).default(''),
 subject:z.string().max(300).optional(),
 delayMinutes:z.number().int().min(0).max(525600),
}).refine(s=>['call','task'].includes(s.kind)||s.body.trim().length>0,{message:'Message steps need draft content',path:['body']});
export const salesWorkspaceInput=salesScope.extend({productKey:z.string().min(2).max(80).nullable().default(null),search:z.string().trim().max(80).default('')});
export const salesSequenceInput=salesScope.extend({name:z.string().trim().min(1).max(160),productKey:z.string().min(2).max(80).nullable(),steps:z.array(salesStep).min(1).max(30)});
export const salesSequenceStatusInput=salesScope.extend({sequenceId:z.string().uuid(),status:z.enum(['active','paused','archived'])});
export const salesEnrolInput=salesScope.extend({sequenceId:z.string().uuid(),personId:z.string().uuid(),leadId:z.string().uuid().nullable().default(null)});
export const salesActionInput=salesScope.extend({actionId:z.string().uuid()});
export const salesCompleteInput=salesActionInput.extend({note:z.string().trim().min(1).max(1000)});
export const salesControlInput=salesScope.extend({enrolmentId:z.string().uuid(),command:z.enum(['pause','resume','cancel'])});
export const salesOutcomeInput=salesScope.extend({personId:z.string().uuid(),outcome:z.enum(['replied','meeting_booked','opt_out']),idempotencyKey:z.string().uuid(),note:z.string().trim().min(1).max(1000)});
export const salesProspectInput=salesScope.extend({listId:z.string().uuid(),personId:z.string().uuid(),fit:z.number().int().min(0).max(100),intent:z.number().int().min(0).max(100),engagement:z.number().int().min(0).max(100),reason:z.string().trim().min(1).max(1000)});

export type SalesStep=z.infer<typeof salesStep>;
export interface SalesPerson{id:string;display_name:string;email:string|null;phone_e164:string|null}
export interface SalesList{id:string;name:string;product_key:string|null;status:string}
export interface SalesMember{id:string;list_id:string;person_id:string|null;total_score:number|null;fit_score:number|null;intent_score:number|null;engagement_score:number|null;status:string;score_reasons:Array<{source?:string;reason?:string}>;person:{id:string;display_name:string}|null}
export interface SalesSequence{id:string;name:string;product_key:string|null;status:'draft'|'active'|'paused'|'archived';steps:SalesStep[]}
export interface SalesEnrolment{id:string;sequence_id:string;person_id:string;status:string;current_step:number;next_action_at:string|null;stop_reason:string|null;person:{id:string;display_name:string}|null}
export interface SalesAction{id:string;enrolment_id:string;step_index:number;kind:SalesStep['kind'];title:string;body:string;subject:string|null;status:'manual_open'|'pending_review'|'approved_blocked'|'completed'|'cancelled';task_id:string|null;completion_note:string|null;reviewed_at:string|null;created_at:string}
export interface SalesWorkspaceData{
 role:string;deliveryMode:'review_only';products:Array<{product_key:string;name:string}>;
 people:SalesPerson[];lists:SalesList[];members:SalesMember[];sequences:SalesSequence[];
 enrolments:SalesEnrolment[];actions:SalesAction[];suppressedPersonIds:string[];
 limits:{lists:number;people:number;sequences:number;enrolments:number;actions:number;members:number};
}
