import {
  ArrowUpRight, BarChart3, CalendarDays, ContactRound, FolderKanban,
  Handshake, Headphones, Inbox, Megaphone, MonitorSmartphone,
  ShieldCheck, ShoppingBag, Sparkles, Workflow,
} from 'lucide-react';
import { promoContent } from '@/lib/promo-content';

const features = [
  { icon: Inbox, title: 'Omnichannel shared inbox', description: 'WhatsApp, Instagram, Facebook Messenger, SMS, email, web chat, Telegram and calls in one coordinated customer service experience.', detail: 'Team assignment · Internal notes · Conversation history' },
  { icon: ContactRound, title: 'CRM, contacts & customer journeys', description: 'Keep customer records and conversation context together, from a new enquiry through qualification, quotes, delivery and follow-up.', detail: 'Contact records · Lead context · Follow-ups' },
  { icon: FolderKanban, title: 'Cases & SLA control', description: 'Give each customer request a status, owner and next step, with deadlines and escalation paths that help the team stay accountable.', detail: 'Case records · Priorities · Handoffs' },
  { icon: Sparkles, title: 'Aida AI assistant', description: 'Support teams with enquiry triage, summaries, suggested replies and translation, with human review for decisions that matter.', detail: 'Reply assistance · Summaries · Multilingual support' },
  { icon: Headphones, title: 'AI reception, telephony & VoIP', description: 'Shape reception around enquiry intake, caller recognition, call routing, callbacks and human handoff, including outside opening hours.', detail: 'Business numbers · Number porting · Reception workflows' },
  { icon: Workflow, title: 'Workflow automation', description: 'Coordinate repeatable steps for intake, qualification, scheduling, fulfilment and follow-up across departments and connected tools.', detail: 'Rules · Tasks · Approvals' },
  { icon: Megaphone, title: 'Campaigns & message templates', description: 'Prepare customer campaigns and reusable messages with consent records, review and the requirements of each selected channel.', detail: 'Templates · Opt-in management · Campaign review' },
  { icon: BarChart3, title: 'Analytics & service reporting', description: 'Review customer activity, response times, workload and case progress to see where service and operational performance can improve.', detail: 'Response times · Team workload · Outcome reporting' },
  { icon: CalendarDays, title: 'Bookings & calendar connections', description: 'Connect enquiries to appointments, confirmations, reminders and follow-up journeys using the scheduling tools agreed for your service.', detail: 'Appointments · Reminders · Calendar integration' },
  { icon: ShoppingBag, title: 'Commerce, orders & payments', description: 'Bring seller and order context into customer conversations, with payment-link journeys and payment-status connections where configured.', detail: 'Seller hub · Order context · Provider payment links' },
  { icon: ShieldCheck, title: 'Roles, permissions & audit', description: 'Organise access for owners, administrators, staff, viewers and partners, with workspace permissions, approvals and activity records.', detail: 'Tenant access · Role controls · Review history' },
  { icon: Handshake, title: 'Partners, referrals & white-label', description: 'Offer connected services through partner and reseller relationships, with relevant referrals, embedded add-ons and scoped branded editions.', detail: 'Partner services · SaaS add-ons · Branded experiences' },
];

export default function PlatformCatalogue() {
  return (
    <section className="oq-section oq-platform" id="platform" aria-labelledby="platform-title">
      <div className="oq-section-heading">
        <div>
          <p className="oq-eyebrow">THE OMNIQORA PLATFORM</p>
          <h2 id="platform-title">Every conversation.<br />Every next step.</h2>
        </div>
        <p>Customer communication, CRM, service and automation form the foundation. Add Business360 and specialist intelligence as your needs grow.</p>
      </div>

      <div className="oq-channel-panel">
        <h3>One connected customer experience.</h3>
        <ul aria-label="Channels and connections" className="oq-channel-list">
          {promoContent.en.channels.items.map(channel => <li key={channel}>{channel}</li>)}
        </ul>
        <p>Channel availability, account eligibility and provider setup are confirmed for your chosen service.</p>
      </div>

      <div className="oq-platform-grid">
        {features.map(({ icon: Icon, title, description, detail }) => (
          <article className="oq-platform-card" key={title}>
            <Icon size={24} aria-hidden="true" />
            <h3>{title}</h3>
            <p>{description}</p>
            <span>{detail}</span>
          </article>
        ))}
      </div>

      <div className="oq-platform-access">
        <MonitorSmartphone size={32} aria-hidden="true" />
        <div>
          <h3>Desktop, tablet and mobile.</h3>
          <p>Explore the product screens, multilingual experience and team workflows. Existing customers can sign in to their workspace.</p>
        </div>
        <div className="oq-platform-links">
          <a className="oq-text-link" href="/#screens">Take the product tour <ArrowUpRight size={16} /></a>
          <a className="oq-text-link" href="/#pricing">Explore platform pricing <ArrowUpRight size={16} /></a>
          <a className="oq-text-link" href="/auth">Sign in to your workspace <ArrowUpRight size={16} /></a>
        </div>
      </div>

      <div className="oq-industry-heading">
        <div><p className="oq-eyebrow">SHAPED FOR YOUR SECTOR</p><h3>Industry workflow packs.</h3></div>
        <a className="oq-text-link" href="/#packs">Explore industry packs <ArrowUpRight size={16} /></a>
      </div>
      <ul className="oq-industry-list">
        {promoContent.en.packs.items.map(pack => <li key={pack.name}><b>{pack.name}</b><span>{pack.desc}</span></li>)}
      </ul>
      <p className="oq-platform-footnote">Choose a standalone service, an embedded add-on or a partner/white-label edition. Live channels, telephony, AI models and payment connections are configured to the agreed scope. Specialist audit and transformation engagements are quoted separately from platform subscriptions.</p>
    </section>
  );
}
