export interface ResearchRecord {id:string;[key:string]:string|string[]}
export interface Dossier extends Record<string,unknown> {
 version:1;product:string;repository:string;scope:string;
 sources:ResearchRecord[];observations:ResearchRecord[];features:ResearchRecord[];
}
export function parseDraft(value: unknown): Dossier;
export function blankDossier(): Dossier;
export const templates:Record<'sources'|'observations'|'features',ResearchRecord>;
export function canRemove(dossier:Dossier,group:string,id:string):boolean;
export function changeSource(source:ResearchRecord,key:string,value:string):ResearchRecord;
