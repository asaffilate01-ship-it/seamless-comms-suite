import { pluginDefinition, type PluginBinding } from "./plugins";
import { getRegionPack } from "./registry";
import { chooseProvider, type ProviderCandidate } from "./provider-routing";

const SECRET_REF=/^env:([A-Z][A-Z0-9_]{2,127})$/;

export function resolveSecretRef(ref: string): string {
  const match=SECRET_REF.exec(ref);
  if(!match) throw new Error("Only env:VARIABLE secret references are supported by this runtime");
  const value=process.env[match[1]!];
  if(!value) throw new Error("Configured secret is unavailable");
  return value;
}

export function resolveBindingSecrets(binding: PluginBinding & { secretRefs?: Record<string,string> }) {
  const result:Record<string,string>={};
  for(const [name,ref] of Object.entries(binding.secretRefs??{})) result[name]=resolveSecretRef(ref);
  return result;
}

export async function loadPluginCandidates(input:{tenantId:string;tenantProductId:string;moduleKey:string;integrationKind:string;environment?:"development"|"staging"|"production"}) {
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const{data:rows,error}=await db.from("tenant_integration_bindings")
    .select("id,provider,plugin_key,integration_kind,environment,secret_ref,secret_refs,external_account_ref,config,status,last_verified_at")
    .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId).eq("module_key",input.moduleKey).eq("integration_kind",input.integrationKind).eq("environment",input.environment??"production").eq("status","active");
  if(error)throw new Error(error.message);
  return(rows??[]).map((row:any)=>{
    const key=row.plugin_key??row.provider;
    const definition=pluginDefinition(key)??pluginDefinition(input.integrationKind+"."+row.provider);
    if(!definition)return null;
    const binding:PluginBinding&{secretRefs:Record<string,string>}={pluginKey:definition.key,scope:"tenant",tenantId:input.tenantId,tenantProductId:input.tenantProductId,environment:row.environment,secretRefs:{...(row.secret_ref?{default:row.secret_ref}:{}),...(row.secret_refs??{})},config:{...(row.config??{}),externalAccountRef:row.external_account_ref}};
    return{definition,binding,health:row.last_verified_at?"healthy":"unknown"} as ProviderCandidate;
  }).filter(Boolean) as ProviderCandidate[];
}

export async function chooseTenantPlugin(input:{tenantId:string;tenantProductId:string;moduleKey:string;integrationKind:string;regionKey:string;environment?:"development"|"staging"|"production"}) {
  const candidates=await loadPluginCandidates(input);
  const region=getRegionPack(input.regionKey);
  return chooseProvider(input.integrationKind,candidates,region);
}