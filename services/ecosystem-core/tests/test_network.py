import unittest,time,json,hmac,hashlib
from network import Network
from core import Denied,Invalid
class NetworkTests(unittest.TestCase):
 def setUp(self):
  self.c=Network(':memory:')
  with self.c.db:self.c.db.execute("INSERT INTO operators VALUES('admin')")
  self.keys={}
  for app in ('haccora','eventplanr','taxnuvia'):
   self.c.register('admin',dict(id=app,name=app,sector='food',country='GB'));self.keys[app]=self.c.rotate('admin',app)
   with self.c.db:self.c.db.execute('INSERT INTO memberships VALUES(?,?,?,?)',(app,'user',app+'-org','owner'))
  self.c.rule_save('admin',dict(id='food',source='haccora',target='eventplanr',percent=20,active=True))
 def event(self,app,version=1,status='active',promo=False,expiry=None,id=None):
  raw=json.dumps(dict(id=id or app+str(version),org=app+'-org',version=version,status=status,promo=promo,valid_until=expiry or int(time.time())+3600)).encode();stamp=str(int(time.time()));sig=hmac.new(self.keys[app]['webhook_secret'].encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
  return self.c.webhook(app,raw,stamp,sig)
 def link(self):
  code=self.c.link_start('haccora','user','haccora-org','eventplanr')['code'];return self.c.link_finish('eventplanr','user','eventplanr-org',code)
 def percent(self):return self.c.discount('eventplanr','user','eventplanr-org')['percent']
 def test_unlinked_no_discount(self):self.event('haccora');self.event('eventplanr');self.assertEqual(self.percent(),0)
 def test_linked_discount(self):self.link();self.event('haccora');self.event('eventplanr');self.assertEqual(self.percent(),20)
 def test_cancel_removes_at_next_renewal(self):
  self.test_linked_discount();self.event('haccora',2,'cancelled');self.assertEqual(self.percent(),0)
  d=json.loads(self.c.db.execute('SELECT body FROM outbox ORDER BY rowid DESC LIMIT 1').fetchone()[0]);self.assertEqual(d['effective'],'next_renewal')
 def test_promo_no_stacking(self):self.link();self.event('haccora');self.event('eventplanr',promo=True);self.assertEqual(self.percent(),0)
 def test_expiry_reconciles_without_event(self):
  self.test_linked_discount()
  with self.c.db:self.c.db.execute("UPDATE subscriptions_v3 SET valid_until=1 WHERE app='haccora'")
  self.assertEqual(self.percent(),0)
 def test_duplicate(self):self.event('haccora');self.assertTrue(self.event('haccora')['duplicate'])
 def test_stale_event(self):self.link();self.event('haccora',2,'cancelled');self.event('haccora',1);self.event('eventplanr');self.assertEqual(self.percent(),0)
 def test_wrong_signature(self):
  with self.assertRaises(Denied):self.c.webhook('haccora',b'{}',str(int(time.time())),'0'*64)
 def test_code_single_use(self):
  code=self.c.link_start('haccora','user','haccora-org','eventplanr')['code'];self.c.link_finish('eventplanr','user','eventplanr-org',code)
  with self.assertRaises(Invalid):self.c.link_finish('eventplanr','user','eventplanr-org',code)
 def test_wrong_destination(self):
  code=self.c.link_start('haccora','user','haccora-org','eventplanr')['code']
  with self.assertRaises(Invalid):self.c.link_finish('taxnuvia','user','taxnuvia-org',code)
 def test_unlink(self):self.test_linked_discount();self.c.unlink('haccora','user','haccora-org');self.assertEqual(self.percent(),0)
 def test_credential_rotation(self):
  self.c.authenticate('haccora',self.keys['haccora']['api_key']);self.c.rotate('admin','haccora')
  with self.assertRaises(Denied):self.c.authenticate('haccora',self.keys['haccora']['api_key'])
 def test_new_saas_catalogue(self):
  self.c.register('admin',dict(id='new-app',name='New app',sector='food',country='GB'));self.assertIn('new-app',[x['id'] for x in self.c.catalogue('haccora','food','GB')])
 def test_trial_ineligible(self):self.link();self.event('haccora',status='trial');self.event('eventplanr');self.assertEqual(self.percent(),0)
 def test_rule_disable(self):
  self.test_linked_discount();self.c.rule_save('admin',dict(id='food',source='haccora',target='eventplanr',percent=20,active=False));self.assertEqual(self.percent(),0)
if __name__=='__main__':unittest.main()
