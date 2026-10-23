import { createFileRoute } from '@tanstack/react-router';
import { ServiceDesk } from '@/modules/service-desk/ServiceDesk';

export const Route = createFileRoute('/_authenticated/app/service-desk')({
  head: () => ({ meta: [{ title: 'Service Desk | Powered by Omniqora' }, { name: 'robots', content: 'noindex' }] }),
  component: ServiceDesk,
});
