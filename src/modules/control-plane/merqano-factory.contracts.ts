import { z } from 'zod';

export const merqanoFactoryProductKey = 'merqano' as const;
export const merqanoServiceKeys = [
  'merqano.marketing',
  'merqano.marktpass',
  'merqano.merqora',
  'merqano.omniqora-ai',
] as const;

export const merqanoTenantLaunchSchema = z.object({
  omniqoraTenantId: z.string().uuid(),
  externalTenantKey: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(2),
  vertical: z.string().min(2),
  country: z.string().length(2),
  currency: z.string().length(3),
  timezone: z.string().min(3),
  primaryDomain: z.string().min(3).optional(),
  aiProfile: z.enum(['regulated-commerce','premium-retail','food-commerce']),
  services: z.array(z.enum(merqanoServiceKeys)).default([]),
});
export type MerqanoTenantLaunch=z.infer<typeof merqanoTenantLaunchSchema>;

export const merqanoPortfolioSeed=[
  {tenantKey:'alstero',displayName:'Alstero',vertical:'professional-instruments',aiProfile:'regulated-commerce'},
  {tenantKey:'kalethon',displayName:'Kalëthon',vertical:'premium-retail',aiProfile:'premium-retail'},
  {tenantKey:'dulcis',displayName:'Dulcis',vertical:'premium-retail',aiProfile:'premium-retail'},
  {tenantKey:'meyzaar',displayName:'Meyzaar',vertical:'premium-retail',aiProfile:'premium-retail'},
] as const;
