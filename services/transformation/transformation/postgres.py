"""PostgreSQL adapter: per-request verified identity and forced database RLS."""
from contextlib import contextmanager
from contextvars import ContextVar
import re
actor_context=ContextVar('business360_actor',default=None)

class Row(dict):
    def __getitem__(self,key): return tuple(self.values())[key] if isinstance(key,int) else super().__getitem__(key)
class Result:
    def __init__(self,cursor): self.cursor=cursor;self.rowcount=cursor.rowcount
    def fetchone(self):
        row=self.cursor.fetchone();return Row(row) if row is not None else None
    def __iter__(self): return (Row(row) for row in self.cursor)
class Connection:
    def __init__(self,db): self.db=db
    def execute(self,sql,args=()):
        sql=sql.replace('ORDER BY rowid DESC','ORDER BY created_order DESC')
        ignore='INSERT OR IGNORE INTO' in sql
        sql=sql.replace('INSERT OR IGNORE INTO','INSERT INTO')
        if ignore: sql+=' ON CONFLICT DO NOTHING'
        # Static application SQL only. User values are passed independently.
        sql=re.sub(r'(?<![\w\"])user(?![\w\"])','"user"',sql)
        sql=sql.replace('INSERT INTO members VALUES','INSERT INTO members(tenant,project,"user",role) VALUES')
        sql=sql.replace('INSERT INTO nonces VALUES','INSERT INTO nonces(id,expires) VALUES')
        return Result(self.db.execute(sql.replace('?','%s'),args))

@contextmanager
def connect(url,actor=None):
    import psycopg
    from psycopg.rows import dict_row
    actor=actor or actor_context.get()
    if actor is None: raise RuntimeError('PostgreSQL operations require a verified actor context')
    with psycopg.connect(url,row_factory=dict_row) as db:
        role=db.execute('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user').fetchone()
        if role['rolsuper'] or role['rolbypassrls']: raise RuntimeError('Use a dedicated non-superuser database login without BYPASSRLS')
        db.execute('SET LOCAL ROLE business360_runtime')
        db.execute('SET LOCAL search_path TO business360,pg_catalog')
        for name,value in [('b360.tenant',actor.tenant),('b360.user',actor.user),('b360.tenant_role',actor.tenant_role)]:
            db.execute('SELECT set_config(%s,%s,true)',(name,value))
        # Serialize changes in one tenant, preserving stale-plan/idempotency semantics.
        db.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(actor.tenant,))
        yield Connection(db)
