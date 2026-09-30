"""Project-local numbering stays unique, stable and exact through upgrades."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import server

with tempfile.TemporaryDirectory() as directory:
    server.DB_PATH = Path(directory) / 'board.sqlite3'
    server.init_db()
    a = server.create_project({'name':'A','workflow':'content'})['id']
    b = server.create_project({'name':'B','workflow':'content'})['id']
    make = lambda project: server.create_card({'projectId':project,'title':'test'})
    first, other, second = make(a), make(b), make(a)
    assert [first['task_number'],other['task_number'],second['task_number']] == [1,1,2]
    server.delete_card(second['id'])
    server.init_db()
    third = make(a)
    assert third['task_number'] == 3 and third['id'] > second['id']
    with ThreadPoolExecutor(max_workers=6) as pool:
        tasks = list(pool.map(make, [a]*12))
    assert sorted(t['task_number'] for t in tasks) == list(range(4,16))
    assert len({t['id'] for t in tasks}) == 12
    # Display padding is a minimum, not a three-digit ceiling.
    with server.db() as con:
        con.execute('UPDATE projects SET task_sequence=999 WHERE id=?',(b,))
    assert make(b)['task_number'] == 1000
    # Repeat migration preserves both assigned numbers and high-water marks.
    assert all(c['global_number'] == 'DEV-%012d' % c['id'] for c in server.state()['cards'])
    before = [(c['id'],c['task_number']) for c in server.state()['cards']]
    server.init_db()
    assert before == [(c['id'],c['task_number']) for c in server.state()['cards']]
    with server.db() as con:
        con.execute('UPDATE projects SET task_sequence=9007199254740991 WHERE id=?',(b,))
    try:
        make(b)
        raise AssertionError('must reject unsafe integer')
    except server.BoardError as error:
        assert error.code == 'number_exhausted'
    assert before == [(c['id'],c['task_number']) for c in server.state()['cards']]
print('project numbering, concurrency, deletion, migration and overflow checks passed')
