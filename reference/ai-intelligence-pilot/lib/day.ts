export type DayRecord=Record<string,any>;
export function validDay(value:unknown):value is string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function validZone(value:unknown):value is string{if(typeof value!=='string'||value.length>80)return false;try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true}catch{return false}}
export function localDay(value:Date|string,zone:string){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const get=(t:string)=>parts.find(p=>p.type===t)?.value;return get('year')+'-'+get('month')+'-'+get('day');}
export function offsetDay(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function dayOverview(items:DayRecord[],meetings:DayRecord[],date:string,zone:string){
 const effective:DayRecord[]=items.map(i=>({...i,status:i.source_status==='completed'?'completed':i.status}));
 const active=effective.filter(i=>i.status!=='completed'&&i.scheduled_date<=date).sort((a,b)=>{const score=(x:DayRecord)=>(x.due_date&&x.due_date<date?0:10)+({high:0,normal:2,low:4}[x.priority as 'high'|'normal'|'low']||0);return score(a)-score(b)||a.scheduled_date.localeCompare(b.scheduled_date)||a.created_at.localeCompare(b.created_at)});
 const completed=effective.filter(i=>i.status==='completed'&&localDay(i.source_status==='completed'?i.source_updated_at:(i.completed_at||i.updated_at),zone)===date);
 const todayMeetings=meetings.filter(m=>localDay(m.starts_at,zone)===date&&m.status!=='cancelled');
 const unconfirmed=meetings.filter(m=>m.status==='unconfirmed'&&localDay(m.starts_at,zone)>=offsetDay(date,-30)&&localDay(m.starts_at,zone)<=offsetDay(date,7));
 return {active,completed,todayMeetings,unconfirmed,overdue:active.filter(i=>i.due_date&&i.due_date<date),carryover:active.filter(i=>i.scheduled_date<date),blocked:active.filter(i=>i.status==='blocked'),upcoming:effective.filter(i=>i.status!=='completed'&&i.scheduled_date>date)};
}
export function startingSteps(kind='task'){return (kind==='meeting'?['Confirm the participants, time and purpose.','List the decisions or answers needed.','Prepare the agenda and relevant evidence.','Record the outcome and follow-up owners.']:['Define the result and what “complete” means.','Gather the information or decision you need.','Take the next practical action.','Check the result and record what changed.']).map((title,i)=>({id:String(i+1),title,done:false}));}
