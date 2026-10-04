export type AuctionRecommendation="buy"|"review"|"do_not_bid";
export type Severity="none"|"light"|"moderate"|"severe"|"unknown";
export type AuctionSheetExtraction={
  rawGrade?:string|null;
  interiorGrade?:string|null;
  exteriorGrade?:string|null;
  inspectorCommentsJapanese?:string|null;
  inspectorCommentsEnglish?:string|null;
  damageCodes?:string[];
  repairHistory?:"none"|"suspected"|"declared"|"unknown";
  structuralRepair?:"none"|"minor"|"major"|"unknown";
  flood?:"none"|"suspected"|"declared"|"unknown";
  corrosion?:Severity;
  rust?:Severity;
  oilLeak?:boolean|null;
  warningLights?:boolean|null;
  airbagIssue?:boolean|null;
  chassisNumber?:string|null;
  odometerKm?:number|null;
  odometerStatus?:"verified"|"questionable"|"unknown";
  options?:string[];
  notes?:string[];
  sourceRefs?:string[];
  confidence:number;
  translationConfidence?:number|null;
  damageMapConfidence?:number|null;
};

export type AuctionHistoryRow={
  observedAt:string;
  auctionHouse?:string|null;
  externalLotId?:string|null;
  grade?:string|null;
  odometerKm?:number|null;
  finalPriceMinor?:number|null;
  currentPriceMinor?:number|null;
  startingPriceMinor?:number|null;
  currency?:string|null;
};

export type AuctionComparable={
  evidenceType:"asking"|"sold"|"auction_result";
  priceGbpMinor:number;
  year?:number|null;
  mileageKm?:number|null;
  source:string;
  externalRef?:string|null;
};

export type AuctionEconomics={
  targetRetailGbpMinor:number;
  targetMarginGbpMinor:number;
  estimatedLandedGbpMinor:number|null;
  estimatedGrossMarginGbpMinor:number|null;
  proposedHammerJpy?:number|null;
  maxHammerJpy?:number|null;
};

export type AuctionDecisionInput={
  lot:{
    chassisNumber?:string|null;
    grade?:string|null;
    odometerKm?:number|null;
    make?:string|null;
    model?:string|null;
    year?:number|null;
  };
  extraction:AuctionSheetExtraction|null;
  history:AuctionHistoryRow[];
  comparables:AuctionComparable[];
  economics:AuctionEconomics|null;
};

export type AuctionDecisionResult={
  score:number;
  recommendation:AuctionRecommendation;
  confidence:number;
  blockers:string[];
  warnings:string[];
  reasons:string[];
  subscores:{
    condition:number;
    provenance:number;
    market:number;
    economics:number;
    evidence:number;
  };
  market:{
    comparableCount:number;
    soldCount:number;
    askingCount:number;
    medianComparableGbpMinor:number|null;
    medianSoldGbpMinor:number|null;
    medianAskingGbpMinor:number|null;
  };
  history:{
    appearances:number;
    mileageRegression:boolean;
    gradeChanged:boolean;
  };
  reviewRequired:true;
};

const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const norm=(value?:string|null)=>String(value??"").replace(/[^A-Z0-9]/gi,"").toUpperCase();
const median=(values:number[])=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:Math.round((sorted[mid-1]+sorted[mid])/2);
};
function gradePenalty(raw?:string|null){
  const g=String(raw??"").trim().toUpperCase();
  if(!g)return {penalty:8,warning:"auction_grade_missing"};
  if(["R","RA","A","***","XX"].includes(g))return {penalty:15,warning:"repair_or_special_grade"};
  const m=g.match(/\d+(?:\.\d+)?/);
  if(!m)return {penalty:6,warning:"auction_grade_unrecognised"};
  const n=Number(m[0]);
  if(n>=4.5)return {penalty:0,warning:null};
  if(n>=4)return {penalty:4,warning:null};
  if(n>=3.5)return {penalty:10,warning:"lower_auction_grade"};
  return {penalty:22,warning:"low_auction_grade"};
}
function severityPenalty(value:Severity|undefined,weights:{light:number;moderate:number;severe:number}){
  if(value==="light")return weights.light;
  if(value==="moderate")return weights.moderate;
  if(value==="severe")return weights.severe;
  return 0;
}
function mileageRegression(rows:AuctionHistoryRow[]){
  let last:number|null=null;
  for(const row of [...rows].sort((a,b)=>new Date(a.observedAt).getTime()-new Date(b.observedAt).getTime())){
    if(typeof row.odometerKm!=="number")continue;
    if(last!==null&&row.odometerKm<last)return true;
    last=row.odometerKm;
  }
  return false;
}
function gradeChanged(rows:AuctionHistoryRow[]){
  const grades=new Set(rows.map(r=>String(r.grade??"").trim().toUpperCase()).filter(Boolean));
  return grades.size>1;
}

export function evaluateAuctionDecision(input:AuctionDecisionInput):AuctionDecisionResult{
  const blockers:string[]=[],warnings:string[]=[],reasons:string[]=[];
  let condition=100,provenance=100,market=100,economics=100,evidence=100;

  const extraction=input.extraction;
  if(!extraction){
    evidence-=60;warnings.push("auction_sheet_not_extracted");reasons.push("Original auction-sheet extraction is missing.");
  }else{
    const grade=gradePenalty(extraction.rawGrade||input.lot.grade);
    condition-=grade.penalty;if(grade.warning)warnings.push(grade.warning);

    if(extraction.flood==="declared"){condition-=100;blockers.push("flood_declared");reasons.push("Auction evidence declares flood/water damage.");}
    else if(extraction.flood==="suspected"){condition-=35;warnings.push("flood_suspected");}
    if(extraction.structuralRepair==="major"){condition-=55;blockers.push("structural_repair_major");reasons.push("Major structural repair is unresolved.");}
    else if(extraction.structuralRepair==="minor"){condition-=18;warnings.push("structural_repair_minor");}
    if(extraction.repairHistory==="declared"){condition-=12;warnings.push("repair_history_declared");}
    else if(extraction.repairHistory==="suspected"){condition-=8;warnings.push("repair_history_suspected");}

    const corrosionPenalty=severityPenalty(extraction.corrosion,{light:5,moderate:16,severe:32});
    const rustPenalty=severityPenalty(extraction.rust,{light:4,moderate:12,severe:24});
    condition-=corrosionPenalty+rustPenalty;
    if(extraction.corrosion==="severe")warnings.push("severe_corrosion");
    else if(extraction.corrosion==="moderate")warnings.push("moderate_corrosion");
    if(extraction.rust==="severe")warnings.push("severe_rust");
    else if(extraction.rust==="moderate")warnings.push("moderate_rust");
    if(extraction.oilLeak){condition-=8;warnings.push("oil_leak");}
    if(extraction.warningLights){condition-=12;warnings.push("warning_lights");}
    if(extraction.airbagIssue){condition-=45;blockers.push("airbag_issue_unresolved");reasons.push("Airbag/SRS issue requires specialist resolution before bidding.");}

    if(extraction.odometerStatus==="questionable"){provenance-=45;blockers.push("odometer_questionable");reasons.push("Auction-sheet odometer status is questionable.");}
    else if(extraction.odometerStatus==="unknown"){provenance-=10;warnings.push("odometer_status_unknown");}
    if(input.lot.chassisNumber&&extraction.chassisNumber&&norm(input.lot.chassisNumber)!==norm(extraction.chassisNumber)){
      provenance-=100;blockers.push("chassis_mismatch");reasons.push("Auction-sheet chassis identity does not match the provider lot.");
    }
    if(typeof input.lot.odometerKm==="number"&&typeof extraction.odometerKm==="number"){
      const delta=Math.abs(input.lot.odometerKm-extraction.odometerKm);
      const tolerance=Math.max(1000,Math.round(input.lot.odometerKm*0.02));
      if(delta>Math.max(5000,input.lot.odometerKm*0.1)){provenance-=45;blockers.push("odometer_material_mismatch");}
      else if(delta>tolerance){provenance-=15;warnings.push("odometer_mismatch");}
    }

    if(extraction.confidence<0.5){evidence-=55;warnings.push("sheet_extraction_low_confidence");}
    else if(extraction.confidence<0.75){evidence-=25;warnings.push("sheet_extraction_review");}
    const translation=extraction.translationConfidence;
    if(typeof translation==="number"&&translation<0.65){evidence-=15;warnings.push("translation_low_confidence");}
    const damageMap=extraction.damageMapConfidence;
    if(typeof damageMap==="number"&&damageMap<0.65){evidence-=15;warnings.push("damage_map_low_confidence");}
  }

  const history=[...input.history].sort((a,b)=>new Date(a.observedAt).getTime()-new Date(b.observedAt).getTime());
  const mileageBackwards=mileageRegression(history);
  if(mileageBackwards){provenance-=100;blockers.push("mileage_regression");reasons.push("Auction history contains a mileage regression.");}
  if(history.length>1){provenance-=Math.min(8,(history.length-1)*2);warnings.push("relisted_vehicle");}
  const changedGrade=gradeChanged(history);
  if(changedGrade){provenance-=8;warnings.push("auction_grade_changed");}

  const sold=input.comparables.filter(c=>c.evidenceType==="sold").map(c=>c.priceGbpMinor);
  const asking=input.comparables.filter(c=>c.evidenceType==="asking").map(c=>c.priceGbpMinor);
  const all=input.comparables.map(c=>c.priceGbpMinor);
  const medianAll=median(all),medianSold=median(sold),medianAsking=median(asking);
  if(input.comparables.length<3){market-=35;warnings.push("insufficient_market_comparables");}
  else if(!sold.length){market-=12;warnings.push("no_completed_sale_comparables");}
  if(input.economics&&medianAll){
    const retail=input.economics.targetRetailGbpMinor;
    if(retail>medianAll*1.15){market-=25;warnings.push("target_retail_above_market");}
    else if(retail>medianAll*1.08){market-=12;warnings.push("target_retail_stretched");}
  }

  if(!input.economics){
    economics-=55;warnings.push("landed_cost_not_reviewed");reasons.push("Reviewed landed-cost/max-bid economics are missing.");
  }else{
    const gross=input.economics.estimatedGrossMarginGbpMinor;
    if(gross===null){economics-=35;warnings.push("gross_margin_not_calculated");}
    else if(gross<input.economics.targetMarginGbpMinor){
      economics-=60;blockers.push("margin_below_target");reasons.push("Estimated gross margin is below the reviewed target margin.");
    }else{
      const headroom=gross-input.economics.targetMarginGbpMinor;
      const ratio=input.economics.targetRetailGbpMinor>0?headroom/input.economics.targetRetailGbpMinor:0;
      if(ratio<0.02){economics-=12;warnings.push("thin_margin_headroom");}
    }
    if(typeof input.economics.proposedHammerJpy==="number"&&typeof input.economics.maxHammerJpy==="number"&&input.economics.proposedHammerJpy>input.economics.maxHammerJpy){
      economics-=100;blockers.push("bid_above_reviewed_maximum");reasons.push("Proposed hammer bid is above the reviewed safe maximum.");
    }
  }

  condition=clamp(condition);provenance=clamp(provenance);market=clamp(market);economics=clamp(economics);evidence=clamp(evidence);
  const score=clamp(condition*0.3+provenance*0.25+economics*0.2+market*0.15+evidence*0.1);
  const extractionConfidence=extraction?.confidence??0;
  const coverageConfidence=Math.min(1,(input.comparables.length/3))*0.2+(input.economics?0.2:0)+(history.length?0.1:0)+extractionConfidence*0.5;
  const confidence=Math.max(0,Math.min(1,Number(coverageConfidence.toFixed(4))));

  let recommendation:AuctionRecommendation="review";
  if(blockers.length)recommendation="do_not_bid";
  else if(score>=80&&confidence>=0.75&&input.comparables.length>=3&&!!input.economics&&!!extraction)recommendation="buy";

  if(recommendation==="buy")reasons.push("No hard-stop risk was detected and reviewed evidence/economics meet the BUY threshold.");
  else if(recommendation==="review"&&!reasons.length)reasons.push("Evidence, market coverage or score requires human review before bidding.");

  return {
    score,recommendation,confidence,blockers:[...new Set(blockers)],warnings:[...new Set(warnings)],reasons,
    subscores:{condition,provenance,market,economics,evidence},
    market:{comparableCount:input.comparables.length,soldCount:sold.length,askingCount:asking.length,medianComparableGbpMinor:medianAll,medianSoldGbpMinor:medianSold,medianAskingGbpMinor:medianAsking},
    history:{appearances:history.length,mileageRegression:mileageBackwards,gradeChanged:changedGrade},
    reviewRequired:true,
  };
}

export const AUCTION_EXTRACTION_SCHEMA={
  version:"autohashi-auction-sheet-v1",
  required:["confidence"],
  fields:{
    rawGrade:"string|null",interiorGrade:"string|null",exteriorGrade:"string|null",
    inspectorCommentsJapanese:"string|null",inspectorCommentsEnglish:"string|null",
    damageCodes:"string[]",repairHistory:"none|suspected|declared|unknown",
    structuralRepair:"none|minor|major|unknown",flood:"none|suspected|declared|unknown",
    corrosion:"none|light|moderate|severe|unknown",rust:"none|light|moderate|severe|unknown",
    oilLeak:"boolean|null",warningLights:"boolean|null",airbagIssue:"boolean|null",
    chassisNumber:"string|null",odometerKm:"integer|null",odometerStatus:"verified|questionable|unknown",
    options:"string[]",notes:"string[]",sourceRefs:"string[]",confidence:"0..1",
    translationConfidence:"0..1|null",damageMapConfidence:"0..1|null",
  },
  rules:[
    "Do not infer an item as present when the sheet is unreadable; use unknown/null and lower confidence.",
    "Preserve Japanese inspector text when available and provide a separate English interpretation.",
    "Damage-map codes must remain verbatim in damageCodes; interpretation belongs in notes.",
    "Never change a chassis number, mileage or grade to make it match provider data.",
  ],
} as const;
