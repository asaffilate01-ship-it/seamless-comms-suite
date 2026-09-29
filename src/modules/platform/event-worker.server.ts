export type ClaimedModuleEvent = {
  queueId: string;
  moduleKey: string;
  tenantId: string;
  tenantProductId: string | null;
  event: { id: string; event_type: string; payload: Record<string, unknown>; [key: string]: unknown };
};

export type ModuleEventProcessor = (job: ClaimedModuleEvent) => Promise<void>;

export class ModuleEventProcessorRegistry {
  private processors = new Map<string, ModuleEventProcessor>();

  register(moduleKey: string, processor: ModuleEventProcessor) {
    if (this.processors.has(moduleKey)) throw new Error("Processor already registered for " + moduleKey);
    this.processors.set(moduleKey, processor);
    return this;
  }

  async process(job: ClaimedModuleEvent) {
    const processor = this.processors.get(job.moduleKey);
    if (!processor) throw new Error("No module event processor registered for " + job.moduleKey);
    await processor(job);
  }
}

export async function runModuleEventBatch(
  registry: ModuleEventProcessorRegistry,
  options: { limit?: number } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: claimed, error } = await db.rpc("claim_platform_module_events", { _limit: options.limit ?? 20 });
  if (error) throw new Error(error.message);

  const results: Array<{ queueId: string; ok: boolean; error?: string }> = [];
  for (const raw of claimed ?? []) {
    const job = raw as ClaimedModuleEvent;
    try {
      await registry.process(job);
      const done = await db.rpc("finish_platform_module_event", { _queue: job.queueId, _success: true, _error: null });
      if (done.error) throw new Error(done.error.message);
      results.push({ queueId: job.queueId, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Module processing failed";
      await db.rpc("finish_platform_module_event", { _queue: job.queueId, _success: false, _error: message });
      results.push({ queueId: job.queueId, ok: false, error: message });
    }
  }
  return results;
}