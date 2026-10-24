export const blankDossier = () => ({version:1,product:'',repository:'',scope:'selected-features',sources:[],observations:[],features:[]});
export const templates = {
 sources:{id:'',url:'',basis:'public-observation',permissionNote:'',review:'pending',reviewer:''},
 observations:{id:'',sourceId:'',method:'manual',kind:'observed',summary:'',evidenceRef:''},
 features:{id:'',title:'',decision:'build',area:'frontend',requirement:'',acceptance:[],observationIds:[]},
};
// Draft files can contain unfinished fields, but must have a bounded known structure.
export function parseDraft(value) {
 if(!value||value.version!==1)throw new Error('Unsupported dossier version');
 const clean=blankDossier();
 for(const key of ['product','repository','scope']){
  if(typeof value[key]!=='string'||value[key].length>200)throw new Error('Invalid project field');
  clean[key]=value[key];
 }
 if(!['selected-features','whole-product'].includes(clean.scope))throw new Error('Invalid scope');
 for(const [group,template] of Object.entries(templates)){
  if(!Array.isArray(value[group])||value[group].length>({sources:100,observations:300,features:150}[group]))throw new Error('Invalid record list');
  clean[group]=value[group].map(row=>{
   if(!row||typeof row!=='object')throw new Error('Invalid record');
   const record={};
   for(const [key,example] of Object.entries(template)){
    const item=row[key];
    if(Array.isArray(example)){
     if(!Array.isArray(item)||item.length>30||item.some(s=>typeof s!=='string'||s.length>4000))throw new Error('Invalid record list field');
     record[key]=[...item];
    }else{
     if(typeof item!=='string'||item.length>4000)throw new Error('Invalid record field');
     record[key]=item;
    }
   }
   if(!/^[a-z][a-z0-9-]{0,79}$/.test(record.id))throw new Error('Invalid record ID');
   return record;
  });
  if(new Set(clean[group].map(r=>r.id)).size!==clean[group].length)throw new Error('Duplicate record ID');
 }
 return clean;
}
export function canRemove(dossier,group,id){
 if(group==='sources')return !dossier.observations.some(o=>o.sourceId===id);
 if(group==='observations')return !dossier.features.some(f=>f.observationIds.includes(id));
 return true;
}
export function changeSource(source,key,value){
 return {...source,[key]:value,...(!['review','reviewer'].includes(key)?{review:'pending',reviewer:''}:{})};
}
