"""Operator-only, single-pass Linux worker entry point. Never starts a scheduler."""
import argparse
import fcntl
import importlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
from contextlib import contextmanager
from worker import WorkerPassError, run_once, validate_scopes

LIMIT = 16000


class WorkerBusy(Exception):
    pass


def private_file(path, *, create=False):
    """No symlinks, FIFOs, shared permissions or another user's file."""
    flags = os.O_RDWR if create else os.O_RDONLY
    flags |= os.O_NOFOLLOW | os.O_NONBLOCK
    if create:
        flags |= os.O_CREAT
    fd = os.open(path, flags, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError('Private regular file required')
        return fd
    except Exception:
        os.close(fd)
        raise


def absolute_path(value):
    if not isinstance(value, str) or not value or not Path(value).is_absolute() or '..' in Path(value).parts:
        raise ValueError('Absolute operator path required')
    return value


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate configuration key')
        result[key] = value
    return result


def load_config(path):
    path = absolute_path(path)
    fd = private_file(path)
    with os.fdopen(fd, 'rb') as stream:
        raw = stream.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError('Configuration too large')
    value = json.loads(raw, object_pairs_hook=unique_object)
    if not isinstance(value, dict) or set(value) != {'enabled', 'factory', 'scopes', 'stopFile', 'lockFile'}:
        raise ValueError('Invalid worker configuration')
    if type(value['enabled']) is not bool or not isinstance(value['factory'], str) or not re.fullmatch(
            r'[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*:[a-zA-Z_]\w*', value['factory']):
        raise ValueError('Invalid activation or factory')
    value['scopes'] = validate_scopes(value['scopes'])
    for key in ('stopFile', 'lockFile'):
        absolute_path(value[key])
    if len({os.path.normpath(p) for p in (path, value['stopFile'], value['lockFile'])}) != 3:
        raise ValueError('Configuration, stop and lock paths must differ')
    return value


@contextmanager
def pass_lock(path):
    # Never unlink this file: other processes must contend on the same inode.
    fd = private_file(path, create=True)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise WorkerBusy() from None
        yield
    finally:
        os.close(fd)


def load_factory(reference):
    module, name = reference.split(':')
    factory = getattr(importlib.import_module(module), name)
    if not callable(factory):
        raise ValueError('Callable factory required')
    return factory


def stopped(path):
    try:
        os.lstat(path)  # Even a broken symlink is a stop instruction.
        return True
    except FileNotFoundError:
        return False
    # Permission/IO errors propagate and fail closed.


def execute(config, *, stop_requested=lambda: False, factory_loader=load_factory):
    if config['enabled'] is not True:
        return 2, {'status': 'disabled', 'results': []}
    stopping = lambda: stop_requested() is not False or stopped(config['stopFile'])
    try:
        if stopping():
            return 4, {'status': 'stopped', 'results': []}
        with pass_lock(config['lockFile']):
            if stopping():
                return 4, {'status': 'stopped', 'results': []}
            factory = factory_loader(config['factory'])
            results = run_once(service_factory=factory, approved_scopes=config['scopes'],
                               enabled=True, should_stop=stopping)
            if any(r['outcome'] not in ('completed', 'idle') for r in results):
                return 3, {'status': 'needs_review', 'results': results}
            if len(results) != len(config['scopes']):
                return 4, {'status': 'stopped', 'results': results}
            return 0, {'status': 'completed', 'results': results}
    except WorkerPassError as error:
        return 1, {'status': 'stop_check_failed', 'results': error.results}
    except WorkerBusy:
        return 5, {'status': 'busy', 'results': []}
    except Exception:
        # No file paths, factory errors, tokens or document content in receipts.
        return 1, {'status': 'unavailable', 'results': []}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Validate or run one approved document-worker pass.')
    parser.add_argument('--config', required=True, help='Absolute path to a private operator JSON file')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='Validate configuration only; no imports or service calls')
    mode.add_argument('--run', action='store_true', help='Run at most one job per configured scope')
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
    except Exception:
        print(json.dumps({'status': 'invalid_configuration', 'results': []}))
        return 2
    if args.check:
        print(json.dumps({'status': 'configuration_valid', 'enabled': config['enabled'],
                          'scopeCount': len(config['scopes']), 'runtimeVerified': False}))
        return 0
    requested = False
    def request_stop(_signum, _frame):
        nonlocal requested
        requested = True
    previous = {s: signal.signal(s, request_stop) for s in (signal.SIGINT, signal.SIGTERM)}
    try:
        code, receipt = execute(config, stop_requested=lambda: requested)
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)
    print(json.dumps(receipt, separators=(',', ':')))
    return code


if __name__ == '__main__':
    sys.exit(main())
