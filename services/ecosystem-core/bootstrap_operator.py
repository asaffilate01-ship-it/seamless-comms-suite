import argparse
from extended import ExtendedCore
p=argparse.ArgumentParser(description='Run only on the trusted host to provision a central operator.');p.add_argument('actor');p.add_argument('--db',default='ecosystem.db');a=p.parse_args();c=ExtendedCore(a.db)
with c.db:c.db.execute('INSERT OR IGNORE INTO operators VALUES(?)',(a.actor,))
print('Central operator provisioned')
