export type FactoryProduct={
  key:string;
  name:string;
  description?:string|null;
  category:string;
  runtimeKey?:string|null;
  metadata?:Record<string,unknown>;
  pricePence?:number|null;
  currency?:string|null;
  defaultServices:string[];
};

export type FactoryService={
  key:string;
  name:string;
  description?:string|null;
  category:string;
  kind:string;
  billingBasis:string;
  pricePence?:number|null;
  currency?:string|null;
  runtimeKey?:string|null;
  metadata?:Record<string,unknown>;
  requires:string[];
};

export type FactoryBlueprint={
  key:string;
  name:string;
  description?:string|null;
  category:string;
  countryCode?:string|null;
  defaults?:Record<string,unknown>;
  metadata?:Record<string,unknown>;
  products:Array<{key:string;required:boolean}>;
  services:Array<{key:string;required:boolean}>;
};

export type FactoryCatalogue={
  products:FactoryProduct[];
  services:FactoryService[];
  blueprints:FactoryBlueprint[];
};

export type TenantControl={
  tenant:Record<string,unknown>;
  organisation?:Record<string,unknown>|null;
  products:Array<{key:string;name:string;status:string;planKey:string;config?:Record<string,unknown>}>;
  services:Array<{key:string;name:string;category:string;status:string;config?:Record<string,unknown>;pricePence?:number|null}>;
  branding:Array<Record<string,unknown>>;
  domains:Array<Record<string,unknown>>;
  jobs:Array<Record<string,unknown>>;
};

export const factorySteps=[
  "Organisation",
  "Products",
  "Blueprint",
  "Bundles & add-ons",
  "Branding",
  "Admin",
  "Review",
] as const;

export function slugify(value:string){
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
export function unique(values:string[]){return [...new Set(values.filter(Boolean))]}

export function resolveDependencies(selected:string[],services:Pick<FactoryService,"key"|"requires">[]){
  const map=new Map(services.map(service=>[service.key,service]));
  const out=new Set(selected);
  const visit=(key:string,path:string[])=>{
    if(path.includes(key))throw new Error("service_dependency_cycle:"+[...path,key].join("->"));
    const service=map.get(key);if(!service)return;
    for(const dep of service.requires??[]){out.add(dep);visit(dep,[...path,key])}
  };
  for(const key of [...out])visit(key,[]);
  return [...out];
}

export function productDefaultServices(products:string[],catalogue:FactoryCatalogue){
  const selected=new Set(products);
  return resolveDependencies(unique(catalogue.products
    .filter(product=>selected.has(product.key))
    .flatMap(product=>product.defaultServices??[])),catalogue.services);
}

export function applyBlueprint(
  blueprint:FactoryBlueprint|undefined,
  products:string[],
  services:string[],
  catalogue:FactoryCatalogue,
){
  if(!blueprint)return{products:unique(products),services:resolveDependencies(services,catalogue.services)};
  const nextProducts=unique([...products,...blueprint.products.filter(x=>x.required).map(x=>x.key)]);
  const defaults=productDefaultServices(nextProducts,catalogue);
  const nextServices=unique([...services,...blueprint.services.filter(x=>x.required).map(x=>x.key),...defaults]);
  return{products:nextProducts,services:resolveDependencies(nextServices,catalogue.services)};
}

export function groupedServices(services:FactoryService[]){
  const groups=new Map<string,FactoryService[]>();
  for(const service of services)groups.set(service.category,[...(groups.get(service.category)??[]),service]);
  return [...groups.entries()];
}

export function money(value:number|null|undefined,currency="GBP"){
  if(value==null)return "On plan";
  return new Intl.NumberFormat("en-GB",{style:"currency",currency}).format(value/100);
}
