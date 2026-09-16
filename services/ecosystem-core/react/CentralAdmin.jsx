import React,{useState,useEffect,useCallback} from 'react';
const input=(name,label)=><label style={{display:'block',margin:'8px 0'}}>{label} <input required name={name} maxLength={200}/></label>;
export default function CentralAdmin({api}) {
 const [data,setData]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>setData(await api('/admin/overview')),[api]);
 useEffect(()=>{refresh().catch(()=>setMessage('Administrator access unavailable.'))},[refresh]);
 async function save(e,path,field,transform){e.preventDefault();const form=e.currentTarget;const values=Object.fromEntries(new FormData(form));setBusy(true);try{await api(path,{[field]:transform?transform(values):values});await refresh();setMessage('Saved.');form.reset()}catch{setMessage('Could not save. Check values and permissions.')}finally{setBusy(false)}}
 if(!data)return <p role="status">{message||'Loading administration…'}</p>;
 return <main style={{maxWidth:1000,margin:'auto',padding:24}}><h1>Ecosystem administration</h1><p>Manage approved providers, service access and bundle definitions.</p><p role="status">{message}</p>
 <h2>Referral activity</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Source</th><th>Service</th><th>Status</th><th>Enquiries</th></tr></thead><tbody>{data.referrals.map((r,i)=><tr key={i}><td>{r.source}</td><td>{r.service}</td><td>{r.status}</td><td>{r.count}</td></tr>)}</tbody></table></div>
 <h2>Providers</h2>{data.providers.map(p=><p key={p.id}>{p.name} — {p.country} — {p.active?'Active':'Inactive'} — ID: {p.id}</p>)}
 <form onSubmit={e=>save(e,'/admin/provider','provider',v=>({...v,active:v.active==='on'}))}><h3>Add or update provider</h3>{input('id','Provider ID')}{input('app','Provider app slug')}{input('org','Provider organisation ID')}{input('name','Legal recipient name')}{input('country','Country code (GB / DE)')}<label>Service <select name="service">{data.services.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><p><label><input name="active" type="checkbox"/>Verified and available for introductions</label></p><button disabled={busy}>Save provider</button></form>
 <h2>Bundles</h2><p>Definitions only. Saving a bundle does not create charges, grant access or cancel standalone subscriptions.</p>{data.bundles.map(b=><p key={b.id}>{b.name}: {JSON.parse(b.products).join(', ')}</p>)}
 <form onSubmit={e=>save(e,'/admin/bundle','bundle',v=>({...v,products:v.products.split(',').map(x=>x.trim())}))}>{input('id','Bundle ID')}{input('name','Bundle name')}{input('products','Product slugs separated by commas')}<button disabled={busy}>Save bundle</button></form>
 <h2>Record service access</h2><p>Record only access verified against the originating service. This is not proof of payment.</p><form onSubmit={e=>save(e,'/admin/grant','grant',v=>({...v,expires:v.expires||null}))}>{input('app','Source app slug')}{input('org','Business organisation ID')}{input('product','Product slug')}{input('source','Verification reference')}<label>Expiry (optional UTC: YYYY-MM-DDTHH:MM:SSZ) <input name="expires"/></label><p><button disabled={busy}>Record access</button></p></form>
 <form onSubmit={e=>save(e,'/admin/revoke','grant')}><h3>Remove recorded access</h3>{input('app','Source app slug')}{input('org','Business organisation ID')}{input('product','Product slug')}<button disabled={busy}>Remove access record</button></form>
 </main>
}
