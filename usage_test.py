"""Quota normalization, RPC lifecycle and cache tests; never calls a real model/account."""
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from codex_usage import normalize_limits, read_limits, UsageCache


def window(used=20, minutes=300, reset=2000000000):
    return dict(usedPercent=used, windowDurationMins=minutes, resetsAt=reset)

core = {'primary':window(), 'secondary':window(95,10080)}
assert [w['remainingPercent'] for w in normalize_limits({'rateLimits':core})] == [80,5]
assert normalize_limits({'rateLimitsByLimitId':{'codex':core},'rateLimits':{'primary':window(1)}})[0]['remainingPercent'] == 80
assert normalize_limits({'rateLimitsByLimitId':{'other':core},'rateLimits':core}) == []
assert normalize_limits({'rateLimits':{'limitId':'other', **core}}) == []
assert normalize_limits({'rateLimits':{'secondary':window(30,10080,None)}}) == [{'minutes':10080,'remainingPercent':70,'resetsAt':None}]
for invalid in (None, '12', float('nan'), True):
    assert normalize_limits({'rateLimits':{'primary':window(invalid)}}) == []
assert normalize_limits({'rateLimits':{'primary':window(150)}})[0]['remainingPercent'] == 0
assert normalize_limits({'rateLimits':{'primary':window(-20)}})[0]['remainingPercent'] == 100

with tempfile.TemporaryDirectory() as folder:
    fake = Path(folder) / 'rpc.py'
    fake.write_text('''import json,sys,time
for line in sys.stdin:
 m=json.loads(line)
 if m['method']=='initialize':
  print(json.dumps({'id':1,'result':{}}),flush=True)
 elif m['method']=='initialized': pass
 elif m['method']=='account/rateLimits/read':
  print(json.dumps({'method':'notification','params':{}}),flush=True)
  print(json.dumps({'id':2,'result':{'rateLimits':{'primary':{'usedPercent':80,'windowDurationMins':300,'resetsAt':2000000000}}}}),flush=True)
 else: raise RuntimeError('unexpected RPC')
''')
    answer = read_limits([sys.executable, str(fake)])
    assert answer['status']=='available' and answer['windows'][0]['remainingPercent']==20
    fake.write_text("import time; time.sleep(10)")
    start = time.monotonic()
    assert read_limits([sys.executable,str(fake)],timeout=.1)['status']=='unavailable'
    assert time.monotonic()-start < 3
    fake.write_text("import json; input(); print(json.dumps({'id':1,'error':{'message':'PRIVATE VALUE'}}),flush=True)")
    assert 'PRIVATE' not in str(read_limits([sys.executable,str(fake)]))
with patch('codex_usage.shutil.which', return_value=None):
    assert read_limits()['reason']=='cli_missing'

calls, clock = [], [0]
def reader():
    calls.append(1)
    return {'status':'available' if len(calls)==1 else 'unavailable','windows':[]}
cache = UsageCache(reader=reader,clock=lambda:clock[0])
with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(lambda _:cache.get(),range(20)))
assert len(calls)==1
clock[0]=61
assert cache.get()['status']=='unavailable' and len(calls)==2
print('quota mapping, missing values, RPC timeout/errors and shared cache passed')
