"""Copies preserve saved inputs and isolate all execution history; no model calls."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import server

FIELDS = ('title','description','acceptance','priority','tags','source','model','thinking')
with TemporaryDirectory() as directory, patch.object(server,'execution_catalog',return_value=[]):
    server.DB_PATH = Path(directory)/'board.sqlite3'
    server.init_db()
    p=server.create_project({'name':'Copy project','workflow':'development','path':directory})['id']
    original=server.create_card(dict(projectId=p,title='Same title 日本語',description='Detailed instructions\nsecond line',
       acceptance='Check this',priority='urgent',tags='copy, test',source='https://example.com/task',model='historical-model',thinking='high'))['id']
    server.add_comment(original,{'body':'Private review feedback'})
    with server.db() as con:
        con.execute("UPDATE cards SET created_at='2000-01-01',updated_at='2000-01-01' WHERE id=?",(original,))
        con.execute("INSERT INTO runs(card_id,status,started_at,ended_at,output,error,thread_id,model,thinking) VALUES(?,?,?,?,?,?,?,?,?)",
                    (original,'completed','2000-01-01','2000-01-01','Old output','Old error','Old thread','old','low'))
    for status in ('backlog','todo','progress','review','done','cancelled'):
        with server.db() as con:
            con.execute('UPDATE cards SET status=? WHERE id=?',(status,original))
        before=server.card_detail(original)
        copy=server.duplicate_card(original)
        detail=server.card_detail(copy['id'])
        assert {k:detail['card'][k] for k in FIELDS} == {k:before['card'][k] for k in FIELDS}
        assert detail['card']['project_id']==p and detail['card']['status']=='backlog'
        assert detail['card']['id']!=original and detail['card']['task_number']>before['card']['task_number']
        assert detail['card']['created_at']!='2000-01-01'
        assert detail['runs']==[] and detail['comments']==[]
        assert server.card_detail(original)==before
        summary=next(c for c in server.state()['cards'] if c['id']==copy['id'])
        assert summary['pendingFeedbackCount']==0 and not summary['issue']
    with ThreadPoolExecutor(max_workers=6) as pool:
        copies=list(pool.map(server.duplicate_card,[original]*12))
    assert len({c['id'] for c in copies})==12 and len({c['task_number'] for c in copies})==12
    again=server.duplicate_card(copies[0]['id'])
    assert server.card_detail(again['id'])['runs']==[]
    # A removed historical model is retained, not replaced by the current defaults.
    with patch.object(server,'execution_catalog',return_value=[{'id':'new','efforts':['low']}]):
        assert server.card_detail(server.duplicate_card(original)['id'])['card']['model']=='historical-model'
    try:
        server.duplicate_card(999999)
        raise AssertionError('missing task must fail')
    except server.BoardError as e:
        assert e.code=='task_not_found'
    with server.db() as con:
        before=con.execute('SELECT COUNT(*) FROM cards').fetchone()[0]
        con.execute('UPDATE projects SET task_sequence=9007199254740991 WHERE id=?',(p,))
    try:
        server.duplicate_card(original)
        raise AssertionError('overflow must fail')
    except server.BoardError as e:
        assert e.code=='number_exhausted'
    with server.db() as con:
        assert con.execute('SELECT COUNT(*) FROM cards').fetchone()[0]==before
print('duplicate inputs, history isolation, statuses, concurrency and overflow passed')
