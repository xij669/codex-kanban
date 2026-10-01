"""Project reference isolation and executor wiring, without calling a real model."""
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import server

with tempfile.TemporaryDirectory() as root:
    server.DB_PATH = Path(root) / 'board.sqlite3'
    server.init_db()
    project = server.create_project({'name':'共享项目','path':root,'workflow':'development'})['id']
    other = server.create_project({'name':'其他项目','path':root,'workflow':'development'})['id']
    current = server.create_card({'projectId':project,'title':'当前任务','acceptance':'可验证'})['id']
    sibling = server.create_card({'projectId':project,'title':'已完成的依赖'})['id']
    cancelled = server.create_card({'projectId':project,'title':'取消的方案'})['id']
    secret = server.create_card({'projectId':other,'title':'不应导出的其他项目信息'})['id']
    server.add_comment(sibling, {'body':'保留兼容旧格式的决定'})
    server.add_comment(secret, {'body':'不应导出的评论'})
    server.move_card(sibling, {'status':'review'})
    server.approve_card(sibling)
    server.move_card(cancelled, {'status':'cancelled'})
    with server.db() as con:
        con.execute("INSERT INTO runs(card_id,status,started_at,output) VALUES (?,?,?,?)", (sibling,'completed',server.now(),'结果全文'*500))
    for n in range(25):
        server.create_card({'projectId':project,'title':'其他任务 %s' % n})
    server.move_card(current, {'status':'todo'})
    with patch('server.shutil.which', return_value='/test/codex'):
        card, run_id = server.claim_card(current)
    folder = Path(root)/'snapshot'
    folder.mkdir()
    with server.db() as con:
        prompt = server.write_project_context(con, card, folder)
    index = json.loads((folder/'index.json').read_text())
    assert len(index['tasks']) == 28
    assert len(json.loads(prompt.splitlines()[3])) == 20
    assert not (folder/str(secret)).exists()
    assert '不应导出' not in ''.join(p.read_text() for p in folder.rglob('*.json'))
    assert json.loads((folder/str(sibling)/'task.json').read_text())['status'] == 'done'
    assert json.loads((folder/str(cancelled)/'task.json').read_text())['status'] == 'cancelled'
    assert '保留兼容' in (folder/str(sibling)/'comments.json').read_text()
    run = json.loads((folder/str(sibling)/'runs.json').read_text())[0]
    assert json.loads((folder/str(sibling)/('run-%s.json'%run['id'])).read_text())['output'] == '结果全文'*500
    assert '只完成当前获批任务' in prompt
    captured = {}
    class Input:
        def write(self, value):
            captured['prompt'] = value
            marker = '同项目参考资料（本轮开始时的只读快照，包含已完成和已取消任务）：'
            captured['path'] = Path(value.split(marker)[1].splitlines()[0])
            assert (captured['path']/str(sibling)/'task.json').exists()
        def close(self): pass
    class Process:
        stdin = Input()
        stdout = iter([json.dumps({'type':'item.completed','item':{'type':'agent_message','text':'测试完成'}})])
        def wait(self): return 0
    with patch('server.subprocess.Popen', return_value=Process()) as popen:
        server.run_codex(card, run_id, server.ActiveRun(card["id"], run_id))
        assert popen.call_args[0][0] == server.execution_command(card)
    assert not captured['path'].exists()
    assert not server.has_active_runs()
    assert next(c for c in server.state()['cards'] if c['id']==current)['status'] == 'review'
    assert set(p.name for p in Path(root).iterdir()) == {'board.sqlite3','snapshot'}
print('同项目索引、跨项目隔离、完整历史读取、执行注入和临时资料清理检查通过')
