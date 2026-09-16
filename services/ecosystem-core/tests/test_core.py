import unittest
from core import Core,Denied,Invalid
class SecurityTests(unittest.TestCase):
 def setUp(self):
  self.c=Core(':memory:')
  self.c.db.executemany('INSERT INTO memberships VALUES(?,?,?,?)',[('haccora','alice','restaurant','owner'),('haccora','bob','other','owner'),('haccora','staff','restaurant','staff'),('taxnuvia','accountant','firm','owner'),('taxnuvia','other','other-firm','owner')])
  self.c.db.execute("INSERT INTO providers VALUES('p1','taxnuvia','firm','Chosen accountant','taxnuvia','GB',1)")
  self.d=dict(provider='p1',service='taxnuvia',brief='VAT help',contact={'name':'Alice','email':'alice@example.test'},approved=True,notice='introduction-v1',request_key='one')
 def create(self): return self.c.create('haccora','alice','restaurant',self.d)['id']
 def test_recipient_isolation(self):
  self.create(); self.assertEqual(len(self.c.inbox('taxnuvia','accountant','firm')),1); self.assertEqual(self.c.inbox('taxnuvia','other','other-firm'),[])
 def test_source_isolation(self):
  self.create(); self.assertEqual(self.c.outgoing('haccora','bob','other'),[])
  with self.assertRaises(Denied): self.c.outgoing('haccora','bob','restaurant')
 def test_staff_cannot_share(self):
  with self.assertRaises(Denied): self.c.create('haccora','staff','restaurant',self.d)
 def test_approval_required(self):
  self.d['approved']=False
  with self.assertRaises(Invalid): self.create()
 def test_idempotent(self):
  self.assertEqual(self.create(),self.create()); self.assertEqual(self.c.db.execute('SELECT count(*) FROM referrals').fetchone()[0],1)
  self.d['brief']='Different'
  with self.assertRaises(Invalid): self.create()
 def test_withdraw_removes_access_and_payload(self):
  ident=self.create(); self.c.transition('haccora','alice','restaurant',ident,'withdrawn'); self.assertEqual(self.c.inbox('taxnuvia','accountant','firm'),[])
  r=self.c.db.execute('SELECT contact,brief FROM referrals').fetchone(); self.assertEqual(tuple(r),('{}',''))
 def test_cannot_accept_other_referral(self):
  ident=self.create()
  with self.assertRaises(Denied): self.c.transition('taxnuvia','other','other-firm',ident,'accepted')
 def test_provider_status(self):
  ident=self.create(); self.c.transition('taxnuvia','accountant','firm',ident,'accepted')
  self.assertEqual(self.c.outgoing('haccora','alice','restaurant')[0]['status'],'accepted')
 def test_no_contact_before_request(self): self.assertEqual(self.c.inbox('taxnuvia','accountant','firm'),[])
 def test_unavailable_provider(self):
  self.c.db.execute('UPDATE providers SET active=0')
  with self.assertRaises(Invalid): self.create()
if __name__=='__main__': unittest.main()
