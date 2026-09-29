"""Per-project auto claiming and legacy migration; no model calls."""
import tempfile
from pathlib import Path
from unittest.mock import patch
import server

with tempfile.TemporaryDirectory() as folder:
    server.DB_PATH = Path(folder)/'test.sqlite3'
    with server.db() as con:
        con.executescript("CREATE TABLE projects(id INTEGER PRIMARY KEY,name TEXT,path TEXT,workflow TEXT,created_at TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); INSERT INTO settings VALUES('auto_enabled','true'); INSERT INTO projects VALUES(1,'旧项目','','development','');")
    server.init_db()
    assert server.state()['projects'][0]['auto_enabled'] == 1
    a=server.create_project({'name':'A','path':folder,'workflow':'development'})['id']
    b=server.create_project({'name':'B','path':folder,'workflow':'development'})['id']
    ca=server.create_card({'projectId':a,'title':'A task','acceptance':'检查'})['id']
    cb=server.create_card({'projectId':b,'title':'B task','acceptance':'检查'})['id']
    server.AUTO_WAKE.clear()
    server.move_card(ca,{'status':'todo'})
    assert server.AUTO_WAKE.is_set()  # An idle worker need not wait for its next timed poll.
    server.AUTO_WAKE.clear()
    server.move_card(cb,{'status':'todo'})
    assert server.auto_candidate() is None
    server.AUTO_WAKE.clear()
    server.set_project_auto(b,{'autoEnabled':True})
    assert server.AUTO_WAKE.is_set()
    assert server.auto_candidate()['id']==cb
    server.set_project_auto(a,{'autoEnabled':True})
    assert server.auto_candidate()['id']==ca
    server.set_project_auto(a,{'autoEnabled':False})
    assert server.auto_candidate()['id']==cb
    server.init_db()  # Restart must not reapply the old global value.
    assert next(p for p in server.state()['projects'] if p['id']==a)['auto_enabled']==0
    server.set_project_auto(b,{'autoEnabled':False})
    with patch('server.shutil.which',return_value='/test/codex'):
        try:
            server.claim_card(cb,automatic=True)
            raise AssertionError('关闭后不能自动认领已选中的任务')
        except ValueError as e:
            assert '暂停' in str(e)
        card,run_id=server.claim_card(cb)  # Manual execution remains available.
    assert card['id']==cb
    try:
        server.set_project_auto(a,{'autoEnabled':'false'})
        raise AssertionError('必须校验布尔类型')
    except ValueError: pass
print('项目开关隔离、默认关闭、迁移持久化和关闭时认领竞争检查通过')
