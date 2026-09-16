/** Server-only client for the recovered Omniqora AI pilot API.
 * Authentication and organisation/product selection remain the calling SaaS's responsibility.
 * This client performs no automatic retries and never executes task text.
 */
export class OmniqoraApiError extends Error {
  constructor(status) {
    super(`Omniqora request failed (${status}).`);
    this.name = 'OmniqoraApiError';
    this.status = status;
  }
}

const text = (value, max, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`Invalid ${name}.`);
  }
  return value;
};

export class OmniqoraClient {
  #base;
  #key;
  #fetch;

  constructor({ baseUrl, productKey, fetchImpl = globalThis.fetch }) {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      throw new Error('OmniqoraClient must run on your server.');
    }
    const url = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.search || url.hash) {
      throw new TypeError('Use a trusted HTTPS service URL; HTTP is allowed on loopback.');
    }
    if (typeof productKey !== 'string' || productKey.length < 32 || /\s/.test(productKey)) {
      throw new TypeError('A server-only product credential is required.');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is required.');
    this.#base = url.href.replace(/\/$/, '');
    this.#key = productKey;
    this.#fetch = fetchImpl;
  }

  async #request(path, { method = 'GET', body, eventId } = {}) {
    const headers = { Authorization: `Bearer ${this.#key}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (eventId !== undefined) {
      headers['idempotency-key'] = eventId;
      headers['x-event-timestamp'] = String(Date.now());
    }
    const response = await this.#fetch(this.#base + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new OmniqoraApiError(response.status);
    const result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Invalid Omniqora response.');
    }
    return result;
  }

  async queueRun({ eventId, title, input }) {
    text(eventId, 80, 'stable event ID');
    if (!/^[\x21-\x7E]+$/.test(eventId)) throw new TypeError('Event ID must be printable ASCII without spaces.');
    text(title, 150, 'title');
    text(input, 20000, 'input');
    const result = await this.#request('/api/integrations/events', {
      method: 'POST', eventId, body: { title, input },
    });
    text(result.runId, 200, 'run response ID');
    text(result.status, 100, 'run response status');
    return { runId: result.runId, status: result.status };
  }

  async listApprovedTasks() {
    const result = await this.#request('/api/integrations/tasks');
    if (!Array.isArray(result.tasks) || result.tasks.some(task => !task ||
        typeof task.id !== 'string' || !task.id || typeof task.title !== 'string' ||
        typeof task.body !== 'string' || task.status !== 'open')) {
      throw new Error('Invalid Omniqora task response.');
    }
    return result.tasks;
  }

  /** Call only after the source SaaS has durably completed the corresponding internal task. */
  async acknowledgeCompletedTask(taskId) {
    text(taskId, 200, 'task ID');
    const result = await this.#request('/api/integrations/tasks', {
      method: 'POST', body: { id: taskId, status: 'completed' },
    });
    if (result.ok !== true) throw new Error('Invalid Omniqora completion receipt.');
    return { ok: true };
  }
}
