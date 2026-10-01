import intakeCsv from "../../../docs/portfolio/SAAS-intake.csv?raw";

export type PortfolioIntakeRow={
  row:number;
  name:string;
  repo:string|null;
  site:string|null;
  hint:string|null;
  sourceKind:"repository"|"site_only"|"mixed"|"unknown";
  familyKey:string;
  targetRole:"platform"|"shared_engine"|"shared_addon"|"landlord"|"product_variant"|"tenant"|"brand_tenant"|"marketplace_tenant"|"tenant_review"|"merge_source"|"external_connector"|"review";
  targetProductKey:string|null;
  targetParentKey:string|null;
  migrationAction:string;
  migrationWave:number;
  needsRepo:boolean;
  buildInOmniqora:boolean;
  confidence:"provisional"|"medium"|"high"|"verified";
};

function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[];let field="";let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i]!;
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
    }else if(ch===","&&!quoted){row.push(field);field="";}
    else if((ch==="\n"||ch==="\r")&&!quoted){
      if(ch==="\r"&&text[i+1]==="\n")i++;
      row.push(field);field="";
      if(row.some((value)=>value.trim()!==""))rows.push(row);
      row=[];
    }else field+=ch;
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  return rows;
}
function clean(value:string|undefined){const v=(value??"").trim();return v||null;}
function slug(value:string){
  return value.toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"asset";
}

const FAMILIES:Record<string,string[]>={
  education_platform:["UNIPATHWAY","EDUCLOUD","TRAINDIREKT","VIRTUAL LAB"],
  stemcoach:["STEMCOACH"],
  ilmvero:["ILMVERO"],
  skillfinch:["SKILLFINCH"],
  orvilo:["ORVILO A","ORVILO B","ORVILO X"],
  haccora:["HACCORA UK","HACCORA GERMANY"],
  premisora:["PREMISORA"],
  kindelo:["KINDERSTARS UK","KINDERSTARS GERMANY"],
  eventplanr:["EVENTPLANR UK","EVENTPLANR GERMANY"],
  xpertjobs:["XPERTJOBS","STELLENXPERT","VISA SPONSOR"],
  zivvo:["ZIVVO UK","ZIVVO GERMANY"],
  autohashi:["AUTOHASHI"],
  merqano:["MERQANO","DULCIS","MEYZAAR","ZARVANE","KALETHON","ALSTERO","KALETHON TEAMS","PROMO STUDIO","SOFELLEA"],
  dishbee:["DISHBEE","CAFE1 ST ALBANS","CAFE1 LUTON","MEALDECK","MENU MAGIC","EPOS AI"],
  fleetsora:["FLEETORA","QATNOV"],
  courier_connect:["COURIER CONNECT"],
  motoresq:["MOTORESQ"],
  mobility:["BIDRIVE","VIAZENO"],
  lawquo:["LAWQUO","VERIS LAW"],
  accounting_practice:["ACCOUNTANCY","TAXLOUNGE","ACCOUNTS AI"],
  taxcenda:["TAXCENDA"],
  taxnuvia:["TAXNUVIA"],
  formationgenie:["FORMATION GENIE"],
  beratermarkt:["BERATERMARKT"],
  sparesgrid:["SPARESGRID","SPARESGRID 2"],
  omniqora:["OMNIQORA","OMNIQORA ADD ON","LEADSCOUT","DOKUVERA","ZORYN","ZORYN REWARDS","VOXENTRI","CAPACITOR"],
};
function familyFor(name:string){
  for(const [family,names] of Object.entries(FAMILIES))if(names.includes(name))return family;
  return slug(name);
}

const EXACT:Record<string,Partial<PortfolioIntakeRow>>={
  "OMNIQORA":{targetRole:"platform",targetProductKey:"omniqora",familyKey:"omniqora",migrationAction:"retain_core",migrationWave:0,confidence:"verified"},
  "DISHBEE":{targetRole:"landlord",targetProductKey:"dishbee",familyKey:"dishbee",migrationAction:"migrate_landlord",migrationWave:1,confidence:"high"},
  "CAFE1 ST ALBANS":{targetRole:"tenant",targetProductKey:"dishbee",targetParentKey:"dishbee",familyKey:"dishbee",migrationAction:"tenantise",migrationWave:1,confidence:"high"},
  "CAFE1 LUTON":{targetRole:"tenant",targetProductKey:"dishbee",targetParentKey:"dishbee",familyKey:"dishbee",migrationAction:"tenantise",migrationWave:1,confidence:"high"},
  "MEALDECK":{targetRole:"tenant",targetProductKey:"dishbee",targetParentKey:"dishbee",familyKey:"dishbee",migrationAction:"tenant_operator_layer",migrationWave:1,confidence:"medium"},
  "MERQANO":{targetRole:"landlord",targetProductKey:"merqano",familyKey:"merqano",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "DULCIS":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"tenantise",migrationWave:2,confidence:"high"},
  "MEYZAAR":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"tenantise",migrationWave:2,confidence:"high"},
  "ZARVANE":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"tenantise",migrationWave:2,confidence:"high"},
  "KALETHON":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"tenantise",migrationWave:2,confidence:"high"},
  "ALSTERO":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"tenantise",migrationWave:2,confidence:"medium"},
  "KALETHON TEAMS":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"tenantise",migrationWave:3,confidence:"medium"},
  "PROMO STUDIO":{targetRole:"shared_addon",targetProductKey:"voxentri",targetParentKey:"voxentri",familyKey:"merqano",migrationAction:"extract_to_omniqora",migrationWave:3,buildInOmniqora:true,confidence:"medium"},
  "KINDERSTARS UK":{targetRole:"product_variant",targetProductKey:"kindelo-gb",targetParentKey:"kindelo",familyKey:"kindelo",migrationAction:"variantise",migrationWave:1,confidence:"high"},
  "KINDERSTARS GERMANY":{targetRole:"product_variant",targetProductKey:"kindelo-de",targetParentKey:"kindelo",familyKey:"kindelo",migrationAction:"variantise",migrationWave:1,confidence:"high"},
  "HACCORA UK":{targetRole:"product_variant",targetProductKey:"haccora-gb",targetParentKey:"haccora",familyKey:"haccora",migrationAction:"variantise",migrationWave:2,confidence:"high"},
  "HACCORA GERMANY":{targetRole:"product_variant",targetProductKey:"haccora-de",targetParentKey:"haccora",familyKey:"haccora",migrationAction:"variantise",migrationWave:2,confidence:"high"},
  "EVENTPLANR UK":{targetRole:"product_variant",targetProductKey:"eventplanr-gb",targetParentKey:"eventplanr",familyKey:"eventplanr",migrationAction:"variantise",migrationWave:2,confidence:"medium"},
  "EVENTPLANR GERMANY":{targetRole:"product_variant",targetProductKey:"eventplanr-de",targetParentKey:"eventplanr",familyKey:"eventplanr",migrationAction:"variantise",migrationWave:2,confidence:"medium"},
  "XPERTJOBS":{targetRole:"landlord",targetProductKey:"xpertjobs",familyKey:"xpertjobs",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "STELLENXPERT":{targetRole:"product_variant",targetProductKey:"xpertjobs-de",targetParentKey:"xpertjobs",familyKey:"xpertjobs",migrationAction:"variantise",migrationWave:2,confidence:"high"},
  "ZIVVO UK":{targetRole:"product_variant",targetProductKey:"zivvo-gb",targetParentKey:"zivvo",familyKey:"zivvo",migrationAction:"variantise",migrationWave:2,confidence:"medium"},
  "ZIVVO GERMANY":{targetRole:"product_variant",targetProductKey:"zivvo-de",targetParentKey:"zivvo",familyKey:"zivvo",migrationAction:"variantise",migrationWave:2,confidence:"medium"},
  "UNIPATHWAY":{targetRole:"landlord",targetProductKey:"unipathway",familyKey:"education_platform",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "EDUCLOUD":{targetRole:"review",targetProductKey:"educloud",familyKey:"education_platform",migrationAction:"compare_with_unipathway",migrationWave:2,confidence:"medium"},
  "TRAINDIREKT":{targetRole:"product_variant",targetProductKey:"traindirekt",familyKey:"education_platform",migrationAction:"education_family_migration",migrationWave:3,confidence:"medium"},
  "VIRTUAL LAB":{targetRole:"shared_addon",targetProductKey:"education-labs",familyKey:"education_platform",migrationAction:"extract_to_omniqora",migrationWave:2,buildInOmniqora:true,confidence:"high"},
  "ORVILO B":{targetRole:"landlord",targetProductKey:"orvilo",familyKey:"orvilo",migrationAction:"canonical_merge_target",migrationWave:2,confidence:"high"},
  "ORVILO A":{targetRole:"merge_source",targetProductKey:"orvilo",targetParentKey:"orvilo",familyKey:"orvilo",migrationAction:"merge_into_canonical",migrationWave:2,confidence:"high"},
  "ORVILO X":{targetRole:"merge_source",targetProductKey:"orvilo",targetParentKey:"orvilo",familyKey:"orvilo",migrationAction:"merge_into_canonical",migrationWave:2,confidence:"high"},
  "LAWQUO":{targetRole:"landlord",targetProductKey:"lawquo",familyKey:"lawquo",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "VERIS LAW":{targetRole:"merge_source",targetProductKey:"lawquo",targetParentKey:"lawquo",familyKey:"lawquo",migrationAction:"merge_into_canonical",migrationWave:3,confidence:"high"},
  "ACCOUNTANCY":{targetRole:"landlord",targetProductKey:"iq-practice-cloud",familyKey:"accounting_practice",migrationAction:"migrate_landlord",migrationWave:1,confidence:"high"},
  "FORMATION GENIE":{targetRole:"landlord",targetProductKey:"formationgenie",familyKey:"accounting_practice",migrationAction:"migrate_landlord",migrationWave:1,confidence:"high"},
  "TAXCENDA":{targetRole:"landlord",targetProductKey:"taxcenda",familyKey:"accounting_practice",migrationAction:"migrate_landlord",migrationWave:2,confidence:"medium"},
  "TAXLOUNGE":{targetRole:"tenant",targetProductKey:"iq-practice-cloud",targetParentKey:"iq-practice-cloud",familyKey:"accounting_practice",migrationAction:"tenantise",migrationWave:2,confidence:"medium"},
  "ACCOUNTS AI":{targetRole:"shared_addon",targetProductKey:"accounting_ai",familyKey:"accounting_practice",migrationAction:"extract_to_omniqora",migrationWave:0,buildInOmniqora:true,confidence:"high"},
  "COURIER CONNECT":{targetRole:"landlord",targetProductKey:"courier-connect-hub",familyKey:"courier_connect",migrationAction:"migrate_landlord",migrationWave:1,confidence:"high"},
  "FLEETORA":{targetRole:"landlord",targetProductKey:"fleetsora",familyKey:"fleetora",migrationAction:"migrate_landlord",migrationWave:2,confidence:"medium"},
  "QATNOV":{targetRole:"tenant",targetProductKey:"fleetsora",targetParentKey:"fleetsora",familyKey:"fleetora",migrationAction:"tenantise",migrationWave:3,confidence:"high"},
  "MOTORESQ":{targetRole:"landlord",targetProductKey:"all-road-aid",familyKey:"motoresq",migrationAction:"migrate_landlord",migrationWave:1,confidence:"high"},
  "SPARESGRID":{targetRole:"landlord",targetProductKey:"sparesgrid",familyKey:"sparesgrid",migrationAction:"decide_repo_or_build",migrationWave:1,buildInOmniqora:true,confidence:"medium"},
  "SPARESGRID 2":{targetRole:"merge_source",targetProductKey:"sparesgrid",targetParentKey:"sparesgrid",familyKey:"sparesgrid",migrationAction:"merge_site_into_sparesgrid",migrationWave:1,buildInOmniqora:true,confidence:"medium"},
  "REGULOS":{targetRole:"landlord",targetProductKey:"regulos",familyKey:"regulos",migrationAction:"decide_repo_or_build",migrationWave:2,buildInOmniqora:true,confidence:"medium"},
  "AFFIVON":{targetRole:"landlord",targetProductKey:"affivon",familyKey:"affivon",migrationAction:"decide_repo_or_build",migrationWave:2,buildInOmniqora:true,confidence:"medium"},
  "TENDRYVA":{targetRole:"landlord",targetProductKey:"tendryva",familyKey:"tendryva",migrationAction:"decide_repo_or_build",migrationWave:2,buildInOmniqora:true,confidence:"medium"},
  "VEYUMO":{targetRole:"landlord",targetProductKey:"veyumo",familyKey:"veyumo",migrationAction:"decide_repo_or_build",migrationWave:2,buildInOmniqora:true,confidence:"medium"},
  "FASTREMIT":{targetRole:"landlord",targetProductKey:"fastremit",familyKey:"fastremit",migrationAction:"migrate_landlord",migrationWave:1,confidence:"high"},
  "AHLNIKKAH":{targetRole:"landlord",targetProductKey:"ahl-nikkah",familyKey:"ahl-nikkah",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "LESSONAHEAD":{targetRole:"landlord",targetProductKey:"lessonahead",familyKey:"lessonahead",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "VOXENTRI":{targetRole:"shared_engine",targetProductKey:"voxentri",familyKey:"omniqora",migrationAction:"integrate_shared_engine",migrationWave:0,confidence:"high"},
  "LEADSCOUT":{targetRole:"shared_addon",targetProductKey:"omniqora-sales",targetParentKey:"omniqora",familyKey:"omniqora",migrationAction:"extract_to_omniqora",migrationWave:0,confidence:"high"},
  "DOKUVERA":{targetRole:"shared_engine",targetProductKey:"omniqora-documents",targetParentKey:"omniqora",familyKey:"omniqora",migrationAction:"integrate_shared_engine",migrationWave:1,confidence:"medium"},
  "EPOS AI":{targetRole:"shared_addon",targetProductKey:"hospitality-intelligence",targetParentKey:"omniqora",familyKey:"dishbee",migrationAction:"extract_to_omniqora",migrationWave:0,buildInOmniqora:true,confidence:"high"},

  "TAXNUVIA":{targetRole:"landlord",targetProductKey:"taxnuvia",familyKey:"taxnuvia",migrationAction:"migrate_marketplace_landlord",migrationWave:2,confidence:"high"},
  "AUTOHASHI":{targetRole:"landlord",targetProductKey:"autohashi",familyKey:"autohashi",migrationAction:"migrate_landlord",migrationWave:2,confidence:"high"},
  "LESSONAHEAD":{targetRole:"landlord",targetProductKey:"lessonahead",familyKey:"lessonahead",migrationAction:"migrate_marketplace_landlord",migrationWave:2,confidence:"high"},
  "STEMCOACH":{targetRole:"landlord",targetProductKey:"stemcoach",familyKey:"stemcoach",migrationAction:"migrate_landlord",migrationWave:3,confidence:"medium"},
  "ILMVERO":{targetRole:"landlord",targetProductKey:"ilmvero",familyKey:"ilmvero",migrationAction:"migrate_landlord",migrationWave:3,confidence:"medium"},
  "SKILLFINCH":{targetRole:"landlord",targetProductKey:"skillfinch",familyKey:"skillfinch",migrationAction:"correct_repo_then_migrate",migrationWave:3,confidence:"high"},
  "PREMISORA":{targetRole:"landlord",targetProductKey:"premisora",familyKey:"premisora",migrationAction:"migrate_landlord",migrationWave:3,confidence:"medium"},
  "BIDRIVE":{targetRole:"landlord",targetProductKey:"bidrive",familyKey:"mobility",migrationAction:"migrate_vertical_on_dispatch_geo",migrationWave:3,confidence:"medium"},
  "VIAZENO":{targetRole:"landlord",targetProductKey:"viazeno",familyKey:"mobility",migrationAction:"migrate_vertical_on_dispatch_geo",migrationWave:3,confidence:"medium"},
  "BERATERMARKT":{targetRole:"landlord",targetProductKey:"beratermarkt",familyKey:"beratermarkt",migrationAction:"migrate_marketplace_landlord",migrationWave:3,confidence:"medium"},

  "BONDEDOS":{targetRole:"landlord",targetProductKey:"bondedos",familyKey:"bondedos",migrationAction:"build_native_landlord",migrationWave:3,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "CLINOVEYA":{targetRole:"landlord",targetProductKey:"clinoveya",familyKey:"clinoveya",migrationAction:"build_native_landlord",migrationWave:3,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "VEYUMO":{targetRole:"landlord",targetProductKey:"veyumo",familyKey:"veyumo",migrationAction:"build_native_landlord",migrationWave:2,buildInOmniqora:true,needsRepo:false,confidence:"high"},
  "VISA SPONSOR":{targetRole:"shared_addon",targetProductKey:"sponsor-intelligence",targetParentKey:"xpertjobs",familyKey:"xpertjobs",migrationAction:"build_native_addon",migrationWave:2,buildInOmniqora:true,needsRepo:false,confidence:"high"},
  "REGULOS":{targetRole:"landlord",targetProductKey:"regulos",familyKey:"regulos",migrationAction:"build_native_landlord",migrationWave:2,buildInOmniqora:true,needsRepo:false,confidence:"high"},
  "PROMO STUDIO":{targetRole:"shared_addon",targetProductKey:"creative.core",targetParentKey:"voxentri",familyKey:"merqano",migrationAction:"build_native_addon",migrationWave:1,buildInOmniqora:true,needsRepo:false,confidence:"high"},
  "SOFELLEA":{targetRole:"brand_tenant",targetProductKey:"merqano",targetParentKey:"merqano",familyKey:"merqano",migrationAction:"build_as_tenant",migrationWave:3,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "AUVANE ONE":{targetRole:"landlord",targetProductKey:"auvane-one",familyKey:"auvane-one",migrationAction:"build_native_landlord",migrationWave:3,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "ODDSENTIA FX":{targetRole:"landlord",targetProductKey:"oddsentia-fx",familyKey:"oddsentia-fx",migrationAction:"build_native_landlord",migrationWave:4,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "FINMATCH AI":{targetRole:"landlord",targetProductKey:"finmatch-ai",familyKey:"finmatch-ai",migrationAction:"build_native_landlord",migrationWave:4,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "ATHLYVO":{targetRole:"landlord",targetProductKey:"athlyvo",familyKey:"athlyvo",migrationAction:"build_native_landlord",migrationWave:4,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "ODDSENTIA SPORTS":{targetRole:"landlord",targetProductKey:"oddsentia-sports",familyKey:"oddsentia-sports",migrationAction:"build_native_landlord",migrationWave:4,buildInOmniqora:true,needsRepo:false,confidence:"medium"},
  "GABLEY RETROFIT":{targetRole:"product_variant",targetProductKey:"gabley-retrofit",targetParentKey:"gabley",familyKey:"gabley",migrationAction:"build_native_variant",migrationWave:3,buildInOmniqora:true,needsRepo:false,confidence:"high"},
};

export function portfolioIntakeRows():PortfolioIntakeRow[]{
  const parsed=parseCsv(intakeCsv);
  const body=parsed.slice(1);
  return body.map((cols,index)=>{
    const name=(cols[0]??"").trim();
    const repo=clean(cols[1]);
    const site=clean(cols[2]);
    const hint=clean(cols[3]);
    const sourceKind:PortfolioIntakeRow["sourceKind"]=repo?.includes("github.com/")
      ?"repository"
      :repo||site
        ?"site_only"
        :"unknown";
    const base:PortfolioIntakeRow={
      row:index+1,name,repo,site,hint,sourceKind,
      familyKey:familyFor(name),targetRole:"review",targetProductKey:slug(name),
      targetParentKey:null,migrationAction:sourceKind==="site_only"?"decide_repo_or_build":"repo_audit",
      migrationWave:sourceKind==="site_only"?3:4,needsRepo:false,
      buildInOmniqora:false,confidence:"provisional"
    };
    let exact=EXACT[name]??EXACT[name.trim()];
    if(name==="OMNIQORA ADD ON"){
      const source=(repo??site??"").toLowerCase();
      exact=source.includes("empfangiq")
        ?{targetRole:"shared_addon",targetProductKey:"reception.core",targetParentKey:"omniqora",familyKey:"omniqora",migrationAction:"build_native_addon",migrationWave:0,buildInOmniqora:true,needsRepo:false,confidence:"high"}
        :{targetRole:"shared_addon",targetProductKey:"intelligence.core",targetParentKey:"omniqora",familyKey:"omniqora",migrationAction:"build_native_addon",migrationWave:0,buildInOmniqora:true,needsRepo:false,confidence:"high"};
    }
    const merged={...base,...exact};
    if(sourceKind==="site_only"&&merged.targetRole==="review"){
      merged.migrationAction="build_native_then_review";
      merged.buildInOmniqora=true;
      merged.needsRepo=false;
      merged.confidence="medium";
    }
    return merged;
  });
}

export function portfolioIntakeCount(){return portfolioIntakeRows().length;}


export type KnownRepoAudit={
  repositoryFullName:string;repoUrl:string;latestCommitSha:string;latestCommitAt:string;
  fileCount:number;srcFileCount:number;routeCount:number;supabaseFileCount:number;
  migrationCount:number;functionCount:number;testCount:number;completenessScore:number;
  auditNotes:string;
};

export const KNOWN_FAMILY_REPO_AUDITS:Record<string,{canonical:string;rationale:string;candidates:KnownRepoAudit[]}>={
  education:{
    canonical:"asaffilate01-ship-it/ascent-education-cloud",
    rationale:"Ascent Education Cloud is the strongest current education source: 609 files, 179 route/page files, 194 Supabase files, 120 migrations and 69 functions. EduCloud and TrainDirekt are substantial but smaller; Virtual Lab is a focused add-on. Later README-only commits do not outweigh the deeper implemented surface.",
    candidates:[
      {repositoryFullName:"asaffilate01-ship-it/ascent-education-cloud",repoUrl:"https://github.com/asaffilate01-ship-it/ascent-education-cloud",latestCommitSha:"4030e330ca49b71b9191c36e28943a16647be38a",latestCommitAt:"2026-09-29T18:16:01Z",fileCount:609,srcFileCount:333,routeCount:179,supabaseFileCount:194,migrationCount:120,functionCount:69,testCount:11,completenessScore:96,auditNotes:"Canonical education codebase candidate; broadest functional and database surface."},
      {repositoryFullName:"asaffilate01-ship-it/learnbridge-pathway",repoUrl:"https://github.com/asaffilate01-ship-it/learnbridge-pathway",latestCommitSha:"733f4916299dd5b92c78b56117fd18ae508a037f",latestCommitAt:"2026-09-29T20:44:43Z",fileCount:396,srcFileCount:239,routeCount:116,supabaseFileCount:125,migrationCount:75,functionCount:47,testCount:5,completenessScore:74,auditNotes:"Strong EduCloud source; preserve distinct useful education modules during merge review."},
      {repositoryFullName:"asaffilate01-ship-it/horizon-educate",repoUrl:"https://github.com/asaffilate01-ship-it/horizon-educate",latestCommitSha:"74b49c727b4b84ef5de055ca9602d0ca8f2b19dd",latestCommitAt:"2026-09-29T20:13:53Z",fileCount:439,srcFileCount:274,routeCount:122,supabaseFileCount:131,migrationCount:79,functionCount:49,testCount:5,completenessScore:78,auditNotes:"Strong TrainDirekt source; retain regional/training features not already present in canonical education core."},
      {repositoryFullName:"asaffilate01-ship-it/pixel-perfect-replica-20502337",repoUrl:"https://github.com/asaffilate01-ship-it/pixel-perfect-replica-20502337",latestCommitSha:"1ad5cad538c0238a6297d8fa9ad0c9cdadd5ad57",latestCommitAt:"2026-09-29T21:17:18Z",fileCount:117,srcFileCount:79,routeCount:9,supabaseFileCount:0,migrationCount:0,functionCount:0,testCount:3,completenessScore:28,auditNotes:"Virtual Lab is a focused add-on, not the education-family core."}
    ]
  },
  orvilo:{
    canonical:"asaffilate01-ship-it/webtemplates",
    rationale:"Orvilo B is the most complete codebase: 216 files, 18 routes/pages, 39 Supabase files, 9 migrations and 27 functions. Orvilo X has the newest commit but substantially less backend depth. Merge useful A/X work into B rather than selecting solely by recency.",
    candidates:[
      {repositoryFullName:"asaffilate01-ship-it/webtemplates",repoUrl:"https://github.com/asaffilate01-ship-it/webtemplates",latestCommitSha:"b0264841c3142fe32bd7e6d7a686e6b461547a11",latestCommitAt:"2026-09-13T08:06:51Z",fileCount:216,srcFileCount:145,routeCount:18,supabaseFileCount:39,migrationCount:9,functionCount:27,testCount:9,completenessScore:94,auditNotes:"Canonical Orvilo source; strongest publishing, domains, subscription, template and backend surface."},
      {repositoryFullName:"asaffilate01-ship-it/launchpad-ai-87",repoUrl:"https://github.com/asaffilate01-ship-it/launchpad-ai-87",latestCommitSha:"2817bf6e6ddaf09c7e25c39c85b97a0df1376866",latestCommitAt:"2026-09-13T08:06:56Z",fileCount:115,srcFileCount:80,routeCount:7,supabaseFileCount:12,migrationCount:3,functionCount:6,testCount:5,completenessScore:55,auditNotes:"Merge source for brand-generation and launch-pack capabilities."},
      {repositoryFullName:"asaffilate01-ship-it/pixel-perfect-clone-ceddafea",repoUrl:"https://github.com/asaffilate01-ship-it/pixel-perfect-clone-ceddafea",latestCommitSha:"2d47a708ac13a4ad37a9961d687088a080c47abf",latestCommitAt:"2026-09-13T21:23:28Z",fileCount:127,srcFileCount:99,routeCount:10,supabaseFileCount:5,migrationCount:3,functionCount:0,testCount:4,completenessScore:48,auditNotes:"Newest Orvilo UI branch but less backend depth; merge UI improvements into canonical B."}
    ]
  }
};
