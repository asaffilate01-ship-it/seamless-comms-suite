"""Disposable PostgreSQL checks. Never reads a production DSN or credentials.
Install pgserver==0.1.4 and psycopg[binary]>=3.2,<4. Run from the repo root.
"""
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pgserver
import psycopg

ROOT = Path(__file__).resolve().parents[1]
TENANT = '11111111-1111-4111-8111-111111111111'
OTHER = '33333333-3333-4333-8333-333333333333'
USER = '22222222-2222-4222-8222-222222222222'
OTHER_USER = '44444444-4444-4444-8444-444444444444'


class PowerBiDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.server = pgserver.get_server(Path(cls.tmp.name) / 'data', cleanup_mode='delete')
        cls.uri = cls.server.get_uri()
        with psycopg.connect(cls.uri, autocommit=True) as db:
            # Minimal existing Supabase authority contract. The pilot must not replace it.
            db.execute("""
              create role anon nologin nosuperuser nobypassrls;
              create role authenticated nologin nosuperuser nobypassrls;
              create role service_role nologin nosuperuser bypassrls;
              create schema auth;
              create table auth.users(id uuid primary key);
              create table public.tenants(id uuid primary key);
              create table public.tenant_members(tenant_id uuid, user_id uuid, role text);
              create table public.test_entitlements(tenant_id uuid, service_key text);
              create function auth.uid() returns uuid language sql stable as
                $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
              create function public.has_tenant_entitlement(_tenant uuid,_service text) returns boolean language sql stable as
                $$select exists(select 1 from public.test_entitlements where tenant_id=_tenant and service_key=_service)$$;
              grant usage on schema auth,public to authenticated,anon,service_role;
              grant select on public.tenant_members,public.test_entitlements to authenticated;
            """)
            db.execute((ROOT / 'supabase/migrations/20261005113000_powerbi_readonly_pilot.sql').read_text())
            db.execute('insert into auth.users values(%s),(%s)', (USER, OTHER_USER))
            db.execute('insert into public.tenants values(%s),(%s)', (TENANT, OTHER))
            db.execute("insert into public.tenant_members values(%s,%s,'viewer'),(%s,%s,'viewer')", (TENANT, USER, OTHER, USER))
            db.execute("insert into public.test_entitlements values(%s,'omniqora.bi'),(%s,'omniqora.bi')", (TENANT, OTHER))

    @classmethod
    def tearDownClass(cls):
        cls.server.cleanup()
        cls.tmp.cleanup()

    def setUp(self):
        with psycopg.connect(self.uri, autocommit=True) as db:
            db.execute('truncate public.bi_powerbi_oauth_states, public.bi_powerbi_connections, public.bi_powerbi_runs cascade')

    def connect(self, role='service_role', user=USER):
        db = psycopg.connect(self.uri, autocommit=True)
        db.execute(f'set role {role}')  # Constant test role, never an external parameter.
        db.execute("select set_config('request.jwt.claim.sub',%s,false)", (user,))
        return db

    def reserve(self, tenant=TENANT, user=USER):
        with self.connect() as db:
            return db.execute("select public.bi_powerbi_reserve_run(%s,%s,'investigate','sales',null)", (tenant, user)).fetchone()[0]

    def test_migration_enables_and_forces_rls(self):
        with psycopg.connect(self.uri) as db:
            flags = db.execute("select relrowsecurity,relforcerowsecurity from pg_class where relname in ('bi_powerbi_connections','bi_powerbi_oauth_states','bi_powerbi_runs') and relkind='r'").fetchall()
            self.assertEqual(len(flags), 3)
            self.assertTrue(all(a and b for a, b in flags))

    def test_tokens_and_states_are_inaccessible_to_users_and_anonymous(self):
        for role in ('authenticated', 'anon'):
            for table in ('bi_powerbi_connections', 'bi_powerbi_oauth_states'):
                with self.connect(role) as db, self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    db.execute(f'select * from public.{table}')

    def test_run_visibility_is_tenant_and_user_scoped(self):
        own = self.reserve()
        self.reserve(TENANT, OTHER_USER)
        self.reserve(OTHER, OTHER_USER)
        with self.connect('authenticated') as db:
            visible = db.execute('select id from public.bi_powerbi_runs').fetchall()
            self.assertEqual(visible, [(own,)])

    def test_membership_revocation_hides_previous_run_metadata(self):
        self.reserve()
        with psycopg.connect(self.uri, autocommit=True) as admin:
            admin.execute('delete from public.tenant_members where tenant_id=%s and user_id=%s', (TENANT, USER))
            try:
                with self.connect('authenticated') as db:
                    self.assertEqual(db.execute('select id from public.bi_powerbi_runs').fetchall(), [])
            finally:
                admin.execute("insert into public.tenant_members values(%s,%s,'viewer')", (TENANT, USER))

    def test_entitlement_revocation_hides_previous_run_metadata(self):
        self.reserve()
        with psycopg.connect(self.uri, autocommit=True) as admin:
            admin.execute('delete from public.test_entitlements where tenant_id=%s', (TENANT,))
            try:
                with self.connect('authenticated') as db:
                    self.assertEqual(db.execute('select id from public.bi_powerbi_runs').fetchall(), [])
            finally:
                admin.execute("insert into public.test_entitlements values(%s,'omniqora.bi')", (TENANT,))

    def test_clients_cannot_forge_audit_or_call_privileged_reservation(self):
        own = self.reserve()
        for statement, args in [
            ("update public.bi_powerbi_runs set status='completed' where id=%s", (own,)),
            ("delete from public.bi_powerbi_runs where id=%s", (own,)),
            ("select public.bi_powerbi_reserve_run(%s,%s,'investigate',null,null)", (TENANT, USER)),
        ]:
            with self.connect('authenticated') as db, self.assertRaises(psycopg.errors.InsufficientPrivilege):
                db.execute(statement, args)

    def test_rate_limit_is_atomic_across_connections(self):
        def attempt(_):
            try:
                self.reserve()
                return 'ok'
            except psycopg.errors.RaiseException as error:
                self.assertIn('BI_RATE_LIMITED', str(error))
                return 'limited'
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(28)))
        self.assertEqual(results.count('ok'), 20)
        self.assertEqual(results.count('limited'), 8)
        self.assertIsNotNone(self.reserve(OTHER, USER))

    def test_oauth_state_is_single_use_and_bound_to_user(self):
        run_id, generation = self.reserve(), uuid.uuid4()
        with self.connect() as db:
            db.execute("""insert into public.bi_powerbi_oauth_states(state_hash,tenant_id,user_id,generation,config_revision,run_id,verifier_encrypted,expires_at)
              values(%s,%s,%s,%s,%s,%s,'encrypted-fixture',now()+interval '5 minutes')""", ('a'*64,TENANT,USER,generation,'b'*64,run_id))
            sql = 'delete from public.bi_powerbi_oauth_states where state_hash=%s and user_id=%s and expires_at>now() returning generation'
            self.assertEqual(db.execute(sql, ('a'*64,OTHER_USER)).fetchall(), [])
            self.assertEqual(db.execute(sql, ('a'*64,USER)).fetchall(), [(generation,)])
            self.assertEqual(db.execute(sql, ('a'*64,USER)).fetchall(), [])

    def test_generation_fence_prevents_late_callback_after_disconnect(self):
        generation = uuid.uuid4()
        with self.connect() as db:
            db.execute("insert into public.bi_powerbi_connections(tenant_id,user_id,generation,config_revision) values(%s,%s,%s,%s)", (TENANT,USER,generation,'b'*64))
            db.execute('delete from public.bi_powerbi_connections where tenant_id=%s and user_id=%s', (TENANT,USER))
            result = db.execute("update public.bi_powerbi_connections set token_encrypted='fixture',expires_at=now()+interval '1 hour' where tenant_id=%s and user_id=%s and generation=%s returning generation", (TENANT,USER,generation)).fetchall()
            self.assertEqual(result, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
