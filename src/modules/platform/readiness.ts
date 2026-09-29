import { pluginDefinition } from "./plugins";

export type IntegrationReadinessInput={
  moduleKeys:string[];
  bindings:Array<{id:string;module_key:string|null;provider:string;plugin_key:string|null;integration_kind:string;environment:string;secret_ref?:string|null;secret_refs?:Record<string,string>|null;status:string;last_verified_at?:string|null}>;
  domains:Array<{hostname:string;purpose:string;verification_status:string;is_primary:boolean}>;
  locations:Array<{id:string;name:string;status:string}>;
};

export type ReadinessIssue={code:string;severity:"blocker"|"warning"|"info";moduleKey?:string;integrationKind?:string;message:string;missingCredentialNames?:string[]};

const MODULE_REQUIREMENTS:Record<string,Array<{integrationKind:string;required:boolean;note:string}>>={
 "geo.core":[{integrationKind:"maps",required:true,note:"Geo needs a configured maps/routing provider."}],
 "payments.core":[{integrationKind:"payments",required:true,note:"Payments needs a production payment provider before live checkout."}],
 "connect.core":[{integrationKind:"communications",required:false,note:"Bind Meta, Twilio, SIP or another communications provider for live channels."}],
 "intelligence.core":[{integrationKind:"ai",required:false,note:"Evidence-only mode can run without a model; GenAI requires an approved AI provider."}],
 "creative.core":[{integrationKind:"creative",required:false,note:"Voxentri can orchestrate internal AI/media providers when enabled."}],
};

export function assessTenantReadiness(input:IntegrationReadinessInput){
 const issues:ReadinessIssue[]=[];
 for(const moduleKey of input.moduleKeys){
  for(const requirement of MODULE_REQUIREMENTS[moduleKey]??[]){
   const bindings=input.bindings.filter((b)=>b.module_key===moduleKey&&b.integration_kind===requirement.integrationKind&&b.environment==="production"&&b.status!=="disabled");
   if(!bindings.length){issues.push({code:"integration_missing",severity:requirement.required?"blocker":"warning",moduleKey,integrationKind:requirement.integrationKind,message:requirement.note});continue;}
   for(const binding of bindings){
    const plugin=pluginDefinition(binding.plugin_key??binding.provider)??pluginDefinition(requirement.integrationKind+"."+binding.provider);
    const refs: Record<string,string>={...(binding.secret_ref?{default:binding.secret_ref}:{}),...(binding.secret_refs??{})};
    const missing=(plugin?.secretNames??[]).filter((name)=>!refs[name]&&!refs.default);
    if(missing.length)issues.push({code:"credentials_missing",severity:requirement.required?"blocker":"warning",moduleKey,integrationKind:requirement.integrationKind,message:"Configured provider is missing required credential references.",missingCredentialNames:missing});
    if(binding.status!=="active")issues.push({code:"integration_not_active",severity:requirement.required?"blocker":"warning",moduleKey,integrationKind:requirement.integrationKind,message:"Provider binding is configured but not active."});
    if(!binding.last_verified_at)issues.push({code:"integration_unverified",severity:"warning",moduleKey,integrationKind:requirement.integrationKind,message:"Provider binding has not been live-verified."});
   }
  }
 }
 if(!input.domains.some((d)=>d.purpose==="app"&&d.verification_status==="verified"))issues.push({code:"app_domain_unverified",severity:"warning",message:"No verified app domain is configured; a platform domain can still be used."});
 if(!input.locations.length)issues.push({code:"no_locations",severity:"info",message:"No locations are configured. This is valid for virtual/head-office products but should be reviewed."});
 const blockers=issues.filter((i)=>i.severity==="blocker").length;
 const warnings=issues.filter((i)=>i.severity==="warning").length;
 return{readyForConfiguredModules:blockers===0,blockers,warnings,issues};
}