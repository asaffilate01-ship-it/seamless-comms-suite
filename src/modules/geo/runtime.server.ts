import type { GeoProvider, GeoAddress, GeoPoint, RouteRequest } from "./contracts";
import { createGoogleMapsProvider, createMapboxProvider } from "./providers.server";
import { chooseTenantPlugin, resolveBindingSecrets } from "@/modules/platform/plugin-runtime.server";

export type GeoProviderFactory=(credentials:Record<string,string>,config:Record<string,unknown>)=>GeoProvider;
export class GeoProviderRegistry{private factories=new Map<string,GeoProviderFactory>();register(key:string,factory:GeoProviderFactory){if(this.factories.has(key))throw new Error("Geo provider already registered: "+key);this.factories.set(key,factory);return this;}create(key:string,credentials:Record<string,string>,config:Record<string,unknown>){const f=this.factories.get(key);if(!f)throw new Error("Geo provider not installed: "+key);return f(credentials,config);}}
export function defaultGeoProviderRegistry(){return new GeoProviderRegistry().register("maps.google",createGoogleMapsProvider).register("maps.mapbox",createMapboxProvider);}

export async function resolveTenantGeoProvider(input:{tenantId:string;tenantProductId:string;regionKey:string;registry?:GeoProviderRegistry}){
 const candidate=await chooseTenantPlugin({tenantId:input.tenantId,tenantProductId:input.tenantProductId,moduleKey:"geo.core",integrationKind:"maps",regionKey:input.regionKey});
 const credentials=resolveBindingSecrets(candidate.binding as any);const registry=input.registry??defaultGeoProviderRegistry();return registry.create(candidate.definition.key,credentials,candidate.binding.config);
}

export async function tenantGeocode(input:{tenantId:string;tenantProductId:string;regionKey:string;address:GeoAddress;registry?:GeoProviderRegistry}){const provider=await resolveTenantGeoProvider(input);return provider.geocode(input.address);}
export async function tenantReverseGeocode(input:{tenantId:string;tenantProductId:string;regionKey:string;point:GeoPoint;registry?:GeoProviderRegistry}){const provider=await resolveTenantGeoProvider(input);return provider.reverse(input.point);}
export async function tenantRoute(input:{tenantId:string;tenantProductId:string;regionKey:string;request:RouteRequest;registry?:GeoProviderRegistry}){const provider=await resolveTenantGeoProvider(input);return provider.route(input.request);}