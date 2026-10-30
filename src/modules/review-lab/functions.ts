import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { findingsSchema, studySchema } from './contract';

export const prepareReviewStudy = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studySchema.parse(input))
  .handler(async ({ context, data }) => {
    const { prepareReview } = await import('./service.server');
    return prepareReview(context.supabase, context.userId, data);
  });

export const inspectReviewReport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ study: studySchema, report: findingsSchema }).strict().parse(input))
  .handler(async ({ context, data }) => {
    const { inspectReview } = await import('./service.server');
    return inspectReview(context.supabase, context.userId, data.study, data.report);
  });

// No execution route exists in this release. Keys or client flags cannot enable spending.
