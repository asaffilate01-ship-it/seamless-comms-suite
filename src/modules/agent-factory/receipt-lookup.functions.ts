import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { receiptInput, lookupQueueReceipt } from "./receipt-lookup.server";
export const findFactoryQueueReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => receiptInput.parse(input))
  .handler(({ context, data }) => lookupQueueReceipt(context.supabase, context.userId, data));
