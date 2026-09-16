"""Local-only provisioning. Run on the trusted service host."""
import argparse
from core import Core
p=argparse.ArgumentParser(); p.add_argument('--db',default='ecosystem.db')
s=p.add_subparsers(dest='command',required=True)
m=s.add_parser('member'); [m.add_argument(x) for x in ['app','actor','org']]; m.add_argument('role',choices=['owner','manager','staff'])
v=s.add_parser('provider'); [v.add_argument(x) for x in ['id','app','org','name','service','country']]; v.add_argument('--active',action='store_true')
a=p.parse_args(); c=Core(a.db)
with c.db:
 if a.command=='member': c.db.execute('INSERT INTO memberships VALUES(?,?,?,?) ON CONFLICT(app,actor,org) DO UPDATE SET role=excluded.role',(a.app,a.actor,a.org,a.role))
 else: c.db.execute('INSERT INTO providers VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active',(a.id,a.app,a.org,a.name,a.service,a.country,int(a.active)))
print('Saved')
