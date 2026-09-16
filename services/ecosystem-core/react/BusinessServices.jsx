import React, {useEffect, useState} from 'react';
/** api(path, body) MUST call your authenticated same-origin server adapter. */
export default function BusinessServices({api,sector='food',country='GB'}) {
 const [offers,setOffers]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let live=true; api('/catalogue',{sector,country}).then(x=>{if(live)setOffers(x)}).catch(()=>{if(live)setError('Services could not be loaded.')});return()=>{live=false}},[api,sector,country]);
 async function submit(e){e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError('');try{
 await api('/referrals',{referral:{provider:selected.provider.id,service:selected.offer.id,brief:form.get('brief'),contact:{name:form.get('name'),email:form.get('email')},approved:form.get('approved')==='on',notice:'introduction-v1',request_key:selected.key}});
 setSelected(null);setMessage('Your enquiry has been sent. No subscription or payment has been created.');
 }catch{setError('Unable to send. Please try again.')}finally{setBusy(false)}}
 return <section aria-label="Business services" style={{maxWidth:1000,margin:'auto',padding:24}}>
 <h2>Services for your business</h2><p>Explore support from across our network. Enquiries are free. Paid services have their own plans and checkout.</p>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>{offers.map(offer=><article key={offer.id} style={{border:'1px solid #cbd5e1',borderRadius:12,padding:20}}><h3>{offer.name}</h3><p>{offer.description}</p>{offer.providers.length?offer.providers.map(provider=><button key={provider.id} onClick={()=>{setSelected({offer,provider,key:crypto.randomUUID()});setMessage('')}}>Enquire with {provider.name}</button>):<p>No providers available for your country.</p>}</article>)}</div>
 {selected&&<form onSubmit={submit} style={{padding:24,border:'2px solid #0f766e',marginTop:24,borderRadius:12}}><h3>Introduction to {selected.provider.name}</h3>
 <p>We will share your contact name, email and the request below with {selected.provider.name} so they can respond. This does not sign you up to ongoing marketing or a paid plan.</p>
 <label>Name <input name="name" required maxLength={254}/></label><br/>
 <label>Email <input name="email" type="email" required maxLength={254}/></label><br/>
 <label>What do you need? <textarea name="brief" required maxLength={2000}/></label><br/>
 <label><input name="approved" type="checkbox" required/>I approve sharing these details with {selected.provider.name} for this enquiry.</label><br/>
 <button disabled={busy} type="submit">{busy?'Sending…':'Send free enquiry'}</button> <button disabled={busy} type="button" onClick={()=>setSelected(null)}>Cancel</button>
 </form>}
 </section>
}
