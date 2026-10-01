"""Directory-aware parallel execution with real fake subprocesses; no model calls."""
import json
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
import server


def wait_for(predicate, message):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(message)


def rejected(cid, code):
    before = server.card_detail(cid)
    try:
        server.execute_card(cid)
        raise AssertionError('conflicting task started')
    except server.BoardError as error:
        assert error.code == code, error.code
    assert server.card_detail(cid) == before  # Wait is not a failed execution.


with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    server.DB_PATH = root / 'board.sqlite3'
    server.init_db()
    script = root / 'fake_executor.py'
    script.write_text('''import json, sys, time, subprocess
from pathlib import Path
path = Path(sys.argv[1])
path.joinpath('prompt.txt').write_text(sys.stdin.read())
print(json.dumps({'type':'thread.started','thread_id':path.name}), flush=True)
path.joinpath('started').touch()
if path.joinpath('spawn_child').exists():
 child = subprocess.Popen([sys.executable, str(path.parent/'child.py'), str(path)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
 path.joinpath('child.pid').write_text(str(child.pid))
if path.joinpath('retry').exists():
 print(json.dumps({'type':'error','message':'network connection reset'}), flush=True)
 sys.exit(1)
print(json.dumps({'type':'item.started','item':{'type':'command_execution','command':'synthetic work'}}), flush=True)
while not path.joinpath('finish').exists(): time.sleep(0.02)
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':'Finished '+path.name}}), flush=True)
''')
    child_script=root/'child.py'
    child_script.write_text('''import signal, sys, time
from pathlib import Path
signal.signal(signal.SIGTERM, signal.SIG_IGN)
path=Path(sys.argv[1])/'heartbeat'
while True:
 path.write_text(str(time.monotonic()))
 time.sleep(0.02)
''')
    def project(name, path=None, auto=False):
        path = Path(path) if path is not None else root / name
        path.mkdir(parents=True, exist_ok=True)
        pid = server.create_project({'name':name,'path':str(path)})['id']
        if auto:
            server.set_project_auto(pid, {'autoEnabled':True})
        return pid, path
    def task(pid, title='Task', priority='normal'):
        cid = server.create_card({'projectId':pid,'title':title,'acceptance':'Synthetic check','priority':priority})['id']
        server.move_card(cid, {'status':'todo'})
        return cid
    def completed(cid):
        return server.active_run(cid) is None and server.card_detail(cid)['card']['status']=='review'
    with patch('server.shutil.which',return_value='/fake/codex'), \
         patch('server.validate_execution'), \
         patch('server.execution_command',side_effect=lambda c:[sys.executable,str(script),c['path']]), \
         patch('server.RUN_TIMEOUT_SECONDS',0):
        try:
            a, ap = project('A'); b, bp = project('B')
            (ap/'spawn_child').touch()
            ca, cb = task(a, 'A private goal'), task(b, 'B private goal')
            # Independent processes really overlap, with independent prompts and records.
            server.execute_card(ca); server.execute_card(cb)
            wait_for(lambda:(ap/'started').exists() and (bp/'started').exists(),'parallel processes did not start')
            wait_for(lambda:(ap/'heartbeat').exists(),'synthetic child did not start')
            assert server.card_detail(ca)['runs'][0]['status']=='running'
            assert server.card_detail(cb)['runs'][0]['status']=='running'
            assert 'A private goal' not in (bp/'prompt.txt').read_text()
            assert 'B private goal' not in (ap/'prompt.txt').read_text()
            ca2 = task(a); rejected(ca2,'project_busy')
            alias = root/'alias'; alias.symlink_to(ap,target_is_directory=True)
            alias_id,_ = project('alias project',alias)
            overlap = task(alias_id,priority='urgent'); rejected(overlap,'workspace_busy')
            snapshot={p['id']:p['execution_wait'] for p in server.state()['projects']}
            assert snapshot[a]=='project_busy' and snapshot[alias_id]=='workspace_busy'
            child,cp = project('child',ap/'nested'); rejected(task(child),'workspace_busy')
            parent,_ = project('parent',root); rejected(task(parent),'workspace_busy')
            assert server.directories_overlap(alias,cp) and server.directories_overlap(cp,alias)
            assert not server.directories_overlap(root/'A',root/'A-suffix')
            # The actual execution folder stays reserved even if project settings change.
            moved=root/'A-new'; moved.mkdir()
            server.update_project(a,{'name':'A','path':str(moved)})
            rejected(overlap,'workspace_busy'); rejected(ca2,'project_busy')
            assert server.card_detail(ca)['runs'][0]['workspace_path']==str(ap.resolve())
            server.init_db(); server.init_db()  # Repeatable migration preserves active snapshots.
            rejected(overlap,'workspace_busy')
            # Timeout C only; A and B remain active.
            c,cp = project('C'); cc=task(c)
            with patch('server.RUN_TIMEOUT_SECONDS',1):
                server.execute_card(cc)
                wait_for(lambda:(cp/'started').exists(),'timeout task did not start')
                wait_for(lambda:completed(cc),'timeout did not clean up')
            assert server.card_detail(cc)['runs'][0]['error'].startswith(server.STOP_TIMEOUT)
            assert server.active_run(ca) and server.active_run(cb)
            # Stop A only, then finish B normally; their outputs/errors never cross.
            server.stop_card(ca); wait_for(lambda:completed(ca),'manual stop did not clean up')
            heartbeat=(ap/'heartbeat').read_text(); time.sleep(0.1)
            assert (ap/'heartbeat').read_text()==heartbeat,'stopped task left a child writing in its released folder'
            assert server.card_detail(ca)['runs'][0]['error']==server.STOP_MANUAL
            assert server.active_run(cb) and server.card_detail(cb)['runs'][0]['status']=='running'
            (bp/'finish').touch(); wait_for(lambda:completed(cb),'B did not complete')
            assert server.card_detail(cb)['runs'][0]['output']=='Finished B'
            # Auto dispatch fills more than two independent slots, skipping a busy queue head.
            server.set_project_auto(alias_id,{'autoEnabled':True})
            server.execute_card(ca2)  # Same project, now uses its newly selected directory.
            waiting=task(a,priority='urgent'); server.set_project_auto(a,{'autoEnabled':True})
            ids=[]; paths=[]
            for name in ('D','E','F'):
                pid,path=project(name,auto=True); ids.append(task(pid)); paths.append(path)
            # A queued lower-priority task in an active project must stay queued.
            d_project=server.card_detail(ids[0])['card']['project_id']; d_next=task(d_project)
            disabled,disabled_path=project('Disabled'); disabled_task=task(disabled)
            server.auto_dispatch()
            wait_for(lambda:all((path/'started').exists() for path in paths),'auto dispatch did not fill independent slots')
            assert all(server.active_run(cid) for cid in ids)
            assert server.card_detail(waiting)['card']['status']=='todo'
            assert server.card_detail(d_next)['card']['status']=='todo'
            assert server.card_detail(disabled_task)['card']['status']=='todo'
            # Directory reservation also covers retry backoff; stopping it frees only that task.
            r,rp=project('Retry'); (rp/'retry').touch(); cr=task(r)
            server.execute_card(cr)
            wait_for(lambda:server.card_detail(cr)['runs'][0]['retry_wait']==15,'retry did not enter backoff')
            r_alias,_=project('retry alias',rp); rejected(task(r_alias),'workspace_busy')
            server.stop_card(cr); wait_for(lambda:completed(cr),'retry stop was not interruptible')
            assert all(server.active_run(cid) for cid in ids)
            # Thread-start failure releases the database reservation, without touching others.
            broken,broken_path=project('Broken'); broken_task=task(broken)
            with patch('server.threading.Thread.start',side_effect=RuntimeError('synthetic start failure')):
                try: server.execute_card(broken_task)
                except RuntimeError: pass
                else: raise AssertionError('start failure must be reported')
            assert completed(broken_task)
            assert server.card_detail(broken_task)['runs'][0]['status']=='failed'
            assert all(server.active_run(cid) for cid in ids)
        finally:
            with server.RUNS_GUARD:
                active_ids=list(server.ACTIVE_RUNS)
            for cid in active_ids: server.stop_card(cid)
            wait_for(lambda:not server.has_active_runs(),'leftover synthetic workers')
        # Competing claims are atomic even without an in-memory worker reservation.
        race,race_path=project('Race'); rival,_=project('Rival',race_path)
        race_ids=[task(race),task(rival)]
        def claim(cid):
            try: return server.claim_card(cid)
            except server.BoardError as error: return error.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(claim,race_ids))
        assert sum(isinstance(x,tuple) for x in results)==1,results
        assert 'workspace_busy' in results
        server.recover_stale_runs()
        assert all(server.card_detail(cid)['card']['status']!='progress' for cid in race_ids)
print('parallel processes, directory/project isolation, atomic claims, queue filling, stop/timeout/retry and migration passed')
