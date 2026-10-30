"""Explicit one-pass worker for operator-approved scopes; no daemon or public route."""
from automation import WorkerJobError, identifier, portfolio


def run_once(*, service_factory, approved_scopes, enabled=False, should_stop=None):
    """One job per exact scope, at most ten scopes. Never enumerates customer identities.

    Host configuration owns the allowlist and worker identity. The service authoriser
    must independently check current worker permission AND source actor permissions.
    A fresh connection is created for each scope and always closed. Host must isolate
    the CLI process and enforce overall resource/process limits.
    """
    if enabled is not True:
        raise PermissionError('Document worker is disabled')
    if not callable(service_factory) or (should_stop is not None and not callable(should_stop)):
        raise ValueError('Explicit service factory required')
    scopes = validate_scopes(approved_scopes)
    results=[]
    for scope in scopes:
        # Stop is checked between jobs. Callback failure stops the pass, never proceeds.
        if should_stop is not None:
            try:
                stopping = should_stop()
            except Exception:
                raise RuntimeError('Worker stop check unavailable') from None
            if stopping is not False:
                break
        service=None
        result={'scope':dict(scope),'outcome':'unavailable','jobId':None}
        try:
            service=service_factory()
            receipt=service.run_next(scope)
            if receipt is None:
                result['outcome']='idle'
            else:
                result.update(outcome='completed',jobId=receipt['id'])
        except WorkerJobError as error:
            result.update(outcome='needs_review',jobId=error.job_id)
        except PermissionError:
            result['outcome']='blocked'
        except Exception:
            # A storage/auth outage cannot be converted into a successful or failed job.
            result['outcome']='unavailable'
        finally:
            if service is not None:
                try: service.close()
                except Exception: result['outcome']='needs_review'
        results.append(result)
    return results


def validate_scopes(approved_scopes):
    """Validate and copy an explicit allowlist without opening a service connection."""
    if not isinstance(approved_scopes, (list, tuple)) or not 1 <= len(approved_scopes) <= 10:
        raise ValueError('Expected 1–10 explicit scopes')
    scopes=[];seen=set();products=portfolio()
    # Validate the whole operator configuration before performing any work.
    for scope in approved_scopes:
        if not isinstance(scope, dict) or set(scope) != {'tenant','product','actor'}:
            raise ValueError('Invalid worker scope')
        for value in scope.values(): identifier(value)
        if scope['product'] not in products:
            raise ValueError('Unknown product')
        key=(scope['tenant'],scope['product'],scope['actor'])
        if key in seen: raise ValueError('Duplicate worker scope')
        seen.add(key);scopes.append(dict(scope))
    return scopes
