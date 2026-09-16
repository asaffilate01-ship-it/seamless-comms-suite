"""Standalone identity/entitlement host for the shared transformation engine.
Run behind TLS and a production WSGI server for a hosted pilot. CLI users only.
"""
from pathlib import Path
import sys, os, json, sqlite3, hashlib, secrets, hmac, time, mimetypes
from contextlib import contextmanager
from http.cookies import SimpleCookie
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'services/transformation'))
from transformation.engine import Actor
from transformation.server import create_engine
from knowledge_core.types import APIError, fields

PUBLIC=Path(__file__).parent/'public'
class Accounts:
    def __init__(self,path):
        self.path=str(path);Path(path).parent.mkdir(parents=True,exist_ok=True)
        with self.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset INTEGER NOT NULL);''')
    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=15);db.row_factory=sqlite3.Row
        try: yield db;db.commit()
        except BaseException: db.rollback();raise
        finally: db.close()
    @staticmethod
    def digest(password,salt): return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),600000).hex()
    def add_user(self,tenant,email,password,role='member'):
        import uuid
        if role not in {'owner','admin','member','viewer'}: raise ValueError('Invalid tenant role')
        if len(password)<14: raise ValueError('Use a password with at least 14 characters')
        if len(email)>254 or '@' not in email: raise ValueError('Supply a valid email address')
        if not tenant: raise ValueError('Tenant is required')
        salt=secrets.token_hex(16);uid=str(uuid.uuid4())
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO tenants(id) VALUES(?)',(tenant,))
            db.execute('INSERT INTO users(id,tenant,email,password,salt,role) VALUES(?,?,?,?,?,?)',(uid,tenant,email.strip().lower(),self.digest(password,salt),salt,role))
        return uid
    def login(self,email,password,remote):
        now=int(time.time());email=email.strip().lower()
        keys=[hashlib.sha256(('email:'+email).encode()).hexdigest(),hashlib.sha256(('ip:'+remote).encode()).hexdigest()]
        with self.db() as db:
            for key in keys:
                row=db.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
                if row and row['reset']>now and row['count']>=12: raise APIError(429,'Too many attempts. Try again in 15 minutes.')
            for key in keys:
                db.execute('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<=? THEN ? ELSE reset END',(key,now+900,now,now,now+900))
            user=db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
        salt=user['salt'] if user else '00'*16
        valid=hmac.compare_digest(self.digest(password,salt),user['password'] if user else '0'*64)
        if not user or not user['active'] or not valid: raise APIError(401,'Email or password is incorrect')
        token=secrets.token_urlsafe(40);csrf=secrets.token_urlsafe(32)
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE expires<?',(now,))
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],csrf,now+28800))
            db.execute('DELETE FROM attempts WHERE key=?',(keys[0],))
        return token,csrf
    def session(self,token):
        with self.db() as db:
            user=db.execute('SELECT u.id,u.tenant,u.email,u.role,s.csrf,t.enabled FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant WHERE s.token_hash=? AND s.expires>? AND u.active=1',(hashlib.sha256(token.encode()).hexdigest(),int(time.time()))).fetchone()
        if not user: raise APIError(401,'Sign in to continue')
        return dict(user)
    def revoke(self,token):
        with self.db() as db: db.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),))
    def reset_password(self,email,password):
        if len(password)<14: raise ValueError('Use a password with at least 14 characters')
        salt=secrets.token_hex(16)
        with self.db() as db:
            user=db.execute('SELECT id FROM users WHERE email=?',(email.strip().lower(),)).fetchone()
            if not user: raise ValueError('User not found')
            db.execute('UPDATE users SET password=?,salt=? WHERE id=?',(self.digest(password,salt),salt,user['id']))
            db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
    def colleague(self,tenant,user_id):
        with self.db() as db: return db.execute('SELECT 1 FROM users WHERE id=? AND tenant=? AND active=1',(user_id,tenant)).fetchone() is not None


def create_app(engine=None,accounts=None,origin=None):
    origin=(origin or os.environ.get('BUSINESS360_ORIGIN','http://127.0.0.1:8092')).rstrip('/')
    parsed=urlsplit(origin)
    if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in {'127.0.0.1','localhost'}): raise RuntimeError('Hosted standalone access requires an HTTPS origin')
    if parsed.path or parsed.query or parsed.fragment: raise RuntimeError('Origin cannot contain a path/query')
    secure=parsed.scheme=='https';cookie_name='b360_session'
    engine=engine or create_engine();accounts=accounts or Accounts(os.environ.get('BUSINESS360_AUTH_DB','var/accounts.db'))
    def app(env,start):
        extra=[];status=200;mime='application/json; charset=utf-8'
        try:
            path=env.get('PATH_INFO','/');method=env.get('REQUEST_METHOD','GET')
            if method=='GET' and path in {'/','/index.html','/app.js','/app.css','/favicon.svg'}:
                file=PUBLIC/('index.html' if path in {'/','/index.html'} else path[1:])
                if not file.is_file(): raise APIError(404,'Asset not built')
                body=file.read_bytes();mime=mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            else:
                if path not in {'/api/login','/api/logout','/api/me','/api/rpc'}: raise APIError(404,'Not found')
                if method not in ({'GET'} if path=='/api/me' else {'POST'}): raise APIError(405,'Method not allowed')
                payload={}
                if method=='POST':
                    if env.get('HTTP_ORIGIN')!=origin: raise APIError(403,'Request origin is not allowed')
                    if env.get('CONTENT_TYPE','').split(';')[0]!='application/json': raise APIError(415,'JSON is required')
                    length=env.get('CONTENT_LENGTH','')
                    if not length.isdigit() or not 1<=int(length)<=1048576: raise APIError(413,'Request exceeds 1 MiB')
                    try: payload=json.loads(env['wsgi.input'].read(int(length)))
                    except (ValueError,UnicodeDecodeError): raise APIError(422,'Invalid JSON') from None
                    if not isinstance(payload,dict): raise APIError(422,'Request must be an object')
                jar=SimpleCookie();jar.load(env.get('HTTP_COOKIE',''));token=jar[cookie_name].value if cookie_name in jar else ''
                if path=='/api/login':
                    fields(payload,{'email','password'},{'email','password'})
                    if not all(isinstance(payload[k],str) and len(payload[k])<=1024 for k in payload): raise APIError(422,'Invalid login')
                    token,csrf=accounts.login(payload['email'],payload['password'],env.get('REMOTE_ADDR','unknown'))
                    extra.append(('Set-Cookie',f'{cookie_name}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'+('; Secure' if secure else '')))
                    result={'signed_in':True,'csrf':csrf}
                else:
                    user=accounts.session(token)
                    if method=='POST' and not hmac.compare_digest(env.get('HTTP_X_CSRF_TOKEN',''),user['csrf']): raise APIError(403,'Session verification failed; refresh and try again')
                    if path=='/api/me': result=user
                    elif path=='/api/logout':
                        accounts.revoke(token);extra.append(('Set-Cookie',f'{cookie_name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+('; Secure' if secure else '')));result={'signed_out':True}
                    else:
                        if not user['enabled']: raise APIError(403,'This workspace has not been enabled for Business360')
                        fields(payload,{'command','project_id','data'},{'command','data'})
                        if not isinstance(payload['command'],str) or not isinstance(payload['data'],dict): raise APIError(422,'Invalid command')
                        if payload['command']=='members.add' and not accounts.colleague(user['tenant'],payload['data'].get('user_id')): raise APIError(403,'Select an active member of this organisation')
                        result=engine.dispatch(Actor(user['tenant'],user['id'],user['role']),payload['command'],payload.get('project_id'),payload['data'])
                body=json.dumps(result,ensure_ascii=False,allow_nan=False).encode()
        except APIError as e: status=e.status;body=json.dumps({'error':str(e)}).encode()
        except Exception: status=500;body=b'{"error":"Request failed. Contact the workspace operator."}'
        headers=[('Content-Type',mime),('Content-Length',str(len(body))),('Cache-Control','no-store'),('X-Content-Type-Options','nosniff'),('Referrer-Policy','same-origin'),('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")]+extra
        if secure: headers.append(('Strict-Transport-Security','max-age=31536000'))
        start(f'{status} '+('OK' if status==200 else 'Error'),headers);return [body]
    return app

if __name__=='__main__':
    from wsgiref.simple_server import make_server
    from transformation.server import QuietHandler
    port=int(os.environ.get('PORT','8092'))
    with make_server('127.0.0.1',port,create_app(),handler_class=QuietHandler) as server:
        print(f'Business360: http://127.0.0.1:{port}',flush=True);server.serve_forever()
