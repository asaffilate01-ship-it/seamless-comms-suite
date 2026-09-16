"""Seed the service catalogue and the agreed discount rule; no providers activated."""
import os
from network import Network
from core import CATALOG
c=Network(os.environ.get('ECOSYSTEM_DB','ecosystem.db'));actor=os.environ.get('ECOSYSTEM_ADMIN_USER','admin')
with c.db:c.db.execute('INSERT OR IGNORE INTO operators VALUES(?)',(actor,))
for slug,name,description,sectors in CATALOG:
 if not c.db.execute('SELECT 1 FROM apps WHERE id=?',(slug,)).fetchone():c.register(actor,dict(id=slug,name=name,sector=sectors[0],country='GB'))
if not c.db.execute("SELECT 1 FROM rules WHERE id='haccora-eventplanr'").fetchone():c.rule_save(actor,dict(id='haccora-eventplanr',source='haccora',target='eventplanr',percent=20,active=True))
print('Catalogue and 20% Haccora/EventPlanr rule ready. Configure real providers and app connectors before launch.')
