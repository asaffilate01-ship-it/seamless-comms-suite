import React,{useState,useEffect,useCallback} from 'react';
export default function ReferralDashboard({api,provider=false}) {
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try{setRows(await api(provider?'/inbox':'/outgoing'));setError('')}catch{setError('Could not load enquiries.')}},[api,provider]);
 useEffect(()=>{refresh()},[refresh]);
 async function change(id,status){setBusy(true);try{await api('/status',{id,status});await refresh()}catch{setError('Could not update enquiry. Please refresh.')}finally{setBusy(false)}}
 return <section><h2>{provider?'Business enquiries':'My enquiries'}</h2><button onClick={refresh} disabled={busy}>Refresh</button>{error&&<p role="alert">{error}</p>}{!rows.length&&<p>No enquiries to display.</p>}
 {rows.map(r=>{let contact={};try{contact=JSON.parse(r.contact||'{}')}catch{}return <article key={r.id} style={{border:'1px solid #cbd5e1',borderRadius:12,padding:16,marginTop:12}}><h3>{r.provider||r.service}</h3><p>Status: {r.status}</p>{provider&&<><p>{r.brief}</p><p>{contact.name} {contact.email}</p></>}{provider&&r.status==='submitted'&&<><button disabled={busy} onClick={()=>change(r.id,'accepted')}>Accept enquiry</button> <button disabled={busy} onClick={()=>change(r.id,'declined')}>Decline</button></>}{!provider&&r.status!=='withdrawn'&&<><p>Withdrawal stops access here; it cannot remove details already received by the provider.</p><button disabled={busy} onClick={()=>change(r.id,'withdrawn')}>Withdraw enquiry</button></>}</article>})}</section>
}
