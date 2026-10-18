export type AutomotiveSourceStatus = "public-api"|"partner-api"|"commercial-license"|"oem-or-aggregator"|"source-feed";
export type AutomotiveSource = {
  id:string;
  name:string;
  region:"UK"|"Japan"|"Global";
  status:AutomotiveSourceStatus;
  capabilities:string[];
  preferredFor:string[];
  fallbackIds:string[];
  credentialEnv?:string;
  notes:string;
};

export const automotiveSources:AutomotiveSource[]=[
  {
    id:"dvla-ves",name:"DVLA Vehicle Enquiry Service",region:"UK",status:"public-api",
    capabilities:["vehicle_identity","tax_status","sorn","mot_expiry","first_registration","manufacture_year","engine_size","fuel_type","co2","type_approval","export_status","v5c_issue_date"],
    preferredFor:["uk_vehicle_identity"],fallbackIds:["commercial-provenance"],credentialEnv:"DVLA_VES_API_KEY",
    notes:"Use as the primary authoritative UK registration/vehicle identity source where permitted."
  },
  {
    id:"dvsa-mot-history",name:"DVSA MOT History API",region:"UK",status:"public-api",
    capabilities:["mot_history","mot_result","mot_mileage","mot_failures","mot_advisories","vehicle_test_history"],
    preferredFor:["mot_history","mileage_timeline"],fallbackIds:["commercial-provenance"],credentialEnv:"DVSA_MOT_API_KEY",
    notes:"Authoritative MOT/test history. OAuth/client credentials plus API key."
  },
  {
    id:"dvsa-recalls",name:"DVSA Vehicle Recall data",region:"UK",status:"public-api",
    capabilities:["safety_recalls","recall_status"],
    preferredFor:["uk_recall"],fallbackIds:["oem-service-history"],
    notes:"Use available DVSA recall data/read access where eligible; otherwise manufacturer recall services."
  },
  {
    id:"commercial-provenance",name:"Commercial UK provenance provider",region:"UK",status:"commercial-license",
    capabilities:["outstanding_finance","stolen_marker","insurance_writeoff","salvage_marker","plate_changes","keeper_count","mileage_checks","import_export_markers","vehicle_identity"],
    preferredFor:["uk_provenance"],fallbackIds:[],
    credentialEnv:"AUTOMOTIVE_PROVENANCE_API_KEY",
    notes:"Contract with CAP HPI, Experian Automotive, MotorCheck/MotorScan or another licensed provenance supplier after commercial/API review. Keep Omniqora provider-neutral."
  },
  {
    id:"autotrader-connect",name:"Auto Trader Connect",region:"UK",status:"partner-api",
    capabilities:["current_valuation","part_exchange_valuation","retail_valuation","trended_valuation","feature_adjusted_valuation","condition_adjusted_valuation","supply","demand","market_condition","retail_rating","days_to_sell","confidence_of_sale","response_metrics","vehicle_taxonomy"],
    preferredFor:["uk_market_intelligence","uk_retail_valuation"],fallbackIds:["commercial-valuation"],
    credentialEnv:"AUTOTRADER_CONNECT_API_KEY",
    notes:"Production access requires partner onboarding/go-live checks and dealer/advertiser context."
  },
  {
    id:"commercial-valuation",name:"Commercial valuation provider",region:"UK",status:"commercial-license",
    capabilities:["trade_valuation","retail_valuation","part_exchange_valuation","forecast_valuation","vehicle_taxonomy"],
    preferredFor:["valuation_fallback"],fallbackIds:[],
    credentialEnv:"AUTOMOTIVE_VALUATION_API_KEY",
    notes:"Potential sources include CAP HPI or Percayso/other licensed valuation feeds depending commercial terms."
  },
  {
    id:"oem-service-history",name:"OEM digital service history / licensed aggregator",region:"Global",status:"oem-or-aggregator",
    capabilities:["service_history","workshop_visits","service_mileage","service_dates","service_campaigns"],
    preferredFor:["service_history"],fallbackIds:[],
    credentialEnv:"AUTOMOTIVE_SERVICE_HISTORY_API_KEY",
    notes:"OEM coverage differs by manufacturer. Use direct OEM agreements where practical or a licensed multi-OEM aggregator."
  },
  {
    id:"oem-build-spec",name:"OEM build specification / vehicle-data aggregator",region:"Global",status:"oem-or-aggregator",
    capabilities:["factory_options","option_codes","paint","trim","wheels","adas","equipment","technical_specification"],
    preferredFor:["factory_specification"],fallbackIds:["autotrader-connect"],
    credentialEnv:"AUTOMOTIVE_SPEC_API_KEY",
    notes:"Prefer VIN/chassis-level build data; distinguish factory-confirmed, source-declared and AI-inferred specification."
  },
  {
    id:"codeweavers",name:"Codeweavers",region:"UK",status:"partner-api",
    capabilities:["finance_calculation","eligibility","finance_application","lender_submission","part_exchange","reservation","digital_retail"],
    preferredFor:["uk_finance"],fallbackIds:[],
    credentialEnv:"CODEWEAVERS_API_KEY",
    notes:"Keep lender/finance decisioning within the finance adapter; Omniqora stores status and permitted deal context only."
  },
  {
    id:"dokuvera",name:"Dokuvera",region:"Global",status:"partner-api",
    capabilities:["verified_media","trusted_timestamp","evidence_capture","media_provenance"],
    preferredFor:["verified_media"],fallbackIds:["internal-evidence"],
    credentialEnv:"DOKUVERA_API_KEY",
    notes:"Automotive profile must disable precise geolocation. Preserve originals, hashes and provider timestamps."
  },
  {
    id:"internal-evidence",name:"Omniqora Evidence Service",region:"Global",status:"source-feed",
    capabilities:["sha256","server_timestamp","evidence_ledger","display_derivatives"],
    preferredFor:["evidence_fallback"],fallbackIds:[],
    notes:"Always available as the internal evidence envelope; external timestamp/seal can augment it."
  },
  {
    id:"autohashi-auction-feed",name:"Autohashi licensed Japanese auction feed",region:"Japan",status:"source-feed",
    capabilities:["live_auction_inventory","auction_sheet","auction_photos","auction_grade","inspector_notes","damage_map","lot_status","bid_status","hammer_price","chassis_number","model_code"],
    preferredFor:["jdm_live_auction"],fallbackIds:["jp-auction-aggregator"],
    credentialEnv:"AUTOHASHI_AUCTION_API_KEY",
    notes:"Primary source should be the auction/export partner feed that Autohashi is commercially authorised to use."
  },
  {
    id:"jp-auction-aggregator",name:"Japanese auction/history API aggregator",region:"Japan",status:"commercial-license",
    capabilities:["auction_history","auction_sheet","auction_photos","mileage_history","grade_history","accident_repair_flags","final_price"],
    preferredFor:["jdm_history"],fallbackIds:[],
    credentialEnv:"JDM_HISTORY_API_KEY",
    notes:"Candidate suppliers include GlobalVIN, Carcheck.jp, TheCarApi or another licensed B2B provider. Verify chassis-number support and resale rights before activation."
  },
  {
    id:"mlit-recall",name:"Japan MLIT recall data",region:"Japan",status:"public-api",
    capabilities:["recall_campaigns","manufacturer","model","campaign_reference"],
    preferredFor:["jdm_recall"],fallbackIds:["oem-service-history"],
    notes:"MLIT publishes recall information; vehicle-level matching may require model/chassis ranges or manufacturer confirmation."
  },
  {
    id:"mlit-electronic-registration",name:"Japan MLIT electronic vehicle inspection certificate data",region:"Japan",status:"partner-api",
    capabilities:["electronic_registration_certificate","vehicle_identity","inspection_certificate_data"],
    preferredFor:["jdm_registration_evidence"],fallbackIds:[],
    credentialEnv:"MLIT_VEHICLE_CERT_API_KEY",
    notes:"API integration requires MLIT application/approval; use only where Autohashi has a lawful/contractual basis."
  },
  {
    id:"jdm-document-extraction",name:"JDM export/shaken document extraction",region:"Japan",status:"partner-api",
    capabilities:["export_certificate_ocr","shaken_document_ocr","chassis_extraction","document_fields"],
    preferredFor:["jdm_document_ingestion"],fallbackIds:[],
    credentialEnv:"JDM_DOCUMENT_API_KEY",
    notes:"Optional extraction layer for export certificates; source document remains the evidence of record."
  },
  {
    id:"sparesgrid",name:"SparesGrid",region:"Global",status:"partner-api",
    capabilities:["parts_identification","oem_part_number","parts_compatibility","supplier_quote","used_parts","aftermarket_parts"],
    preferredFor:["parts_intelligence"],fallbackIds:[],
    credentialEnv:"SPARESGRID_API_KEY",
    notes:"Fitment must retain confidence/evidence and manual review for ambiguous variants."
  },
  {
    id:"vision-provider",name:"Automotive vision provider",region:"Global",status:"partner-api",
    capabilities:["visible_damage_detection","photo_completeness","warning_light_detection","condition_comparison","change_detection"],
    preferredFor:["vision_inspection"],fallbackIds:[],
    credentialEnv:"AUTOMOTIVE_VISION_PROVIDER",
    notes:"AI observations are not structural/mechanical certification. Store confidence and review status."
  }
];

export function sourcesFor(capability:string){
  return automotiveSources.filter(source=>source.capabilities.includes(capability));
}
