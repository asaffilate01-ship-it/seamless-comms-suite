import React,{useState,useEffect} from 'react';
export default function MyServices({api}) {
 const [rows,setRows]=useState([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;api('/subscriptions').then(r=>{if(active)setRows(r)}).catch(()=>{if(active)setError('Unable to load service access.')});return()=>{active=false}},[api]);
 return <section><h2>My services</h2><p>Service access recorded for this business. Manage payments in the original service.</p>{error&&<p role="alert">{error}</p>}{rows.map(r=><article key={r.product}><h3>{r.product}</h3><p>{r.expires?`Access until ${r.expires}`:'No expiry recorded'}</p></article>)}{!rows.length&&!error&&<p>No linked service access recorded.</p>}</section>
}
