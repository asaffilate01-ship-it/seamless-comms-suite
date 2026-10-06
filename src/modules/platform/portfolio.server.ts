import { OMNIQORA_MODULES, OMNIQORA_PRODUCTS, type ProductDefinition } from "./registry";

export function compiledProduct(productKey:string):ProductDefinition|null{
  return OMNIQORA_PRODUCTS.find((item)=>item.key===productKey)??null;
}

export async function ensureCompiledProduct(admin:any,productKey:string){
  const product=compiledProduct(productKey);
  if(!product)throw new Error("Unknown Omniqora product: "+productKey);

  if(product.parentProductKey){
    await ensureCompiledProduct(admin,product.parentProductKey);
  }

  const moduleByKey=new Map(OMNIQORA_MODULES.map((module)=>[module.key,module]));
  for(const moduleKey of product.defaultModules){
    const module=moduleByKey.get(moduleKey);
    if(!module)throw new Error("Compiled module is missing from registry: "+moduleKey);
    const{error}=await admin.from("platform_modules").upsert({
      module_key:module.key,name:module.name,module_kind:module.kind,version:module.version,
      status:module.status,ui_mode:module.uiMode,dependencies:module.dependencies,
      capabilities:module.capabilities,metadata:{compiledRegistry:true}
    },{onConflict:"module_key"});
    if(error)throw new Error(error.message);
  }

  const{error:productError}=await admin.from("platform_products").upsert({
    product_key:product.key,name:product.name,kind:product.kind,
    parent_product_key:product.parentProductKey??null,industry:product.industry??null,
    status:product.status,metadata:{compiledRegistry:true}
  },{onConflict:"product_key"});
  if(productError)throw new Error(productError.message);

  for(const moduleKey of product.defaultModules){
    const{error}=await admin.from("product_module_defaults").upsert({
      product_key:product.key,module_key:moduleKey,enabled_by_default:true,config:{source:"compiled_registry"}
    },{onConflict:"product_key,module_key"});
    if(error)throw new Error(error.message);
  }

  return product;
}

export async function ensureAllCompiledProducts(admin:any){
  const results=[];
  for(const product of OMNIQORA_PRODUCTS){
    if(product.kind==="platform"||product.kind==="shared_engine")continue;
    await ensureCompiledProduct(admin,product.key);
    results.push(product.key);
  }
  return results;
}
