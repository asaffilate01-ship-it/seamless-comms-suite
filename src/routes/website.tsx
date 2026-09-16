import { createFileRoute } from '@tanstack/react-router';
import OmniqoraWebsite from '../modules/marketing/OmniqoraWebsite';

export const Route = createFileRoute('/website')({
  head: () => ({
    meta: [
      { title: 'Omniqora — Your business, working as one.' },
      { property: 'og:title', content: 'Omniqora — Your business, working as one.' },
      { property: 'og:description', content: 'Connected services for conversations, workflows, business performance and complex change.' },
      { name: 'twitter:title', content: 'Omniqora — Your business, working as one.' },
      { name: 'twitter:description', content: 'Standalone solutions, SaaS add-ons and managed delivery.' },
      { name: 'description', content: 'Connected services for customer conversations, intelligent workflows, business performance and complex change. Standalone solutions, SaaS add-ons and managed delivery.' },
    ],
    links: [{ rel: 'icon', type: 'image/svg+xml', href: '/brand/omniqora-mark.svg' }],
  }),
  component: OmniqoraWebsite,
});
