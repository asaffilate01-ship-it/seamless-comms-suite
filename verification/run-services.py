"""Run source-module checks independently to avoid knowledge_core import collisions."""
from pathlib import Path
import os, subprocess, sys

root=Path(__file__).resolve().parents[1]
suites=[
    ('services/transformation',['-m','unittest','discover','-s','tests']),
    ('services/transformation',['-m','unittest','discover','-s','vendor_tests']),
    ('services/rrci',['-m','unittest','discover','-s','tests']),
    ('services/enterprise-ai',['-m','unittest','discover','-s','tests']),
    ('services/decision-intelligence',['-m','unittest','discover','-s','tests']),
    ('services/ecosystem-core',['-m','unittest','discover','-s','tests']),
    ('apps/business360-standalone',['-m','unittest','test_server']),
]
for relative,args in suites:
    print(f'Checking {relative} {args[-1]}',flush=True)
    env=dict(os.environ)
    if args[-1]=='vendor_tests':env['PYTHONPATH']=str(root/relative/'vendor')
    subprocess.run([sys.executable,*args],cwd=root/relative,env=env,check=True)
