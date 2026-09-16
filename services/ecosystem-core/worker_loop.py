import time,logging
from worker import run
while True:
 try:run()
 except Exception:logging.error('Reconciliation worker failed; next pass will retry')
 time.sleep(60)
