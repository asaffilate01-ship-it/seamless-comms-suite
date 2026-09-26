import type { AutomotiveAddon, AutomotiveProduct } from "./contracts";
import { automotiveSources } from "./source-catalogue";

export type IntelligenceStep={
  id:string;
  capability:string;
  addon:AutomotiveAddon;
  required:boolean;
  providerCandidates:string[];
  dependsOn:string[];
};

const shared:IntelligenceStep[]=[
  {id:"identity",capability:"vehicle_identity",addon:"vehicle_intelligence",required:true,providerCandidates:["dvla-ves","commercial-provenance","autohashi-auction-feed"],dependsOn:[]},
  {id:"specification",capability:"factory_options",addon:"factory_specification",required:false,providerCandidates:["oem-build-spec","autotrader-connect"],dependsOn:["identity"]},
  {id:"vision",capability:"visible_damage_detection",addon:"vision_inspection",required:false,providerCandidates:["vision-provider"],dependsOn:["identity"]},
  {id:"passport",capability:"vehicle_passport",addon:"vehicle_passport",required:true,providerCandidates:[],dependsOn:["identity"]},
];

const uk:IntelligenceStep[]=[
  {id:"mot",capability:"mot_history",addon:"vehicle_intelligence",required:true,providerCandidates:["dvsa-mot-history"],dependsOn:["identity"]},
  {id:"provenance",capability:"outstanding_finance",addon:"uk_provenance",required:true,providerCandidates:["commercial-provenance"],dependsOn:["identity"]},
  {id:"recall",capability:"safety_recalls",addon:"vehicle_intelligence",required:false,providerCandidates:["dvsa-recalls"],dependsOn:["identity"]},
  {id:"service",capability:"service_history",addon:"service_history",required:false,providerCandidates:["oem-service-history"],dependsOn:["identity"]},
  {id:"valuation",capability:"retail_valuation",addon:"valuation",required:true,providerCandidates:["autotrader-connect","commercial-valuation"],dependsOn:["identity"]},
  {id:"market",capability:"days_to_sell",addon:"market_intelligence",required:false,providerCandidates:["autotrader-connect"],dependsOn:["valuation"]},
  {id:"finance",capability:"finance_calculation",addon:"finance_adapter",required:false,providerCandidates:["codeweavers"],dependsOn:["valuation"]},
];

const japan:IntelligenceStep[]=[
  {id:"auction",capability:"live_auction_inventory",addon:"jdm_intelligence",required:true,providerCandidates:["autohashi-auction-feed","jp-auction-aggregator"],dependsOn:["identity"]},
  {id:"auction_history",capability:"auction_history",addon:"jdm_intelligence",required:false,providerCandidates:["jp-auction-aggregator"],dependsOn:["auction"]},
  {id:"auction_sheet",capability:"auction_sheet",addon:"auction_sheet_ai",required:true,providerCandidates:["autohashi-auction-feed","jp-auction-aggregator"],dependsOn:["auction"]},
  {id:"japan_recall",capability:"recall_campaigns",addon:"vehicle_intelligence",required:false,providerCandidates:["mlit-recall"],dependsOn:["identity"]},
  {id:"japan_registration",capability:"electronic_registration_certificate",addon:"vehicle_intelligence",required:false,providerCandidates:["mlit-electronic-registration","jdm-document-extraction"],dependsOn:["identity"]},
  {id:"landed_cost",capability:"landed_cost",addon:"landed_cost",required:true,providerCandidates:[],dependsOn:["auction"]},
  {id:"max_bid",capability:"max_bid",addon:"max_bid",required:true,providerCandidates:[],dependsOn:["landed_cost"]},
];

export function intelligencePlan(input:{product:AutomotiveProduct;origin:"uk"|"japan"|"other";enabledAddons:Iterable<AutomotiveAddon>}){
  const enabled=new Set(input.enabledAddons);
  const candidates=[...shared,...(input.origin==="uk"?uk:input.origin==="japan"?japan:[])];
  return candidates.filter(step=>step.required||enabled.has(step.addon)).map(step=>({
    ...step,
    providerCandidates:step.providerCandidates.filter(id=>automotiveSources.some(source=>source.id===id)),
  }));
}
