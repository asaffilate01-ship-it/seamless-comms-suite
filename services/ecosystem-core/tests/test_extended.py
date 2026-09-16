import unittest
from extended import ExtendedCore
from core import Denied,Invalid
class ExtendedTests(unittest.TestCase):
 def setUp(self):
  self.c=ExtendedCore(':memory:');self.c.db.execute("INSERT INTO operators VALUES('admin')")
  self.c.db.execute("INSERT INTO memberships VALUES('haccora','alice','r1','owner')")
 def test_admin_app_required(self):
  with self.assertRaises(Denied):self.c.overview('haccora','admin')
 def test_admin_user_required(self):
  with self.assertRaises(Denied):self.c.overview('ecosystem-admin','alice')
 def test_grant_upsert_and_revoke(self):
  d=dict(app='haccora',org='r1',product='eventplanr',source='verified:1')
  self.c.grant('ecosystem-admin','admin',d);self.c.grant('ecosystem-admin','admin',d)
  self.assertEqual(len(self.c.subscriptions('haccora','alice','r1')),1)
  with self.assertRaises(Denied):self.c.subscriptions('haccora','alice','r2')
  self.c.revoke('ecosystem-admin','admin',d);self.assertEqual(self.c.subscriptions('haccora','alice','r1'),[])
 def test_provider_cannot_be_reassigned(self):
  d=dict(id='p',app='taxnuvia',org='f1',name='Firm',service='taxnuvia',country='GB',active=True)
  self.c.provider_save('ecosystem-admin','admin',d);d['org']='f2'
  with self.assertRaises(Invalid):self.c.provider_save('ecosystem-admin','admin',d)
 def test_bundle_does_not_grant(self):
  self.c.bundle_save('ecosystem-admin','admin',dict(id='food',name='Food',products=['haccora','eventplanr']))
  self.assertEqual(self.c.subscriptions('haccora','alice','r1'),[])
 def test_expired_grant_rejected(self):
  with self.assertRaises(Invalid):self.c.grant('ecosystem-admin','admin',dict(app='haccora',org='r1',product='eventplanr',source='x',expires='2000-01-01T00:00:00Z'))
if __name__=='__main__':unittest.main()
