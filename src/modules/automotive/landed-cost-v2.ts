export type JapanUkBidCostInput = {
  fxJpyPerGbp:number;
  fxSource?:string|null;
  fxAsOf?:string|null;
  targetRetailGbpMinor:number;
  targetMarginGbpMinor:number;
  auctionFeesJpy:number;
  inlandTransportJpy:number;
  freightGbpMinor:number;
  insuranceGbpMinor:number;
  clearanceGbpMinor:number;
  complianceGbpMinor:number;
  registrationGbpMinor:number;
  deliveryGbpMinor:number;
  otherGbpMinor:number;
  dutyRateBps:number;
  taxRateBps:number;
  proposedHammerJpy?:number|null;
};

export type JapanUkBidCostResult = {
  fxJpyPerGbp:number;
  dutyRateBps:number;
  taxRateBps:number;
  japanFixedGbpMinor:number;
  freightInsuranceGbpMinor:number;
  postImportFixedGbpMinor:number;
  allowableCifGbpMinor:number;
  maxHammerGbpMinor:number;
  maxHammerJpy:number;
  proposedHammerJpy:number|null;
  proposedHammerGbpMinor:number|null;
  proposedCifGbpMinor:number|null;
  proposedDutyGbpMinor:number|null;
  proposedTaxGbpMinor:number|null;
  proposedLandedGbpMinor:number|null;
  proposedGrossMarginGbpMinor:number|null;
  proposedHeadroomJpy:number|null;
  assumptions:{
    dutyBasis:"cif";
    taxBasis:"cif_plus_duty";
    taxRecoveryAssumed:false;
    estimateOnly:true;
  };
};

function integer(name:string,value:number,min=0){
  if(!Number.isFinite(value)||!Number.isInteger(value)||value<min)throw new Error(name+" must be an integer >= "+min);
  return value;
}
function rateBps(name:string,value:number){
  integer(name,value,0);
  if(value>10000)throw new Error(name+" cannot exceed 10000 bps");
  return value;
}
function toGbpMinor(jpy:number,fxJpyPerGbp:number){
  return Math.round((jpy/fxJpyPerGbp)*100);
}
function toJpy(gbpMinor:number,fxJpyPerGbp:number){
  return Math.floor((gbpMinor/100)*fxJpyPerGbp);
}

export function calculateJapanUkBidCost(input:JapanUkBidCostInput):JapanUkBidCostResult{
  if(!Number.isFinite(input.fxJpyPerGbp)||input.fxJpyPerGbp<=0)throw new Error("fxJpyPerGbp must be positive");
  const targetRetail=integer("targetRetailGbpMinor",input.targetRetailGbpMinor);
  const targetMargin=integer("targetMarginGbpMinor",input.targetMarginGbpMinor);
  const auctionFees=integer("auctionFeesJpy",input.auctionFeesJpy);
  const inland=integer("inlandTransportJpy",input.inlandTransportJpy);
  const freight=integer("freightGbpMinor",input.freightGbpMinor);
  const insurance=integer("insuranceGbpMinor",input.insuranceGbpMinor);
  const clearance=integer("clearanceGbpMinor",input.clearanceGbpMinor);
  const compliance=integer("complianceGbpMinor",input.complianceGbpMinor);
  const registration=integer("registrationGbpMinor",input.registrationGbpMinor);
  const delivery=integer("deliveryGbpMinor",input.deliveryGbpMinor);
  const other=integer("otherGbpMinor",input.otherGbpMinor);
  const dutyBps=rateBps("dutyRateBps",input.dutyRateBps);
  const taxBps=rateBps("taxRateBps",input.taxRateBps);
  const proposed=input.proposedHammerJpy==null?null:integer("proposedHammerJpy",input.proposedHammerJpy);

  const japanFixed=toGbpMinor(auctionFees+inland,input.fxJpyPerGbp);
  const freightInsurance=freight+insurance;
  const postImportFixed=clearance+compliance+registration+delivery+other+targetMargin;
  const dutyRate=dutyBps/10000,taxRate=taxBps/10000;
  const importFactor=(1+dutyRate)*(1+taxRate);
  const availableForImport=Math.max(0,targetRetail-postImportFixed);
  const allowableCif=Math.max(0,Math.floor(availableForImport/importFactor));
  const maxHammerGbp=Math.max(0,allowableCif-japanFixed-freightInsurance);
  const maxHammerJpy=toJpy(maxHammerGbp,input.fxJpyPerGbp);

  let proposedHammerGbp:number|null=null,proposedCif:number|null=null,proposedDuty:number|null=null,proposedTax:number|null=null;
  let proposedLanded:number|null=null,proposedGrossMargin:number|null=null,proposedHeadroom:number|null=null;
  if(proposed!==null){
    proposedHammerGbp=toGbpMinor(proposed,input.fxJpyPerGbp);
    proposedCif=proposedHammerGbp+japanFixed+freightInsurance;
    proposedDuty=Math.round(proposedCif*dutyRate);
    proposedTax=Math.round((proposedCif+proposedDuty)*taxRate);
    proposedLanded=proposedCif+proposedDuty+proposedTax+clearance+compliance+registration+delivery+other;
    proposedGrossMargin=targetRetail-proposedLanded;
    proposedHeadroom=maxHammerJpy-proposed;
  }

  return {
    fxJpyPerGbp:input.fxJpyPerGbp,dutyRateBps:dutyBps,taxRateBps:taxBps,japanFixedGbpMinor:japanFixed,
    freightInsuranceGbpMinor:freightInsurance,postImportFixedGbpMinor:postImportFixed,allowableCifGbpMinor:allowableCif,
    maxHammerGbpMinor:maxHammerGbp,maxHammerJpy,proposedHammerJpy:proposed,proposedHammerGbpMinor:proposedHammerGbp,
    proposedCifGbpMinor:proposedCif,proposedDutyGbpMinor:proposedDuty,proposedTaxGbpMinor:proposedTax,
    proposedLandedGbpMinor:proposedLanded,proposedGrossMarginGbpMinor:proposedGrossMargin,proposedHeadroomJpy:proposedHeadroom,
    assumptions:{dutyBasis:"cif",taxBasis:"cif_plus_duty",taxRecoveryAssumed:false,estimateOnly:true},
  };
}
