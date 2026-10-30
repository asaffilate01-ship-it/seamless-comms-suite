"""Mountable WSGI application; no default credentials, verifier, listener or worker.

Deploy behind TLS with header/body read timeouts and duplicate-header rejection.
WSGI cannot recover duplicate headers that a proxy has already combined/dropped.
"""
import json
import re
from http import HTTPStatus
from product_api import ProductAPI


def create_app(*, service_factory, verify_bearer):
    """Create one Service per request, on its request thread, and always close it."""
    if not callable(service_factory) or not callable(verify_bearer):
        raise ValueError('Explicit service factory and token verifier required')

    def application(environ, start_response):
        def error(code):
            body = json.dumps({'error': HTTPStatus(code).phrase}).encode()
            return code, {'content-type':'application/json', 'cache-control':'private, no-store',
                          'x-content-type-options':'nosniff'}, body
        service = None
        try:
            length = environ.get('CONTENT_LENGTH', '')
            if environ.get('HTTP_TRANSFER_ENCODING'):
                result = error(400)  # Reject ambiguous framing, including CL + TE.
            elif not re.fullmatch(r'[0-9]{1,10}', length or '0'):
                result = error(400)
            elif int(length or '0') > 64000:
                result = error(413)
            elif environ.get('REQUEST_METHOD') == 'POST' and not length:
                result = error(411)
            else:
                size = int(length or '0')
                # Never read to EOF on a keep-alive socket. Host must enforce read deadlines.
                body = environ['wsgi.input'].read(size) if size else b''
                if len(body) != size:
                    result = error(400)
                else:
                    service = service_factory()
                    api = ProductAPI(service=service, verify_bearer=verify_bearer)
                    path = environ.get('PATH_INFO', '')
                    query = environ.get('QUERY_STRING', '')
                    if query:
                        path += '?' + query
                    result = api.handle(environ.get('REQUEST_METHOD', ''), path,
                                        {'authorization':environ.get('HTTP_AUTHORIZATION', ''),
                                         'content-type':environ.get('CONTENT_TYPE', '')}, body)
        except Exception:
            result = error(503)
        finally:
            if service is not None:
                try:
                    service.close()
                except Exception:
                    result = error(503)
        status, headers, data = result
        start_response(f'{status} {HTTPStatus(status).phrase}',
                       [*headers.items(), ('content-length', str(len(data)))])
        return [data]
    return application
