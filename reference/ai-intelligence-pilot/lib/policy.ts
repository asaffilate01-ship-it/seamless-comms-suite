export type Mode='assist'|'approve'|'automatic';
export const MODES=['assist','approve','automatic'] as const;
export function actionStatus(mode:string,type:string,kind:string){if(kind==='sample')return 'pending'; if(mode==='assist')return 'draft'; if(mode==='automatic'&&type==='internal_task')return 'approved';return 'pending';}
export function canTransition(status:string,decision:string){return status==='pending'&&['approved','rejected'].includes(decision);}
export function validateSourceQuotes<T extends {source:string;quote:string}>(items:T[],sources:Record<string,string>){return items.map(x=>({...x,verified:!!x.quote.trim()&&!!sources[x.source]&&sources[x.source].includes(x.quote)}));}
export function boundedText(v:unknown,max:number){return typeof v==='string'?v.trim().slice(0,max):'';}
export function currentMonth(){return new Date().toISOString().slice(0,7);}
