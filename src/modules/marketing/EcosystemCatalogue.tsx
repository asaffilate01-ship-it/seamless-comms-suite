import {ArrowUpRight,Network} from 'lucide-react';
const groups=[
 ['Food safety & hospitality','Haccora · Dishbee · EPOS intelligence','Connect operational evidence, sales, stock and waste observations to practical improvement reviews.'],
 ['Legal services','Lawquo','Support authorised case research and draft preparation, with the legal team retaining review and publication control.'],
 ['Accounting & tax','TaxNuvia · TaxCenda · IQ Practice Cloud','Support service discovery, evidence preparation and business performance conversations.'],
 ['Automotive & parts','SparesGrid · FleetSora · MotoResQ · Zivvo','Bring approved inventory, enquiry and operational information into clearer decisions and customer responses.'],
 ['Cash flow & recovery','Recovra · Recovarable · Business360','Review debtor information, collection bottlenecks and working capital, with authorised recovery services where arranged.'],
 ['Connectivity & commerce','Veyumo · Zoryn · CommerceOps','Coordinate account connections, mobile services and commercial journeys with the selected providers.'],
 ['Documents & business operations','Dokuvera · Craftvaro · Cirqiva · Premisora','Connect knowledge, service delivery and operational evidence to the work each team needs to complete.'],
 ['Your business or tenant project','Standalone · Embedded · Managed','Use Business360 directly, add intelligence to an existing SaaS product, or arrange a scoped connection for your organisation.'],
];
export default function EcosystemCatalogue(){return <section id="ecosystem" className="oq-section oq-ecosystem">
 <div className="oq-section-heading"><div><p className="oq-eyebrow">ONE ECOSYSTEM. RELEVANT CONNECTIONS.</p><h2>Intelligence where<br/>your business works.</h2></div><p>Choose the services your team needs. Connections are scoped to the product, business and information you authorise.</p></div>
 <div className="oq-platform-grid">{groups.map(([title,names,description])=><article className="oq-platform-card" key={title}><Network size={23}/><h3>{title}</h3><p className="oq-family">{names}</p><p>{description}</p></article>)}</div>
 <p className="oq-availability">Product availability and each connection are confirmed during setup. A product listing does not mean that customer data is already shared or that a live integration is active.</p>
 <a className="oq-text-link" href="#contact">Discuss your products and departments <ArrowUpRight size={17}/></a>
 </section>}
