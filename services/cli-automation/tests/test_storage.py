import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from automation import Service
from storage import connect_private_database
from test_automation import Backend


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.path = self.root / 'jobs.db'
    def tearDown(self):
        self.tmp.cleanup()
    def connect(self, path=None):
        return connect_private_database(path or self.path)
    def private(self, path, text=''):
        path.write_text(text); path.chmod(0o600)

    def test_new_database_is_private_and_existing_data_survives(self):
        db = self.connect()
        db.execute('CREATE TABLE evidence(value TEXT)')
        db.execute("INSERT INTO evidence VALUES('synthetic')"); db.close()
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        db = self.connect()
        try: self.assertEqual(db.execute('SELECT value FROM evidence').fetchone()[0], 'synthetic')
        finally: db.close()

    def test_relative_paths_are_rejected_without_creating_files(self):
        with self.assertRaises(ValueError): self.connect(Path('relative-document-test.db'))
        self.assertFalse(Path('relative-document-test.db').exists())
        with self.assertRaises(ValueError): self.connect(self.root / '..' / 'unsafe.db')

    def test_symlink_does_not_touch_target_or_its_permissions(self):
        target = self.root / 'target'; target.write_text('sentinel'); target.chmod(0o644)
        self.path.symlink_to(target)
        with self.assertRaises(ValueError): self.connect()
        self.assertEqual(target.read_text(), 'sentinel'); self.assertEqual(target.stat().st_mode & 0o777, 0o644)

    def test_hardlink_does_not_change_target(self):
        target = self.root / 'target'; self.private(target, 'sentinel'); os.link(target, self.path)
        with self.assertRaises(ValueError): self.connect()
        self.assertEqual(target.read_text(), 'sentinel')

    def test_fifo_and_directory_are_rejected_without_blocking(self):
        os.mkfifo(self.path, 0o600)
        with self.assertRaises(ValueError): self.connect()
        self.path.unlink(); self.path.mkdir()
        with self.assertRaises(ValueError): self.connect()

    def test_public_database_is_rejected_without_chmod(self):
        self.private(self.path, 'sentinel'); self.path.chmod(0o644)
        with self.assertRaises(ValueError): self.connect()
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o644)
        self.assertEqual(self.path.read_text(), 'sentinel')

    def test_shared_or_symlink_parent_is_rejected(self):
        self.root.chmod(0o777)
        with self.assertRaises(ValueError): self.connect()
        self.assertFalse(self.path.exists()); self.root.chmod(0o700)
        link = self.root / 'linked-directory'; link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError): self.connect(link / 'jobs.db')
        self.assertFalse(self.path.exists())

    def test_wrong_file_or_directory_owner_is_rejected(self):
        # Simulate the process account differing from the actual directory owner.
        with patch('storage.os.geteuid', return_value=os.geteuid() + 1):
            with self.assertRaises(ValueError): self.connect()
        self.assertFalse(self.path.exists())

    def test_unsafe_sidecars_are_rejected_and_preserved(self):
        for suffix in ('-journal', '-wal', '-shm'):
            side = Path(str(self.path) + suffix)
            target = self.root / 'target'; self.private(target, 'sentinel')
            side.symlink_to(target)
            with self.assertRaises(ValueError): self.connect()
            self.assertEqual(target.read_text(), 'sentinel'); side.unlink()
            self.private(side, 'sentinel'); side.chmod(0o644)
            with self.assertRaises(ValueError): self.connect()
            self.assertEqual(side.read_text(), 'sentinel'); side.unlink()

    def test_uri_sensitive_filename_is_not_treated_as_sqlite_options(self):
        path = self.root / 'jobs?mode=memory#draft ü.db'
        db = self.connect(path); db.execute('CREATE TABLE evidence(value)'); db.close()
        self.assertTrue(path.exists())
        db = self.connect(path)
        try: self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE name='evidence'").fetchone()[0], 'evidence')
        finally: db.close()

    def test_connect_failure_closes_file_descriptors_and_redacts_error(self):
        before = len(os.listdir('/proc/self/fd'))
        with patch('storage.sqlite3.connect', side_effect=RuntimeError('secret-path')):
            for _ in range(10):
                with self.assertRaisesRegex(ValueError, '^Document storage unavailable or unsafe$'): self.connect()
        self.assertEqual(len(os.listdir('/proc/self/fd')), before)

    def test_changed_inode_after_connect_closes_connection_before_setup(self):
        real_connect = sqlite3.connect
        opened = []
        def replaced(*args, **kwargs):
            connection = real_connect(*args, **kwargs); opened.append(connection)
            self.path.rename(self.root / 'old.db'); self.private(self.path)
            return connection
        with patch('storage.sqlite3.connect', side_effect=replaced):
            with self.assertRaises(ValueError): self.connect()
        with self.assertRaises(sqlite3.ProgrammingError): opened[0].execute('SELECT 1')
        self.assertEqual(self.path.read_bytes(), b'')

    def test_initialization_failure_closes_connection(self):
        connection = self.connect()
        connection.execute('CREATE TABLE jobs(unexpected TEXT)'); connection.close()
        connection = self.connect()
        with patch('automation.connect_private_database', return_value=connection):
            with self.assertRaises(sqlite3.OperationalError):
                Service(self.path, authorise=lambda *_: True, backend=Backend())
        with self.assertRaises(sqlite3.ProgrammingError): connection.execute('SELECT 1')
        reopened = self.connect()
        try: self.assertIsNone(reopened.execute("SELECT name FROM sqlite_master WHERE name='audit'").fetchone())
        finally: reopened.close()


if __name__ == '__main__': unittest.main()
