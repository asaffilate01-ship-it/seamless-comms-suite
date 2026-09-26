import { z } from "zod";

export const intelligenceSignalSchema=z.object({
  key:z.string().min(1).max(80),
  status:z.enum(["clear","positive","neutral","warning","critical","unknown"]),
  confidence:z.number().min(0).max(1),
  sourceIds:z.array(z.string().min(1)).min(1),
  evidence:z.record(z.unknown()).default({}),
}).strict();

export type IntelligenceSignal=z.infer<typeof intelligenceSignalSchema>;

export type VehicleScores={
  provenanceRisk:"low"|"medium"|"high"|"unknown";
  mileageConfidence:"high"|"medium"|"low"|"unknown";
  conditionRisk:"low"|"medium"|"high"|"unknown";
  specificationStrength:"high"|"average"|"basic"|"unknown";
  retailDemand:"strong"|"normal"|"weak"|"unknown";
  financeability:"normal"|"review"|"unknown";
  overallConfidence:number;
};

function worst(signals:IntelligenceSignal[],keys:string[]){
  const order={clear:0,positive:0,neutral:1,unknown:2,warning:3,critical:4};
  return signals.filter(s=>keys.includes(s.key)).sort((a,b)=>order[b.status]-order[a.status])[0];
}

export function scoreVehicle(signals:IntelligenceSignal[]):VehicleScores{
  const p=worst(signals,["outstanding_finance","stolen","writeoff","salvage","identity_mismatch"]);
  const m=worst(signals,["mileage_anomaly","mot_mileage","service_mileage","auction_mileage"]);
  const c=worst(signals,["visible_damage","auction_grade","repair_history","pdi"]);
  const spec=signals.find(s=>s.key==="specification_strength");
  const demand=signals.find(s=>s.key==="retail_demand");
  const finance=worst(signals,["finance_restriction","writeoff","identity_mismatch"]);
  const average=signals.length?signals.reduce((n,s)=>n+s.confidence,0)/signals.length:0;

  const risk=(s?:IntelligenceSignal):"low"|"medium"|"high"|"unknown"=>{
    if(!s||s.status==="unknown")return "unknown";
    if(s.status==="critical")return "high";
    if(s.status==="warning")return "medium";
    return "low";
  };
  return {
    provenanceRisk:risk(p),
    mileageConfidence:!m||m.status==="unknown"?"unknown":m.status==="critical"?"low":m.status==="warning"?"medium":"high",
    conditionRisk:risk(c),
    specificationStrength:spec?.status==="positive"?"high":spec?.status==="neutral"?"average":spec?.status==="warning"?"basic":"unknown",
    retailDemand:demand?.status==="positive"?"strong":demand?.status==="warning"?"weak":demand?"normal":"unknown",
    financeability:!finance||finance.status==="unknown"?"unknown":finance.status==="critical"||finance.status==="warning"?"review":"normal",
    overallConfidence:Number(average.toFixed(3)),
  };
}
