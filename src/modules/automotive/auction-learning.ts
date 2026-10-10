export type AuctionOutcome={
  make:string;
  model:string;
  modelCode?:string|null;
  year?:number|null;
  grade?:string|null;
  mileageKm?:number|null;
  hammerJpy:number;
  outcomeAt:string;
};

export type HammerPrediction={
  predictedHammerJpy:number|null;
  lowJpy:number|null;
  highJpy:number|null;
  sampleCount:number;
  confidence:number;
  method:"model_code_year_grade_mileage"|"make_model_year_grade_mileage"|"make_model_year_grade"|"make_model_year"|"insufficient";
  comparableRefs:number[];
};

export type WatchCriteria={
  make?:string|null;
  model?:string|null;
  modelCode?:string|null;
  yearMin?:number|null;
  yearMax?:number|null;
  gradeMin?:number|null;
  odometerMaxKm?:number|null;
  maxOpeningJpy?:number|null;
  maxPredictedHammerJpy?:number|null;
  minScore?:number|null;
};

export type WatchCandidate={
  make:string;
  model:string;
  modelCode?:string|null;
  year?:number|null;
  grade?:string|null;
  odometerKm?:number|null;
  openingJpy?:number|null;
  predictedHammerJpy?:number|null;
  score?:number|null;
};

const clean=(value?:string|null)=>String(value??"").trim().toUpperCase();
const percentile=(values:number[],p:number)=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const idx=(sorted.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);
  if(lo===hi)return Math.round(sorted[lo]);
  const weight=idx-lo;
  return Math.round(sorted[lo]*(1-weight)+sorted[hi]*weight);
};
const median=(values:number[])=>percentile(values,.5);
function gradeNumber(value?:string|null){
  const m=String(value??"").match(/\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function mileageBand(km?:number|null){
  if(typeof km!=="number")return null;
  return Math.floor(km/20000)*20000;
}
function confidenceFor(sampleCount:number,specificity:number){
  const sample=Math.min(1,sampleCount/12);
  return Number(Math.min(.98,.35+sample*.45+specificity*.18).toFixed(4));
}
function recent(rows:AuctionOutcome[],days=730){
  const since=Date.now()-days*86400000;
  return rows.filter(row=>Number.isFinite(row.hammerJpy)&&row.hammerJpy>0&&new Date(row.outcomeAt).getTime()>=since);
}

export function predictHammerPrice(input:{
  target:{make:string;model:string;modelCode?:string|null;year?:number|null;grade?:string|null;mileageKm?:number|null};
  outcomes:AuctionOutcome[];
}):HammerPrediction{
  const target=input.target,rows=recent(input.outcomes);
  const make=clean(target.make),model=clean(target.model),code=clean(target.modelCode);
  const year=target.year??null,grade=gradeNumber(target.grade),band=mileageBand(target.mileageKm);

  const scopes:Array<{method:HammerPrediction["method"];specificity:number;min:number;filter:(r:AuctionOutcome)=>boolean}>=[
    {
      method:"model_code_year_grade_mileage",specificity:1,min:3,
      filter:r=>!!code&&clean(r.modelCode)===code&&year!==null&&r.year===year&&grade!==null&&gradeNumber(r.grade)===grade&&band!==null&&mileageBand(r.mileageKm)===band
    },
    {
      method:"make_model_year_grade_mileage",specificity:.85,min:3,
      filter:r=>clean(r.make)===make&&clean(r.model)===model&&year!==null&&r.year===year&&grade!==null&&gradeNumber(r.grade)===grade&&band!==null&&mileageBand(r.mileageKm)===band
    },
    {
      method:"make_model_year_grade",specificity:.7,min:5,
      filter:r=>clean(r.make)===make&&clean(r.model)===model&&year!==null&&Math.abs(Number(r.year??0)-year)<=1&&grade!==null&&gradeNumber(r.grade)===grade
    },
    {
      method:"make_model_year",specificity:.5,min:7,
      filter:r=>clean(r.make)===make&&clean(r.model)===model&&year!==null&&Math.abs(Number(r.year??0)-year)<=2
    },
  ];
  for(const scope of scopes){
    const matches=rows.filter(scope.filter);
    if(matches.length<scope.min)continue;
    const prices=matches.map(r=>r.hammerJpy);
    return {
      predictedHammerJpy:median(prices),lowJpy:percentile(prices,.25),highJpy:percentile(prices,.75),
      sampleCount:matches.length,confidence:confidenceFor(matches.length,scope.specificity),method:scope.method,
      comparableRefs:matches.map((_,i)=>i),
    };
  }
  return {predictedHammerJpy:null,lowJpy:null,highJpy:null,sampleCount:0,confidence:0,method:"insufficient",comparableRefs:[]};
}

export function extractionDiff(original:Record<string,unknown>,corrected:Record<string,unknown>){
  const fields=new Set([...Object.keys(original??{}),...Object.keys(corrected??{})]);
  const changed:string[]=[];
  for(const field of fields){
    const a=JSON.stringify(original?.[field]??null),b=JSON.stringify(corrected?.[field]??null);
    if(a!==b)changed.push(field);
  }
  return changed.sort();
}

export function matchesWatchCriteria(criteria:WatchCriteria,candidate:WatchCandidate){
  if(criteria.make&&clean(criteria.make)!==clean(candidate.make))return false;
  if(criteria.model&&clean(criteria.model)!==clean(candidate.model))return false;
  if(criteria.modelCode&&clean(criteria.modelCode)!==clean(candidate.modelCode))return false;
  if(typeof criteria.yearMin==="number"&&(candidate.year??0)<criteria.yearMin)return false;
  if(typeof criteria.yearMax==="number"&&(candidate.year??9999)>criteria.yearMax)return false;
  if(typeof criteria.odometerMaxKm==="number"&&(candidate.odometerKm??Number.MAX_SAFE_INTEGER)>criteria.odometerMaxKm)return false;
  if(typeof criteria.maxOpeningJpy==="number"&&(candidate.openingJpy??Number.MAX_SAFE_INTEGER)>criteria.maxOpeningJpy)return false;
  if(typeof criteria.maxPredictedHammerJpy==="number"&&(candidate.predictedHammerJpy??Number.MAX_SAFE_INTEGER)>criteria.maxPredictedHammerJpy)return false;
  if(typeof criteria.minScore==="number"&&(candidate.score??-1)<criteria.minScore)return false;
  if(typeof criteria.gradeMin==="number"){
    const g=gradeNumber(candidate.grade);if(g===null||g<criteria.gradeMin)return false;
  }
  return true;
}
