export interface BuildPack {
 implementation:{version:number;product:string;repository:string;scope:string;status:string;executable:false;
 tasks:{id:string;title:string;area:string;requirement:string;acceptance:string[];observationIds:string[];state:string;blockers:string[]}[];
 deferred:{id:string;title:string;decision:string}[]};
 evidence:unknown;
}
export function planBuildPack(input:unknown):BuildPack;
export function validateDossier(input:unknown):unknown;
