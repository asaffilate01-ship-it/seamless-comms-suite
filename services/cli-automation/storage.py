"""Private single-host SQLite files. Parent ancestry must be operator-controlled."""
import os
from pathlib import Path
import sqlite3
import stat


def _private(info):
    return (stat.S_ISREG(info.st_mode) and info.st_nlink == 1
            and info.st_uid == os.geteuid() and not info.st_mode & 0o077)


def connect_private_database(database):
    """Reject unsafe files without chmod; never create a replacement through SQLite.

    SQLite opens a pathname, so the parent must be owned by this dedicated account
    and not writable by another account. This is not a sandbox against processes
    running as that same account or against an administrator changing parent ancestry.
    """
    path = Path(database)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('Absolute private database path required')
    parent_fd = file_fd = None
    connection = None
    try:
        parent_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        parent = os.fstat(parent_fd)
        if parent.st_uid != os.geteuid() or parent.st_mode & 0o022:
            raise ValueError('Protected database directory required')
        file_fd = os.open(path.name, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK,
                          0o600, dir_fd=parent_fd)
        original = os.fstat(file_fd)
        if not _private(original):
            raise ValueError('Private single-link database required')
        # Existing SQLite sidecars must obey the same boundary. Never chmod or remove them.
        for suffix in ('-journal', '-wal', '-shm'):
            try:
                side_fd = os.open(path.name + suffix, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                  dir_fd=parent_fd)
            except FileNotFoundError:
                continue
            try:
                if not _private(os.fstat(side_fd)):
                    raise ValueError('Private SQLite sidecar required')
            finally:
                os.close(side_fd)

        def unchanged():
            current_parent = os.stat(path.parent, follow_symlinks=False)
            current = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
            return (current_parent.st_dev, current_parent.st_ino) == (parent.st_dev, parent.st_ino) and (
                current.st_dev, current.st_ino) == (original.st_dev, original.st_ino) and _private(current)

        if not unchanged():
            raise ValueError('Database path changed')
        # as_uri escapes ?, # and non-ASCII names. mode=rw refuses implicit recreation.
        connection = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True,
                                     isolation_level=None, timeout=10)
        if not unchanged():
            raise ValueError('Database path changed')
        return connection
    except Exception:
        if connection is not None:
            connection.close()
        raise ValueError('Document storage unavailable or unsafe') from None
    finally:
        if file_fd is not None:
            os.close(file_fd)
        if parent_fd is not None:
            os.close(parent_fd)
