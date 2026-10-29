import { z } from 'zod';
export const researchInput = z.object({
  tenantId: z.string().uuid(), productKey: z.string().min(2).max(80),
  requestId: z.string().uuid(), query: z.string().trim().min(4).max(1500),
  preset: z.enum(['general', 'uk-childcare', 'uk-food']).default('general'),
  publicQueryConfirmed: z.literal(true),
}).strict();
