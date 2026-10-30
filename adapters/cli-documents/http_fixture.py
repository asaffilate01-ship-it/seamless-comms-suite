"""Synthetic loopback-only integration fixture. Never a production launcher."""
import json
from pathlib import Path
import sys
import tempfile
from wsgiref.simple_server import make_server, WSGIRequestHandler

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'services/cli-automation'))
sys.path.insert(0,str(root/'services/cli-automation/tests'))
from automation import Service
from wsgi_app import create_app
from test_automation import Backend

class Quiet(WSGIRequestHandler):
    def log_message(self,*args): pass

a={'tenant':'fixture-a','product':'kindelo','actor':'fixture-user'}
b={'tenant':'fixture-b','product':'kindelo','actor':'fixture-user'}
scopes={'synthetic-a':a,'synthetic-b':b}
def verify(token):
    if token not in scopes: raise PermissionError()
    return dict(scopes[token])

with tempfile.TemporaryDirectory() as temporary:
    def factory():
        return Service(Path(temporary)/'jobs.db',authorise=lambda scope,action:scope in scopes.values(),backend=Backend())
    service=factory()
    jobs=[]
    for scope in [a,b]:
        job=service.submit(scope,'seed',{'title':'Synthetic draft','paragraphs':['No real customer data.']})
        service.run(scope,job);jobs.append(job)
    service.close()
    app=create_app(service_factory=factory,verify_bearer=verify)
    with make_server('127.0.0.1',0,app,handler_class=Quiet) as server:
        print(json.dumps({'port':server.server_port,'own':jobs[0],'foreign':jobs[1]}),flush=True)
        server.serve_forever()
