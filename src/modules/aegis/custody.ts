export const resourceKinds=['visitor','key','equipment'] as const;
export type ResourceKind=typeof resourceKinds[number];
export function resourceActions(kind:ResourceKind,stage:string,admin:boolean):string[]{
 if(kind==='visitor')return ({expected:admin?['approved','cancelled']:[],approved:['onsite',...(admin?['cancelled']:[])],onsite:['departed']} as Record<string,string[]>)[stage]??[];
 return ({available:['issued',...(admin?['maintenance']:[])],returned:['issued',...(admin?['maintenance']:[])],issued:['returned',...(admin?['lost']:[])],maintenance:admin?['available']:[]} as Record<string,string[]>)[stage]??[];
}
