import unittest,tempfile,os,json,time,importlib.util
from unittest.mock import patch
from network import Network
import worker
class DeliveryTests(unittest.TestCase):
 def test_retry_is_persistent(self):
  with tempfile.TemporaryDirectory() as directory:
   path=directory+'/db';c=Network(path)
   with c.db:c.db.execute("INSERT INTO outbox(id,app,body) VALUES('event','unknown','{}')")
   c.db.close()
   with patch.dict(os.environ,{'ECOSYSTEM_DB':path,'ECOSYSTEM_WEBHOOK_ENDPOINTS':'{}'}):worker.run()
   c=Network(path);r=c.db.execute('SELECT state,attempts,next_attempt FROM outbox').fetchone();self.assertEqual(r['state'],'pending');self.assertEqual(r['attempts'],1);self.assertGreater(r['next_attempt'],time.time());c.db.close()
 def test_inbox_never_rolls_back_revision(self):
  spec=importlib.util.spec_from_file_location('inbox','adapters/billing_inbox.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);inbox=m.BillingInbox(':memory:')
  for e in [dict(id='new',org='r',revision=2,percent=0),dict(id='old',org='r',revision=1,percent=20),dict(id='new',org='r',revision=2,percent=0)]:inbox.accept_verified(e)
  self.assertEqual(inbox.db.execute('SELECT revision,percent,state FROM desired_discount').fetchone(),(2,0,'pending'))
