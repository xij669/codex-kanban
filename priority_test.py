"""Priority ordering across enabled projects; isolated DB, no model calls."""
import tempfile
from pathlib import Path
import server

with tempfile.TemporaryDirectory() as folder:
    server.DB_PATH = Path(folder) / 'test.sqlite3'
    server.init_db()
    projects = [server.create_project({'name': name, 'path': folder})['id'] for name in ('A', 'B')]
    for pid in projects:
        server.set_project_auto(pid, {'autoEnabled': True})
    ids = {}
    for index, priority in enumerate(('low', 'normal', 'high', 'urgent')):
        cid = server.create_card({'projectId': projects[index % 2], 'title': priority,
                                  'acceptance': '检查结果', 'priority': priority})['id']
        server.move_card(cid, {'status': 'todo'})
        ids[priority] = cid
    second = server.create_card({'projectId': projects[0], 'title': '第二个紧急',
                                 'acceptance': '检查结果', 'priority': 'urgent'})['id']
    server.move_card(second, {'status': 'todo'})
    for expected in (ids['urgent'], second, ids['high'], ids['normal'], ids['low']):
        assert server.auto_candidate()['id'] == expected
        server.move_card(expected, {'status': 'review'})
    for action in (lambda: server.create_card({'projectId': projects[0], 'title': '无效', 'priority': 'invalid'}),
                   lambda: server.update_card(second, {'priority': 'invalid'})):
        try:
            action()
            raise AssertionError('invalid priority accepted')
        except ValueError:
            pass
    default = server.create_card({'projectId': projects[0], 'title': '默认中'})['id']
    assert next(c for c in server.state()['cards'] if c['id'] == default)['priority'] == 'normal'
print('四级优先级、同级先创建先执行、跨项目排序、默认值与输入校验通过')
