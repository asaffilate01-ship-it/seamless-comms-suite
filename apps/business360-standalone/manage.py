import argparse, getpass, uuid
from server import Accounts
import os
p=argparse.ArgumentParser(description='Provision Business360 pilot users and entitlements')
s=p.add_subparsers(dest='command',required=True)
a=s.add_parser('add-user');a.add_argument('--tenant',required=True);a.add_argument('--email',required=True);a.add_argument('--role',choices=['owner','admin','member','viewer'],default='member')
e=s.add_parser('set-entitlement');e.add_argument('--tenant',required=True);e.add_argument('--enabled',choices=['yes','no'],required=True)
d=s.add_parser('disable-user');d.add_argument('--email',required=True)
r=s.add_parser('reset-password');r.add_argument('--email',required=True)
v=p.parse_args();store=Accounts(os.environ.get('BUSINESS360_AUTH_DB','var/accounts.db'))
if v.command=='add-user':
 uuid.UUID(v.tenant)
 first=getpass.getpass('Password (14+ characters): ')
 if first!=getpass.getpass('Confirm password: '): raise SystemExit('Passwords did not match')
 print('User ID:',store.add_user(v.tenant,v.email,first,v.role))
elif v.command=='set-entitlement':
 with store.db() as db:
  result=db.execute('UPDATE tenants SET enabled=? WHERE id=?',(int(v.enabled=='yes'),v.tenant))
  if not result.rowcount: raise SystemExit('Tenant not found')
 print('Entitlement updated')
elif v.command=='reset-password':
 first=getpass.getpass('New password (14+ characters): ')
 if first!=getpass.getpass('Confirm password: '): raise SystemExit('Passwords did not match')
 store.reset_password(v.email,first);print('Password changed and existing sessions revoked')
else:
 with store.db() as db:
  db.execute('UPDATE users SET active=0 WHERE email=?',(v.email.lower(),))
  db.execute('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email=?)',(v.email.lower(),))
 print('Access revoked')
