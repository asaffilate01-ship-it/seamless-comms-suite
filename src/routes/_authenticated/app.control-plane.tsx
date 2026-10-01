import { createFileRoute } from '@tanstack/react-router';
import ControlPlaneWorkspace from '@/modules/control-plane/ControlPlaneWorkspace';

export const Route = createFileRoute('/_authenticated/app/control-plane')({
  head: () => ({
    meta: [
      { title: 'SaaS Factory control plane — Omniqora' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ControlPlaneWorkspace,
});
