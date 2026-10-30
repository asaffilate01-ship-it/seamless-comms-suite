import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  historyInput,
  detailInput,
  readRunHistory,
  readRunDetail,
  cancelQueuedFactoryRun,
} from "./run-history.server";

export const getFactoryRunHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => historyInput.parse(input))
  .handler(({ context, data }) => readRunHistory(context.supabase, context.userId, data));
export const getFactoryRunDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => detailInput.parse(input))
  .handler(({ context, data }) => readRunDetail(context.supabase, context.userId, data));
export const cancelFactoryQueuedRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => detailInput.parse(input))
  .handler(({ context, data }) => cancelQueuedFactoryRun(context.supabase, context.userId, data));
