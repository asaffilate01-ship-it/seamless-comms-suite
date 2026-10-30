/** Server-side product client. Endpoint and verifier-backed bearer source are host configuration. */
import { createHash } from 'node:crypto';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const states = new Set(['queued', 'running', 'completed', 'failed', 'deleted', 'interrupted', 'expired']);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v, names) => isObject(v) && Object.keys(v).sort().join(',') === [...names].sort().join(',');
const positive = v => Number.isSafeInteger(v) && v > 0;
const cursor = v => v === null || positive(v);
const record = v => isObject(v) && uuid.test(v.id) && states.has(v.status);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export class DocumentClientError extends Error {
  constructor(code) { super(`Document service: ${code}`); this.name = 'DocumentClientError'; this.code = code; }
}
const fail = code => { throw new DocumentClientError(code); };
const check = (value, valid) => valid(value) ? value : fail('invalid_response');

export function createDocumentClient({ endpoint, getBearer, fetchImpl = globalThis.fetch,
  timeoutMs = 10000, testOnlyAllowLoopbackHttp = false }) {
  const base = new URL(endpoint);
  if ((base.protocol !== 'https:' && !(testOnlyAllowLoopbackHttp === true && base.protocol === 'http:' && base.hostname === '127.0.0.1')) ||
      base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      typeof getBearer !== 'function' || typeof fetchImpl !== 'function' ||
      !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000) fail('invalid_configuration');

  async function request(method, path, payload, binary = false) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new DocumentClientError('timeout')); }, timeoutMs);
    });
    const operation = async () => {
      let token;
      try { token = await getBearer({ signal: controller.signal }); }
      catch { fail('authentication_unavailable'); }
      if (controller.signal.aborted) fail('timeout');
      if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/=-]{1,8192}$/.test(token)) fail('authentication_unavailable');
      const response = await fetchImpl(new URL(path, base).href, {
        method, headers: { authorization: `Bearer ${token}`, accept: binary ? 'application/vnd.oasis.opendocument.text' : 'application/json',
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (controller.signal.aborted) {
        await response.body?.cancel().catch(() => {});
        fail('timeout');
      }
      if (response.status !== 200 || response.redirected) {
        // Never return raw provider errors, which may include private records or credentials.
        if (response.body) await response.body.cancel().catch(() => {});
        fail(({401:'unauthenticated',403:'forbidden',400:'invalid_request',413:'request_too_large'})[response.status] || 'unavailable');
      }
      const expectedType = binary ? 'application/vnd.oasis.opendocument.text' : 'application/json';
      if (response.headers.get('content-type')?.split(';')[0].trim() !== expectedType) {
        await response.body?.cancel().catch(() => {});
        fail('invalid_response');
      }
      const max = binary ? 2000000 : 100000;
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) {
        await response.body?.cancel().catch(() => {});
        fail('invalid_response');
      }
      if (!response.body) fail('invalid_response');
      const reader = response.body.getReader();
      const abortRead = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener('abort', abortRead, { once: true });
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > max) fail('invalid_response');
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        controller.signal.removeEventListener('abort', abortRead);
        reader.releaseLock();
      }
      if (controller.signal.aborted) fail('timeout');
      if (declared !== null && Number(declared) !== size) fail('invalid_response');
      const bytes = Buffer.concat(chunks, size);
      if (binary) return bytes;
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { fail('invalid_response'); }
    };
    try { return await Promise.race([operation(), deadline]); }
    catch (error) {
      if (error instanceof DocumentClientError) throw error;
      fail(controller.signal.aborted ? 'timeout' : 'unavailable');
    } finally { clearTimeout(timer); }
  }

  function jobPath(id) {
    if (typeof id !== 'string' || !uuid.test(id)) fail('invalid_request');
    return `/v1/documents/${id}`;
  }
  function pageQuery(page, key) {
    if (!isObject(page) || Object.keys(page).some(k => ![key, 'limit'].includes(k))) fail('invalid_request');
    const params = new URLSearchParams();
    if (page.limit !== undefined) {
      if (!positive(page.limit) || page.limit > 100) fail('invalid_request');
      params.set('limit', page.limit);
    }
    if (page[key] !== undefined) {
      if (!positive(page[key])) fail('invalid_request');
      params.set(key, page[key]);
    }
    return params.size ? '?' + params : '';
  }
  const client = {
    async submit({ requestId, document }) {
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId) || !isObject(document) ||
          Object.keys(document).sort().join(',') !== 'paragraphs,title' || typeof document.title !== 'string' ||
          !document.title.trim() || [...document.title].length > 160 || !Array.isArray(document.paragraphs) ||
          document.paragraphs.length < 1 || document.paragraphs.length > 20 ||
          [document.title, ...document.paragraphs].some(t => typeof t !== 'string' || !t.length || [...t].length > 4000 || /[\x00-\x08\x0b-\x1f]/.test(t))) fail('invalid_request');
      // Match the Python server's canonical-size limit conservatively (spacing overhead included).
      if (Buffer.byteLength(JSON.stringify(document)) + 100 > 40000) fail('request_too_large');
      return check(await request('POST', '/v1/documents', { requestId, document }), v => keys(v, ['id']) && uuid.test(v.id));
    },
    async list(page = {}) {
      const value = await request('GET', '/v1/documents' + pageQuery(page, 'before'));
      return check(value, v => keys(v, ['jobs', 'next']) && Array.isArray(v.jobs) && v.jobs.length <= (page.limit ?? 25) && cursor(v.next) &&
        v.jobs.every(j => keys(j, ['id', 'status', 'day', 'draft']) && record(j) && j.draft === true && typeof j.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.day)));
    },
    async status(id) {
      return check(await request('GET', jobPath(id)), v => keys(v, ['id', 'status', 'draft', 'sha256']) && record(v) && v.id === id && v.draft === true &&
        (v.status === 'completed' ? hash(v.sha256) : v.sha256 === null));
    },
    async history(id, page = {}) {
      return check(await request('GET', jobPath(id) + '/history' + pageQuery(page, 'after')),
        v => keys(v, ['events', 'next']) && Array.isArray(v.events) && v.events.length <= (page.limit ?? 25) && cursor(v.next) &&
          v.events.every((e, index) => keys(e, ['id', 'event', 'at']) && positive(e.id) && e.id > (index ? v.events[index - 1].id : page.after ?? 0) &&
            states.has(e.event) && typeof e.at === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.at)) &&
          (v.next === null || (v.events.length > 0 && v.next === v.events.at(-1).id)));
    },
    async remove(id) {
      return check(await request('DELETE', jobPath(id)), v => keys(v, ['id', 'status']) && v.id === id && v.status === 'deleted');
    },
    async download(id) {
      const status = await client.status(id);
      if (status.status !== 'completed') fail('not_ready');
      const bytes = await request('GET', jobPath(id) + '/artifact', undefined, true);
      if (createHash('sha256').update(bytes).digest('hex') !== status.sha256) fail('integrity_mismatch');
      return bytes;
    },
  };
  return Object.freeze(client);
}
