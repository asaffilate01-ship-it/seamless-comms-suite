import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createProviderAdapter} from './providers.mjs';
import {runCricketWorkerPass} from './worker.mjs';
export async function main(env=process.env){
 if(env.CRICLUME_WORKER_ENABLED!=='true'||env.CRICLUME_WORKER_REVIEWED!=='true')throw new Error('Worker disabled');
 const url=new URL(env.SUPABASE_URL??'');if(url.protocol!=='https:'||url.hostname!==env.CRICLUME_ALLOWED_DATABASE_HOST||!url.hostname.endsWith('.supabase.co')||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Approved central database required');
 if(!env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY.length<32)throw new Error('Central credential required');
 const adapter=createProviderAdapter({providerKey:env.CRICLUME_PROVIDER_KEY,modelKey:env.CRICLUME_MODEL_KEY,token:env.CRICLUME_PROVIDER_TOKEN,reviewed:true});
 const {createClient}=await import('@supabase/supabase-js');const db=createClient(url.toString(),env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,options)=>fetch(input,{...options,redirect:'error'})}});
 const r=await runCricketWorkerPass({db,tenantId:env.CRICLUME_TENANT_ID,workerRef:randomUUID(),enabled:true,adapter});process.stdout.write(JSON.stringify(r)+'\n');return r;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{process.stderr.write('Worker failed; reconcile the central job before retrying.\n');process.exitCode=1;});
