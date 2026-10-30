type Scope = { tenantId: string; productKey: string };
type Binding = Scope & { endpoint: string };
export type DocumentJob = { id: string; status: string; day: string; draft: true };
export function bindingFor(raw: string | undefined, scope: Scope): Binding | null;
export function workspaceAccess(db: unknown, actor: string, scope: Scope, raw: string | undefined): Promise<{ binding: Binding | null; canWrite: boolean }>;
export function workspaceClient(binding: Binding | null, authorization: string | null): {
  list(page?: { before?: number; limit?: number }): Promise<{ jobs: DocumentJob[]; next: number | null }>;
  submit(input: { requestId: string; document: { title: string; paragraphs: string[] } }): Promise<{ id: string }>;
  download(id: string): Promise<Buffer>;
};
