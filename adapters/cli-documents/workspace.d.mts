type Scope = { tenantId: string; productKey: string };
type Binding = Scope & { endpoint: string };
export type DocumentJob = { id: string; status: string; day: string; draft: true };
export function bindingFor(raw: string | undefined, scope: Scope): Binding | null;
export function workspaceAccess(db: unknown, actor: string, scope: Scope, raw: string | undefined): Promise<{ binding: Binding | null; canWrite: boolean }>;
type Client = {
  list(page?: { before?: number; limit?: number }): Promise<{ jobs: DocumentJob[]; next: number | null }>;
  submit(input: { requestId: string; document: { title: string; paragraphs: string[] } }): Promise<{ id: string }>;
  download(id: string): Promise<Buffer>;
  history(id: string, page: { after?: number; limit?: number }): Promise<{ events: DocumentEvent[]; next: number | null }>;
  remove(id: string): Promise<{ id: string; status: "deleted" }>;
};

export type DocumentEvent = { id: number; event: string; at: string };
export function workspaceClient(binding: Binding | null, authorization: string | null): Client;
export function workspaceOperation(client: Client, access: { canWrite: boolean }, input: { action: string; [key: string]: unknown }): Promise<
  | { kind: 'list'; configured: boolean; canWrite: boolean; jobs: DocumentJob[]; next: number | null }
  | { kind: 'submitted'; id: string }
  | { kind: 'history'; events: DocumentEvent[]; next: number | null }
  | { kind: 'deleted'; id: string; status: 'deleted' }
  | { kind: 'download'; base64: string; filename: string }
>;
