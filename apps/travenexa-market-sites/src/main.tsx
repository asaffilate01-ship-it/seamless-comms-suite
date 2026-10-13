import React, { useMemo, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, BadgeCheck, CalendarDays, CarFront, CheckCircle2, Clock3,
  Compass, Globe2, Headphones, Hotel, MapPin, PlaneLanding, Search,
  ShieldCheck, Sparkles, Ticket, TrainFront, UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { airports, cities, fromDocument, markets, productKeys, type ProductKey } from './markets';
import './styles.css';

const market = fromDocument();
const copy = market.copy;

type Offer = {
  id: string;
  supplierName: string;
  title: string;
  amount: number;
  currency: string;
  expiresAt: string;
  description?: string;
  affiliateRedirect?: string;
};
type SearchReply = { status: 'live'; offers: Offer[] };
type SearchState = 'idle' | 'loading' | 'results' | 'unavailable';

const sections: { key: ProductKey; icon: LucideIcon }[] = [
  { key: 'airport', icon: PlaneLanding },
  { key: 'hotels', icon: Hotel },
  { key: 'local', icon: CarFront },
  { key: 'rail', icon: TrainFront },
  { key: 'experiences', icon: Ticket },
];
const messages: Record<ProductKey, string> = {
  airport: copy.airportHelp,
  hotels: copy.hotelsHelp,
  local: copy.localHelp,
  rail: copy.railHelp,
  experiences: copy.experiencesHelp,
};

function safeAffiliateUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' ? url.href : null;
  } catch {
    return null;
  }
}

function SearchPanel({ onProductChange, activeProduct }: {
  onProductChange: (key: ProductKey) => void;
  activeProduct: ProductKey;
}) {
  const [origin, setOrigin] = useState<string>('LHR');
  const [city, setCity] = useState<string>('London');
  const [endCity, setEndCity] = useState<string>('Oxford');
  const [travelDate, setTravelDate] = useState('');
  const [localTime, setLocalTime] = useState('12:00');
  const [travellers, setTravellers] = useState('2');
  const [nights, setNights] = useState('3');
  const [flightNumber, setFlightNumber] = useState('');
  const [state, setState] = useState<SearchState>('idle');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [message, setMessage] = useState<string>('');
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);

  const minDate = useMemo(() => {
    // Local-calendar value, not UTC, to avoid rolling the day for visitors in Asia.
    const date = new Date();
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }, []);

  function switchProduct(product: ProductKey) {
    onProductChange(product);
    setOffers([]);
    setMessage('');
    setState('idle');
    setSelectedOffer(null);
    setOrigin(product === 'airport' ? 'LHR' : 'London');
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('loading');
    setSelectedOffer(null);
    setMessage('');
    setOffers([]);
    const input = {
      sourceMarket: market.sourceCountry,
      destinationCountry: 'GB',
      locale: market.locale,
      displayCurrency: market.displayCurrency,
      productType: activeProduct,
      travelDate,
      arrivalTime: localTime,
      travellers: Number(travellers),
      nights: activeProduct === 'hotels' ? Number(nights) : undefined,
      from: activeProduct === 'airport' ? origin : ['rail','local'].includes(activeProduct) ? origin : undefined,
      to: ['airport','rail','local'].includes(activeProduct) ? activeProduct === 'airport' ? city : endCity : city,
      flightNumber: activeProduct === 'airport' ? flightNumber.trim() || undefined : undefined,
    };
    try {
      const response = await fetch('/api/travel/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('supplier_unavailable');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || (data as SearchReply).status !== 'live' || !Array.isArray((data as SearchReply).offers)) {
        throw new Error('invalid_supplier_data');
      }
      const list = (data as SearchReply).offers.filter(item =>
        typeof item.id === 'string' && typeof item.title === 'string' &&
        typeof item.supplierName === 'string' && Number.isFinite(item.amount) &&
        item.amount >= 0 && typeof item.currency === 'string' && typeof item.expiresAt === 'string'
      ).slice(0, 20);
      setOffers(list);
      setState('results');
      if (!list.length) setMessage(copy.availabilityNotice);
    } catch {
      setMessage(copy.availabilityNotice);
      setState('unavailable');
    }
  }

  const field = (label: string, content: React.ReactNode, span = false) =>
    <label className={span ? 'field field-full' : 'field'}><span>{label}</span>{content}</label>;
  const cityOptions = cities.map(value => <option value={value} key={value}>{value}</option>);
  const fare = (amount: number, currency: string) => {
    try { return new Intl.NumberFormat(market.locale, { style: 'currency', currency }).format(amount); }
    catch { return `${currency} ${amount}`; }
  };
  return (
    <section className="search-section container" id="search" aria-labelledby="search-title">
      <div className="search-topline">
        <div><span className="eyebrow eyebrow-dark">{copy.chooseService}</span>
          <h2 id="search-title">{copy.searchTitle}</h2>
          <p className="muted">{copy.searchSub}</p>
        </div>
        <div className="currency-chip"><Globe2 size={17} />{market.displayCurrency} · {market.locale}</div>
      </div>
      <div className="service-tabs" role="tablist" aria-label={copy.chooseService}>
        {sections.map(({key,icon:Icon}) => (
          <button type="button" role="tab" aria-selected={activeProduct === key}
            className={`service-tab ${activeProduct === key ? 'active' : ''}`} key={key} onClick={() => switchProduct(key)}>
            <Icon size={21} strokeWidth={1.9} /><span>{copy[key]}</span>
            <small>{messages[key]}</small>
          </button>
        ))}
      </div>
      <div className="form-surface">
        <div className="form-heading">
          <div className="form-mark"><Search size={22} /></div>
          <div><h3>{copy[activeProduct]}</h3><p>{messages[activeProduct]}</p></div>
        </div>
        <form className="search-form" onSubmit={search}>
          {activeProduct === 'airport' && <>
            {field(copy.arrivalAirport,<select value={origin} onChange={e=>setOrigin(e.target.value)} required>{airports.map(x=><option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}</select>)}
            {field(copy.destination,<select value={city} onChange={e=>setCity(e.target.value)} required>{cityOptions}</select>)}
          </>}
          {activeProduct === 'hotels' && <>
            {field(copy.accommodation,<select value={city} onChange={e=>setCity(e.target.value)} required>{cityOptions}</select>)}
            {field(copy.nights,<select value={nights} onChange={e=>setNights(e.target.value)} required>{Array.from({length:21},(_,i)=><option key={i+1}>{i+1}</option>)}</select>)}
          </>}
          {(activeProduct === 'rail' || activeProduct === 'local') && <>
            {field(copy.origin,<select value={origin} onChange={e=>setOrigin(e.target.value)} required>{cityOptions}</select>)}
            {field(copy.destination,<select value={endCity} onChange={e=>setEndCity(e.target.value)} required>{cityOptions}</select>)}
          </>}
          {activeProduct === 'experiences' &&
            field(copy.city,<select value={city} onChange={e=>setCity(e.target.value)} required>{cityOptions}</select>)}
          {field(copy.date,<input type="date" value={travelDate} onChange={e=>setTravelDate(e.target.value)} min={minDate} required />)}
          {activeProduct !== 'hotels' && field(copy.time,<input type="time" value={localTime} onChange={e=>setLocalTime(e.target.value)} required />)}
          {field(copy.guests,<select value={travellers} onChange={e=>setTravellers(e.target.value)} required>{Array.from({length:12},(_,i)=><option key={i+1}>{i+1}</option>)}</select>)}
          {activeProduct === 'airport' && field(copy.flightNumber,<input type="text" maxLength={12} autoComplete="off" value={flightNumber} onChange={e=>setFlightNumber(e.target.value)} placeholder="BA 123" />)}
          <button className="primary-action" type="submit" disabled={state === 'loading'}>
            {state === 'loading' ? copy.searching : copy.getOptions}<ArrowRight size={19} />
          </button>
        </form>
        <p className="form-disclaimer"><ShieldCheck size={15} />{copy.sourceNotice}</p>
        {(state === 'unavailable' || (state === 'results' && offers.length === 0)) &&
          <div className="form-alert" role="status"><BadgeCheck size={22}/><span>{message}<small>{copy.cannotBook}</small></span></div>}
        {state === 'results' && offers.length > 0 && (
          <div className="offer-results" aria-live="polite">
            <h3>{copy.results}</h3>
            {offers.map(offer => (
              <div className="offer" key={offer.id}>
                <div className="offer-summary"><b>{offer.title}</b><span>{offer.supplierName}</span></div>
                <div className="offer-price">{fare(offer.amount,offer.currency)}</div>
                <button type="button" onClick={()=>setSelectedOffer(offer.id === selectedOffer ? null : offer.id)}>{copy.details}</button>
                {selectedOffer === offer.id && <div className="offer-details">
                  <p>{offer.description || copy.sourceNotice}</p>
                  <p>Offer expires: {new Date(offer.expiresAt).toLocaleString(market.locale)}</p>
                  {safeAffiliateUrl(offer.affiliateRedirect) && <a href={safeAffiliateUrl(offer.affiliateRedirect)!} target="_blank" rel="nofollow noopener noreferrer" className="referral-link">{copy.details}<ArrowRight size={15}/></a>}
                </div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Site() {
  const [activeProduct, setActiveProduct] = useState<ProductKey>('airport');
  const productCards = sections.map(({key,icon}) => ({key,icon,title:copy[key],desc:messages[key]}));
  const steps: {title:string;body:string;icon:LucideIcon}[] = [
    {title:copy.processOneTitle,body:copy.processOne,icon:CalendarDays},
    {title:copy.processTwoTitle,body:copy.processTwo,icon:ShieldCheck},
    {title:copy.processThreeTitle,body:copy.processThree,icon:CheckCircle2},
  ];
  const selectService = (product: ProductKey) => {
    setActiveProduct(product);
    document.getElementById('search')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  return (
    <>
      <div className="preview-bar"><span className="preview-dot" />{copy.previewTag} <span className="preview-separator">·</span> {copy.cannotBook}</div>
      <header className="header">
        <div className="container header-inner">
          <a href="#home" className="logo" aria-label={market.brandName}>
            <span className="logo-mark"><Compass size={24}/></span>
            <span className="logo-letters">{market.brandName}<small>{copy.marketLine}</small></span>
          </a>
          <nav className="header-links" aria-label="Primary navigation">
            <a href="#services">{copy.services}</a><a href="#how">{copy.howItWorks}</a><a href="#help">{copy.support}</a>
          </nav>
          <div className="header-controls">
            <label className="market-picker"><Globe2 size={16}/><span className="sr-only">Choose language</span>
              <select aria-label="Choose market and language" value={market.id} onChange={e=>{const key=e.target.value;if (Object.hasOwn(markets,key)) window.location.assign('/'+key+'/');}}>
                {Object.values(markets).map(m=><option value={m.id} key={m.id}>{m.flag} {m.locale}</option>)}
              </select>
            </label>
            <a className="header-cta" href="#search">{copy.planTrip}<ArrowRight size={16}/></a>
          </div>
        </div>
      </header>
      <main id="home">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={16}/>{copy.heroTag}</div>
              <h1>{copy.headline}</h1><p className="hero-description">{copy.introduction}</p>
              <div className="hero-buttons"><a href="#search" className="hero-cta">{copy.planTrip}<ArrowRight size={18}/></a><a href="#services" className="hero-secondary">{copy.services}</a></div>
              <div className="hero-highlights"><span><CheckCircle2 size={17}/>{copy.trust1}</span><span><Globe2 size={17}/>{copy.trust2}</span></div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-art-glow"/><div className="circle-orbit orbit-a"/><div className="circle-orbit orbit-b"/>
              <div className="skyline-wrap">
                <div className="skyline-building tower-left"/><div className="skyline-building tower-centre"/>
                <div className="skyline-building tower-clock"/><div className="skyline-building tower-right"/>
                <div className="skyline-bridge"/>
              </div>
              <div className="flight-line"><PlaneLanding size={31}/></div>
              <div className="hero-floating top"><MapPin size={19}/><span>London · United Kingdom</span></div>
              <div className="hero-floating bottom"><CalendarDays size={18}/><span>{copy.planTrip}</span></div>
              <div className="hero-monogram">UK</div>
            </div>
          </div>
        </section>
        <section className="benefits container" aria-label="Our standards">
          <div><ShieldCheck size={25}/><span>{copy.trust3}</span></div>
          <div><Headphones size={25}/><span>{copy.trust2}</span></div>
          <div><MapPin size={25}/><span>{copy.ukDestination}</span></div>
        </section>
        <section id="services" className="services-section container">
          <div className="section-top"><div><span className="eyebrow eyebrow-dark">{copy.services}</span><h2>{copy.moreToExplore}</h2></div></div>
          <div className="cards-grid">{productCards.map(({key,icon:Icon,title,desc},i)=>(
            <button type="button" className={`category-card category-${i+1}`} key={key} onClick={()=>selectService(key)}>
              <span className="category-icon"><Icon size={27} strokeWidth={1.8}/></span>
              <b>{title}</b><span>{desc}</span><ArrowRight className="category-arrow" size={20}/>
            </button>
          ))}</div>
        </section>
        <SearchPanel activeProduct={activeProduct} onProductChange={setActiveProduct}/>
        <section className="process" id="how"><div className="container">
          <div className="process-heading"><span className="eyebrow eyebrow-dark">{copy.howItWorks}</span><h2>{copy.processTitle}</h2></div>
          <div className="process-grid">{steps.map(({title,body,icon:Icon},i)=><div className="step" key={title}><div className="step-heading"><span className="step-count">0{i+1}</span><Icon size={23}/></div><h3>{title}</h3><p>{body}</p></div>)}</div>
        </div></section>
        <section className="help-section container" id="help">
          <div className="help-content"><div className="help-icon"><Headphones size={27}/></div><div><h2>{copy.helpTitle}</h2><p>{copy.helpText}</p><small>{copy.helpNote}</small></div></div>
          <div className="help-art"><UsersRound size={52} strokeWidth={1.2}/></div>
        </section>
      </main>
      <footer className="footer"><div className="container footer-inner">
        <div><div className="footer-brand">{market.brandName}</div><p>{copy.footer}</p><small>© {new Date().getFullYear()} TraveNexa · {copy.marketCountry} → {copy.ukDestination}</small></div>
        <nav aria-label="Market versions">{Object.values(markets).map(m=><a key={m.id} href={`/${m.id}/`} lang={m.locale} aria-current={market.id===m.id?'page':undefined}>{m.flag} {m.marketName}</a>)}</nav>
      </div></footer>
      <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
        <a href="#home"><Compass size={19}/><span>{copy.planTrip}</span></a>
        <a href="#services"><Ticket size={19}/><span>{copy.services}</span></a>
        <a href="#search"><Search size={19}/><span>{copy.getOptions}</span></a>
        <a href="#help"><Headphones size={19}/><span>{copy.support}</span></a>
      </nav>
    </>
  );
}

const target = document.getElementById('root');
if (!target) throw new Error('No root element');
createRoot(target).render(<React.StrictMode><Site/></React.StrictMode>);
