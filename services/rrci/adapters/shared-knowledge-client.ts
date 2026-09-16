/** SERVER ONLY runtime. Browser components may import types with `import type` only. */
export type RetrievalMode = "rag" | "graph" | "hybrid";
export interface Evidence {
  citation_id: string; chunk_id: string; document_id: string;
  revision: number; title: string; source_uri: string; quote: string;
}
export interface KnowledgeResult {
  run_id: string;
  status: "draft" | "evidence_only" | "insufficient_evidence";
  answer: string;
  evidence: Evidence[];
  graph_paths: Array<{nodes: string[]; edges: Array<{
    id: string; source: string; relation: string; target: string;
    quote: string; citation_id: string;
  }>} >;
  review_required: boolean;
}

export class KnowledgeClient {
  private readonly base: string;
  constructor(baseUrl: string, private readonly token: string) {
    const url = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
        url.username || url.password || url.search || url.hash) {
      throw new Error("Use a trusted HTTPS service URL (HTTP is allowed on loopback).");
    }
    if (token.length < 32) throw new Error("A scoped server credential is required.");
    this.base = baseUrl.replace(/\/$/, "");
  }

  async query(input: {collection: string; question: string; mode?: RetrievalMode;
                     jurisdiction?: string; language?: string; as_of?: string}): Promise<KnowledgeResult> {
    const response = await fetch(this.base + "/v1/query", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(55000),
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + this.token},
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Knowledge service request failed (${response.status}).`);
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") throw new Error("Invalid knowledge response.");
    const result = data as KnowledgeResult;
    if (typeof result.run_id !== "string" || typeof result.answer !== "string" ||
        !["draft", "evidence_only", "insufficient_evidence"].includes(result.status) ||
        !Array.isArray(result.evidence) || !Array.isArray(result.graph_paths) ||
        typeof result.review_required !== "boolean" ||
        result.evidence.some(e => !e || [e.citation_id, e.chunk_id, e.document_id,
          e.title, e.source_uri, e.quote].some(v => typeof v !== "string") || !Number.isInteger(e.revision)) ||
        result.graph_paths.some(p => !p || !Array.isArray(p.nodes) ||
          p.nodes.some(n => typeof n !== "string") || !Array.isArray(p.edges) ||
          p.edges.some(e => !e || [e.id, e.source, e.relation, e.target, e.quote, e.citation_id].some(v => typeof v !== "string")))) {
      throw new Error("Invalid knowledge response.");
    }
    return result;
  }
}

/** Supply this ONLY after the SaaS authenticates the user and verifies collection access.
 * Choose the credential, collection, jurisdiction and language from server records.
 * A browser-supplied organisation ID or collection name is not authorisation.
 */
export interface AuthorisedKnowledgeContext {
  serviceUrl: string;
  serviceToken: string;
  collection: string;
  jurisdiction?: string;
  language?: string;
}

export function createKnowledgeHandler(
  authorise: (request: Request) => Promise<AuthorisedKnowledgeContext | null>,
) {
  return async (request: Request): Promise<Response> => {
    const headers = {"Content-Type": "application/json", "Cache-Control": "no-store"};
    if (request.method !== "POST") return new Response('{"error":"Use POST"}', {status: 405, headers});
    try {
      const context = await authorise(request);
      if (!context) return new Response('{"error":"Access denied"}', {status: 403, headers});
      // Enforce a body limit while reading, even without a Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return new Response('{"error":"Missing body"}', {status: 400, headers});
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 12000) {
          await reader.cancel();
          return new Response('{"error":"Request too large"}', {status: 413, headers});
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some(k => !["question", "mode"].includes(k)) ||
          typeof body.question !== "string" || !body.question.trim() || body.question.length > 2000 ||
          (body.mode !== undefined && !["rag", "graph", "hybrid"].includes(body.mode))) {
        return new Response('{"error":"Invalid question"}', {status: 422, headers});
      }
      const client = new KnowledgeClient(context.serviceUrl, context.serviceToken);
      const result = await client.query({collection: context.collection, question: body.question,
        mode: body.mode ?? "rag", jurisdiction: context.jurisdiction, language: context.language});
      return new Response(JSON.stringify(result), {status: 200, headers});
    } catch (error) {
      if (error instanceof SyntaxError) return new Response('{"error":"Invalid JSON"}', {status: 400, headers});
      return new Response('{"error":"Knowledge service unavailable"}', {status: 502, headers});
    }
  };
}
