"""Framework-neutral HTTP adapter. Mount behind a TLS host; no listener or JWT issuer.

verify_bearer(token) must authenticate with the source product and return a fresh,
server-derived {tenant,product,actor}. Service.authorise independently checks each
operation. Never use decoded but unverified JWT claims. Never accept cookie auth.
"""
import json
import re
from urllib.parse import urlsplit, parse_qs


class ProductAPI:
    def __init__(self, *, service, verify_bearer):
        if not callable(verify_bearer):
            raise ValueError('A real bearer verifier is required')
        self.service = service
        self.verify_bearer = verify_bearer

    def handle(self, method, path, headers, body=b''):
        """Headers must be lower-case; host rejects duplicate auth/content-length headers.

        Body must be buffered with a 64 KB host limit before invoking this adapter.
        No CORS headers are supplied; call through the product's backend.
        """
        standard = {'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'}
        def response(status, data, *, binary=False):
            result_headers = {**standard, 'content-type': 'application/vnd.oasis.opendocument.text' if binary else 'application/json'}
            if binary:
                result_headers['content-disposition'] = 'attachment; filename="draft.odt"'
            return status, result_headers, data if binary else json.dumps(data).encode()
        token = headers.get('authorization', '')
        if not isinstance(token, str) or not re.fullmatch(r'Bearer [A-Za-z0-9._~+/=-]{1,8192}', token):
            return response(401, {'error': 'Authentication required'})
        try:
            scope = self.verify_bearer(token[7:])
            if not isinstance(scope, dict) or set(scope) != {'tenant', 'product', 'actor'}:
                raise PermissionError()
            scope = dict(scope)
        except Exception:
            return response(401, {'error': 'Authentication required'})
        if not isinstance(body, bytes) or len(body) > 64000:
            return response(413, {'error': 'Request too large'})
        try:
            url = urlsplit(path)
            if url.scheme or url.netloc or url.fragment:
                raise ValueError()
            query = parse_qs(url.query, keep_blank_values=True, strict_parsing=True, max_num_fields=2)
            if any(len(v) != 1 or not re.fullmatch(r'[0-9]{1,19}', v[0]) for v in query.values()):
                raise ValueError()
            page = {k: int(v[0]) for k, v in query.items()}
            path = url.path
            if query and (method != 'GET' or (path != '/v1/documents' and not path.endswith('/history'))):
                raise ValueError()
            if method == 'POST' and path == '/v1/documents':
                if headers.get('content-type', '').split(';')[0].strip() != 'application/json':
                    return response(415, {'error': 'JSON required'})
                payload = json.loads(body)
                if not isinstance(payload, dict) or set(payload) != {'requestId', 'document'}:
                    raise ValueError()
                job = self.service.submit(scope, payload['requestId'], payload['document'])
                # A replay may already be completed/deleted: never invent a queued state.
                return response(200, {'id': job})
            match = re.fullmatch(r'/v1/documents(?:/([0-9a-f-]{36})(?:/(artifact|history))?)?', path)
            if not match:
                return response(404, {'error': 'Route unavailable'})
            job, suffix = match.groups()
            if body:
                raise ValueError()
            if method == 'GET' and not job:
                if set(page) - {'before', 'limit'}:
                    raise ValueError()
                return response(200, self.service.list_jobs(scope, **page))
            if method == 'GET' and job:
                if suffix == 'artifact':
                    return response(200, self.service.download(scope, job), binary=True)
                if suffix == 'history':
                    if set(page) - {'after', 'limit'}:
                        raise ValueError()
                    return response(200, self.service.history(scope, job, **page))
                return response(200, self.service.status(scope, job))
            if method == 'DELETE' and job and not suffix:
                self.service.delete(scope, job)
                return response(200, {'id': job, 'status': 'deleted'})
            return response(405, {'error': 'Method unavailable'})
        except PermissionError:
            return response(403, {'error': 'Operation unavailable'})
        except (ValueError, TypeError, UnicodeError, RecursionError):
            return response(400, {'error': 'Invalid request or job state'})
        except Exception:
            return response(503, {'error': 'Document service unavailable'})
