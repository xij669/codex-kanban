"""Failure handling and bounded retries, with no actual model execution."""
import io,json,tempfile
from pathlib import Path
from unittest.mock import patch
import server

with tempfile.TemporaryDirectory() as folder:
    server.DB_PATH=Path(folder)/'test.sqlite3';server.init_db()
    project=server.create_project({'name':'异常测试','path':folder,'workflow':'development'})['id']
    def task():
        cid=server.create_card({'projectId':project,'title':'测试任务','acceptance':'可验证'})['id']
        server.move_card(cid,{'status':'todo'})
        return cid
    def execute(outcomes):
        cid=task()
        with patch('server.shutil.which',return_value='/test/codex'):
            card,rid=server.claim_card(cid)
        waits=[]
        def wait(seconds, active):
            run=next(r for r in server.card_detail(cid)['runs'] if r['id']==rid)
            assert run['status']=='running' and run['retry_wait']==seconds
            waits.append(seconds)
        with patch('server.run_attempt',side_effect=outcomes) as attempt,patch('server.pause',side_effect=wait):
            server.run_codex(card,rid,server.ActiveRun(card["id"],rid))
        state=server.state()
        return next(c for c in state['cards'] if c['id']==cid),waits,attempt.call_count
    network=(False,'','','network connection reset',False)
    success=(True,'','已完成','',True)
    c,w,n=execute([network,success]);assert c['status']=='review' and w==[15] and n==2 and c['issue'] is None
    c,w,n=execute([network]*3);assert c['status']=='review' and w==[15,45] and n==3
    assert c['issue']['title']=='网络或服务暂时不可用'
    c,w,n=execute([(False,'','','network connection reset',True)]);assert c['status']=='review' and not w and n==1
    c,w,n=execute([(False,'','','insufficient_quota',False)]);assert c['issue']['title']=='执行额度不足' and not w
    c,w,n=execute([(False,'','','permission denied',False)]);assert c['issue']['title']=='文件或操作权限不足' and not w
    c,w,n=execute([(False,'','','TASKBOARD_NEEDS_INPUT: 请提供接口地址',True)]);assert c['issue']['title']=='需要补充信息'
    assert server.failure_info('服务重启，执行状态未知')['retryable'] is False
    cid=task()
    with server.db() as con:con.execute('UPDATE projects SET path=? WHERE id=?',(str(Path(folder)/'missing'),project))
    try:
        server.execute_card(cid)
        raise AssertionError('失效目录必须返回审阅中并标记失败')
    except server.TaskBlocked:pass
    assert not server.has_active_runs()
    c=next(c for c in server.state()['cards'] if c['id']==cid)
    assert c['status']=='review' and c['issue']['title']=='项目目录无法访问'
    # Even a zero exit code must not hide explicit failure or missing user information.
    class Sink:
        def write(self,x):pass
        def close(self):pass
    class Process:
        stdin=Sink()
        def __init__(self,events):self.stdout=iter(json.dumps(e) for e in events)
        def wait(self):return 0
    card={'model':'test','thinking':'medium','path':folder}
    for events in [
        [{'type':'turn.failed','error':{'message':'network timeout'}}],
        [{'type':'item.completed','item':{'type':'agent_message','text':'TASKBOARD_NEEDS_INPUT: 请补充信息'}}]
    ]:
        with patch('server.subprocess.Popen',return_value=Process(events)):
            assert server.run_attempt(card,'测试',-1,server.ActiveRun(-1,-1))[0] is False
print('异常原因、需补充信息、有限重试、已操作后禁止重跑及预检失败检查通过')
