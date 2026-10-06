import type { PortfolioSourceRow } from "./portfolio-source-inventory";

function slug(value:string){
  return value.trim().toLowerCase()
    .replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,120);
}

const NAME_TARGETS:Record<string,string>={
  "UNIPATHWAY":"unipathway",
  "HACCORA UK":"haccora",
  "HACCORA GERMANY":"haccora",
  "COURIER CONNECT":"courier-connect",
  "OMNIQORA":"omniqora",
  "AUTOHASHI":"autohashi",
  "CAFE1 ST ALBANS":"cafe1-st-albans",
  "TAXNUVIA":"taxnuvia",
  "VERIS LAW":"lawquo",
  "TAXCENDA":"taxcenda",
  "DULCIS":"dulcis",
  "DOKUVERA":"dokuvera",
  "MOTORESQ":"motoresq",
  "LEADSCOUT":"leadlens",
  "XPERTJOBS":"xpertjobs",
  "MERQANO":"merqano",
  "ORVILO A":"orvilo",
  "ORVILO B":"orvilo",
  "ORVILO X":"orvilo",
  "EVENTPLANR UK":"eventplanr",
  "EVENTPLANR GERMANY":"eventplanr",
  "ZIVVO UK":"zivvo",
  "ZIVVO GERMANY":"zivvo",
  "KINDERSTARS UK":"kindelo",
  "KINDERSTARS GERMANY":"kindelo",
  "ACCOUNTANCY":"iq-practice-cloud",
  "CAFE1 LUTON":"cafe1-luton",
  "ZORYN REWARDS":"zoryn-rewards",
  "QATNOV":"qatnov",
  "LESSONAHEAD":"lessonahead",
  "GABLEY":"gabley",
  "STYLESYNC":"stylesync",
  "LAWQUO":"lawquo",
  "SCHONOVA":"schonova",
  "TRAINDIREKT":"traindirekt",
  "IMMOVIQ":"immoviq",
  "ONYN":"onyn",
  "ONYN PK":"onyn",
  "FORMATION GENIE":"formationgenie",
  "STELLENXPERT":"xpertjobs",
  "FLEETORA":"fleetsora",
  "EDUCLOUD":"educloud",
  "TAXLOUNGE":"taxlounge",
  "DISHBEE":"dishbee",
  "FASTREMIT":"fastremit",
  "MEALDECK":"mealdeck",
  "AHLNIKKAH":"ahlnikkah",
  "VOXENTRI":"voxentri",
  "ALSTERO":"alstero",
  "MEYZAAR":"meyzaar",
  "ZARVANE":"zarvane",
  "KALETHON":"kalethon",
  "CAPACITOR":"capacitor",
  "KALETHON TEAMS":"kalethon-teams",
  "INSURE 360":"insure360",
  "EPOS AI":"epos",
  "VIRTUAL LAB":"virtual-lab",
  "CONSTRUCTION INTELLIGENCE AI":"construction-planning",
  "APNEPAAS":"apnepaas",
  "SPARESGRID":"sparesgrid",
  "SPARESGRID 2":"sparesgrid",
  "CLINOVEYA":"clinoveya",
  "VEYUMO":"veyumo",
  "VISA SPONSOR":"visa-sponsor",
  "REGULOS":"regulos",
  "PROMO STUDIO":"promo-studio",
  "SOFELLEA":"sofellea",
  "AUVANE ONE":"auvane-one",
  "ODDSENTIA FX":"oddsentia-fx",
  "FINMATCH AI":"finmatch-ai",
  "ACCOUNTS AI":"accounts-ai",
  "ATHLYVO":"athlyvo",
  "ODDSENTIA SPORTS":"oddsentia-sports",
  "AFFIVON":"affivon",
  "TENDRYVA":"tendryva",
  "GABLEY RETROFIT":"gabley-retrofit",
};

export function sourcePortfolioKey(row:PortfolioSourceRow){
  if(row.name==="OMNIQORA ADD ON"){
    const value=(row.repo??row.url??"").toLowerCase();
    if(value.includes("empfangiq"))return"empfangiq";
    return"omniqora-ai";
  }
  return NAME_TARGETS[row.name]??slug(row.name);
}

export function sourceKind(row:PortfolioSourceRow){
  const primary=(row.repo??"").toLowerCase();
  if(primary.includes("github.com/"))return"github_repo" as const;
  if(primary.includes("chatgpt.site")||primary.includes("lovable.app"))return"site" as const;
  if(row.url)return"deployment" as const;
  return"other" as const;
}

export function githubRepositoryName(value:string|null|undefined){
  if(!value)return null;
  const match=value.match(/github\.com\/([^/]+\/[^/#]+?)(?:\.git)?(?:[#/?].*)?$/i);
  return match?.[1]?.replace(/\.git$/i,"")??null;
}

export const SOURCE_RELATIONSHIP_HINTS:Array<{
  sourceKey:string;targetKey:string;relationship:
    "tenant_of"|"variant_of"|"merge_into"|"uses_engine"|"supersedes"|"integrates_with";
  note:string;
}>=[
  {sourceKey:"cafe1-st-albans",targetKey:"dishbee",relationship:"tenant_of",note:"Cafe 1 St Albans is an operating tenant/location on Dishbee."},
  {sourceKey:"cafe1-luton",targetKey:"dishbee",relationship:"tenant_of",note:"Cafe 1 Luton is an operating tenant/location on Dishbee."},
  {sourceKey:"mealdeck",targetKey:"dishbee",relationship:"tenant_of",note:"MealDeck keeps its multi-brand ordering experience but consumes Dishbee hospitality core."},
  {sourceKey:"dulcis",targetKey:"merqano",relationship:"tenant_of",note:"Dulcis is a brand/merchant tenant under Merqano."},
  {sourceKey:"meyzaar",targetKey:"merqano",relationship:"tenant_of",note:"Meyzaar is a brand/merchant tenant under Merqano."},
  {sourceKey:"zarvane",targetKey:"merqano",relationship:"tenant_of",note:"Zarvane is a brand/merchant tenant under Merqano."},
  {sourceKey:"kalethon",targetKey:"merqano",relationship:"tenant_of",note:"Kalethon is a brand/merchant tenant under Merqano."},
  {sourceKey:"alstero",targetKey:"merqano",relationship:"tenant_of",note:"Alstero is a brand/merchant tenant under Merqano."},
  {sourceKey:"kalethon-teams",targetKey:"merqano",relationship:"tenant_of",note:"Kalethon Teams should reuse the Merqano commerce core unless repo audit proves a distinct vertical."},
  {sourceKey:"taxlounge",targetKey:"iq-practice-cloud",relationship:"tenant_of",note:"TaxLounge is an operating accountancy practice tenant on IQ Practice Cloud."},
  {sourceKey:"qatnov",targetKey:"fleetsora",relationship:"tenant_of",note:"Qatnov is a regional logistics operator tenant using FleetSora + Omniqora Dispatch/Geo."},
  {sourceKey:"schonova",targetKey:"stylesync",relationship:"variant_of",note:"Schonova is the German-branded StyleSync edition."},
  {sourceKey:"immoviq",targetKey:"gabley",relationship:"variant_of",note:"Immoviq is a German-oriented Gabley property variant."},
  {sourceKey:"gabley-retrofit",targetKey:"gabley",relationship:"variant_of",note:"Gabley Retrofit is a retrofit product variant/add-on on the Gabley family."},
  {sourceKey:"visa-sponsor",targetKey:"xpertjobs",relationship:"uses_engine",note:"Sponsor intelligence is an XpertJobs/recruitment add-on."},
  {sourceKey:"promo-studio",targetKey:"voxentri",relationship:"uses_engine",note:"Promo Studio folds into Voxentri/creative.core."},
  {sourceKey:"accounts-ai",targetKey:"iq-practice-cloud",relationship:"uses_engine",note:"Accounts AI is a shared accounting intelligence add-on."},
  {sourceKey:"virtual-lab",targetKey:"unipathway",relationship:"uses_engine",note:"Virtual Lab is a shared education add-on also reusable by EduCloud/TrainDirekt."},
  {sourceKey:"epos",targetKey:"dishbee",relationship:"uses_engine",note:"EPOS AI becomes shared hospitality intelligence inside Omniqora/Dishbee."},
  {sourceKey:"omniqora-ai",targetKey:"omniqora",relationship:"uses_engine",note:"Omniqora AI folds into intelligence.core."},
  {sourceKey:"empfangiq",targetKey:"omniqora",relationship:"uses_engine",note:"EmpfangIQ folds into reception.core + Connect."},
  {sourceKey:"lawquo",targetKey:"lawquo",relationship:"supersedes",note:"Lawquo supersedes the older Veris Law source where feature audit confirms parity."},
];
