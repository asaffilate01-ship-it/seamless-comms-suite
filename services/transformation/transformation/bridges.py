"""Tenant/project/creator isolated receipts and source-context-only AI drafts.
No source callbacks or external tool execution. A failed model call is never retried implicitly.
"""
import hashlib
import json
import uuid
from knowledge_core.types import APIError, fields, identifier, integer
from .ai_hub import encode, now, WRITERS
from .bridge_contracts import CONTRACTS, prepare, validate_result

SCHEMA = '''CREATE TABLE IF NOT EXISTS bridge_jobs(
 tenant TEXT NOT NULL,project TEXT NOT NULL,connection TEXT NOT NULL,id TEXT NOT NULL,creator TEXT NOT NULL,
 product TEXT NOT NULL,contract TEXT NOT NULL,profile TEXT NOT NULL,request_hash TEXT NOT NULL,
 scope TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,
 lease TEXT,result TEXT,error TEXT,PRIMARY KEY(tenant,project,connection,id),
 FOREIGN KEY(tenant,project) REFERENCES projects(tenant,id));'''


class Bridges:
    def __init__(self, engine):
        self.e = engine
        if not engine.postgres:
            with engine.connection() as db: db.executescript(SCHEMA)

    def row(self, db, actor, project, data):
        connection, rid = identifier(data['connection'], 'connection'), identifier(data['id'], 'id')
        self.e._access(db, actor, project, WRITERS)
        row = db.execute('SELECT * FROM bridge_jobs WHERE tenant=? AND project=? AND connection=? AND id=? AND creator=?',
                         (actor.tenant, project, connection, rid, actor.user)).fetchone()
        if not row: raise APIError(404, 'Bridge request not found')
        return dict(row)

    def get(self, actor, project, data):
        fields(data, {'connection','id'}, {'connection','id'})
        with self.e.connection() as db: row = self.row(db, actor, project, data)
        return {'runId': row['id'], 'status': row['status'], 'reviewRequired': True,
                'scope': json.loads(row['scope']), 'result': json.loads(row['result']) if row['result'] else None,
                'error': row['error'], 'created': row['created']}

    def submit(self, actor, project, data):
        required = {'connection','id','product','contract','profile','scope','payload','daily_limit'}
        fields(data, required, required)
        for key in ('connection','id','product','profile'): identifier(data[key], key)
        if data['contract'] not in CONTRACTS: raise APIError(422, 'Unknown bridge contract')
        if not isinstance(data['scope'], dict) or not isinstance(data['payload'], dict): raise APIError(422, 'Invalid source input')
        integer(data['daily_limit'], 'daily_limit', 1, 1000)
        raw = encode({k:v for k,v in data.items() if k != 'daily_limit'})
        if len(raw.encode()) > 262144: raise APIError(413, 'Source context exceeds 256 KiB')
        digest = hashlib.sha256(raw.encode()).hexdigest()
        with self.e.connection() as db:
            p = self.e._access(db, actor, project, WRITERS)
            if p['paused']: raise APIError(409, 'Project is paused')
            existing = db.execute('SELECT request_hash,creator FROM bridge_jobs WHERE tenant=? AND project=? AND connection=? AND id=?',
                                  (actor.tenant,project,data['connection'],data['id'])).fetchone()
            if existing:
                if existing['creator'] != actor.user or existing['request_hash'] != digest: raise APIError(409, 'Idempotency key already used with different input')
            else:
                used = db.execute('SELECT COUNT(*) FROM bridge_jobs WHERE tenant=? AND project=? AND connection=? AND created>=?',
                                  (actor.tenant,project,data['connection'],now()[:10])).fetchone()[0]
                if used >= data['daily_limit']: raise APIError(429, 'Connection daily request limit reached')
                stamp = now()
                db.execute('INSERT INTO bridge_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           (actor.tenant,project,data['connection'],data['id'],actor.user,data['product'],data['contract'],data['profile'],digest,
                            encode(data['scope']),encode(data['payload']),'received',stamp,stamp,None,None,None))
                self.e._audit(db,actor,project,'bridge.received',{'connection':data['connection'],'id':data['id'],'product':data['product'],'contract':data['contract']})
        return self.get(actor,project,{'connection':data['connection'],'id':data['id']})

    def process(self, actor, project, data):
        fields(data, {'connection','id','context'}, {'connection','id'})
        lease = str(uuid.uuid4())
        with self.e.connection() as db:
            row = self.row(db,actor,project,data)
            if row['status'] == 'draft':
                if row['contract'] == 'lawquo_assessment' and encode(data.get('context')) != row['payload']:
                    raise APIError(409, 'Case evidence changed; use a new context revision and request')
                return self._result(row)
            if row['status'] != 'received': raise APIError(409, 'Request is in progress or failed; inspect before creating a new request')
            payload, scope = json.loads(row['payload']), json.loads(row['scope'])
            if row['contract'] == 'event': raise APIError(409, 'Event receipt requires source-authorised context in a new draft request')
            if row['contract'] == 'lawquo_assessment':
                payload = data.get('context')
                if payload is None: raise APIError(409, 'Awaiting authorised case evidence')
            elif 'context' in data: raise APIError(422, 'Context cannot replace the original request')
            prompt, context, sources = prepare(row['contract'],payload,scope)
            if len(encode(context)) > 60000: raise APIError(413, 'Narrow the source evidence to 60,000 characters')
            p, policy, revision = self.e.ai._guard(db,actor,project)
            if p['project_role'] == 'finance' and row['profile'] != 'finance': raise APIError(403, 'Finance role only')
            model = self.e.ai._entry('models',policy['routes'].get(row['profile']),actor,project)
            version, config_digest = p['data_version'], self.e.ai.config_digest
            day = self.e.ai._reserve(db,actor,project,policy,'model')
            db.execute("UPDATE bridge_jobs SET status='processing',lease=?,updated=?,payload=? WHERE tenant=? AND project=? AND connection=? AND id=? AND creator=?",
                       (lease,now(),encode(payload),actor.tenant,project,row['connection'],row['id'],actor.user))
        try:
            raw, usage = self.e.ai.model_factory(model).decide(prompt,context,policy['max_output_tokens'])
            result = validate_result(row['contract'],raw,scope,sources)
            with self.e.connection() as db:
                current = self.row(db,actor,project,data)
                p2, _, revision2 = self.e.ai._guard(db,actor,project)
                if current['lease'] != lease or current['status'] != 'processing' or p2['data_version'] != version or revision2 != revision or self.e.ai.config_digest != config_digest:
                    raise APIError(409, 'Access, inputs or policy changed during generation')
                db.execute("UPDATE bridge_jobs SET status='draft',result=?,lease=NULL,updated=? WHERE tenant=? AND project=? AND connection=? AND id=? AND creator=?",
                           (encode(result),now(),actor.tenant,project,row['connection'],row['id'],actor.user))
                db.execute('UPDATE ai_usage SET input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE tenant=? AND project=? AND day=?',
                           (usage.get('input_tokens') or 0,usage.get('output_tokens') or 0,actor.tenant,project,day))
                self.e._audit(db,actor,project,'bridge.draft.prepared',{'connection':row['connection'],'id':row['id'],'review_required':True})
        except Exception:
            # Sanitised diagnostic; legal narratives, customer records and provider output stay private.
            with self.e.connection() as db:
                db.execute("UPDATE bridge_jobs SET status='failed',error='Generation failed or access changed',lease=NULL,updated=? WHERE tenant=? AND project=? AND connection=? AND id=? AND creator=? AND lease=?",
                           (now(),actor.tenant,project,row['connection'],row['id'],actor.user,lease))
            raise
        return self.get(actor,project,{'connection':row['connection'],'id':row['id']})

    @staticmethod
    def _result(row):
        return {'runId':row['id'],'status':'draft','reviewRequired':True,'scope':json.loads(row['scope']),'result':json.loads(row['result'])}
