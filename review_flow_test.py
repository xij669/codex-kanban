"""2026-09-28 review changes: no 需处理 status, stop/timeout, model-cache fallback, deletion.

Uses a temporary DB and a fake `codex` script; never calls a real model.
"""
import json
import os
import sqlite3
import stat
import tempfile
import time
from pathlib import Path
from unittest.mock import patch
import server


def expect_error(action, text=""):
    try:
        action()
    except ValueError as error:
        assert text in str(error), str(error)
        return
    raise AssertionError("应当拒绝：" + text)


with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    server.DB_PATH = root / "test.sqlite3"

    # 1. Legacy blocked cards migrate to review; the failed run keeps them flagged.
    server.init_db()
    project = server.create_project({"name": "评审项目", "path": folder, "workflow": "development"})["id"]
    legacy = server.create_card({"projectId": project, "title": "旧的需处理任务", "acceptance": "可检查"})["id"]
    with server.db() as con:
        con.execute("UPDATE cards SET status='blocked' WHERE id=?", (legacy,))
        con.execute("INSERT INTO runs(card_id,status,error,started_at,ended_at) VALUES (?,?,?,?,?)",
                    (legacy, "failed", "permission denied", server.now(), server.now()))
    server.init_db()
    card = next(c for c in server.state()["cards"] if c["id"] == legacy)
    assert card["status"] == "review" and card["issue"]["title"] == "文件或操作权限不足"
    assert "blocked" not in server.WORKFLOWS["development"]
    expect_error(lambda: server.move_card(legacy, {"status": "blocked"}), "目标列")
    expect_error(lambda: server.approve_card(legacy), "未成功")
    server.move_card(legacy, {"status": "todo"})  # Requeue without a comment stays possible.

    # 7. Error classification only matches whole tokens.
    assert server.failure_info("Traceback: test_api.py line 4012 AssertionError")["title"] == "执行未能完成"
    assert server.failure_info("HTTP 401 Unauthorized")["title"] == "执行器需要登录"
    assert server.failure_info("执行超时：超过 60 分钟未完成")["title"] == "执行超时"
    assert server.failure_info(server.STOP_MANUAL)["retryable"] is False
    # Command output inside item events is never treated as an error message.
    assert server.event_error({"type": "item.completed", "item": {"type": "command_execution", "aggregated_output": "401 timeout"}}) == ""
    assert server.event_error({"type": "turn.failed", "error": {"message": "rate limit"}}) == "rate limit"

    # 3. Missing model cache: cards can still be created and executed with Codex defaults.
    with patch.dict(os.environ, {"CODEX_HOME": str(root / "missing-codex-home")}):
        content = server.create_project({"name": "内容", "workflow": "content"})["id"]
        server.create_card({"projectId": content, "title": "内容卡片"})
        dev = server.create_card({"projectId": project, "title": "无缓存", "acceptance": "可检查"})["id"]
        detail = server.card_detail(dev)["card"]
        assert (detail["model"], detail["thinking"]) == ("", "")
        command = server.execution_command({"model": "", "thinking": "", "path": folder})
        assert "--model" not in command and "-c" not in command
        server.set_execution(dev, {"model": "any-model", "thinking": "high"})

    # 8. Acceptance stays required while queued, and is rechecked when claimed.
    queued = server.create_card({"projectId": project, "title": "排队", "acceptance": "可检查"})["id"]
    server.move_card(queued, {"status": "todo"})
    expect_error(lambda: server.update_card(queued, {"acceptance": " "}), "验收标准")
    with server.db() as con:
        con.execute("UPDATE cards SET acceptance='' WHERE id=?", (queued,))
    with patch("server.shutil.which", return_value="/test/codex"):
        try:
            server.execute_card(queued)
            raise AssertionError("缺少验收标准时不能执行")
        except server.TaskBlocked:
            pass
    card = next(c for c in server.state()["cards"] if c["id"] == queued)
    assert card["status"] == "review" and card["issue"]["title"] == "缺少验收标准"
    assert not server.RUN_LOCK.locked()

    # Empty feedback requeues only when saved comments are still waiting for the agent.
    with server.db() as con:
        con.execute("UPDATE cards SET acceptance='可检查' WHERE id=?", (queued,))
    expect_error(lambda: server.submit_feedback(queued, {"body": ""}), "返工意见")
    server.add_comment(queued, {"body": "先保存，稍后调整优先级再返工"})
    server.update_card(queued, {"priority": "urgent"})
    server.submit_feedback(queued, {"body": ""})
    assert server.card_detail(queued)["card"]["status"] == "todo"

    # 5. Unchanged state keeps the same revision; any change produces a new one.
    first, second = server.state()["rev"], server.state()["rev"]
    assert first == second
    server.add_comment(queued, {"body": "改变状态"})
    assert server.state()["rev"] != first
    assert "comments" not in server.state() and "runs" not in server.state()

    # 2. Manual stop kills the real subprocess and returns the card to review.
    fake_bin = root / "bin"
    fake_bin.mkdir()
    script = fake_bin / "codex"
    script.write_text("#!/bin/sh\ncat >/dev/null\n"
                      "echo '{\"type\":\"thread.started\",\"thread_id\":\"t-1\"}'\n"
                      "echo '{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\",\"command\":\"pytest -q\"}}'\n"
                      "sleep 30\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    with patch.dict(os.environ, {"PATH": str(fake_bin) + os.pathsep + os.environ["PATH"]}):
        server.execute_card(queued)
        deadline = time.time() + 5
        while time.time() < deadline and server.card_detail(queued)["runs"][0]["activity"] != "command:pytest -q":
            time.sleep(0.1)
        assert server.card_detail(queued)["runs"][0]["activity"] == "command:pytest -q"
        expect_error(lambda: server.stop_card(legacy), "没有在执行")
        started = time.time()
        server.stop_card(queued)
        while server.RUN_LOCK.locked() and time.time() - started < 10:
            time.sleep(0.1)
        assert time.time() - started < 8, "停止必须结束子进程"
    card = next(c for c in server.state()["cards"] if c["id"] == queued)
    run = server.card_detail(queued)["runs"][0]
    assert card["status"] == "review" and run["status"] == "failed" and run["thread_id"] == "t-1"
    assert card["issue"]["title"] == "已手动停止" and run["activity"] == ""

    # 2. Timeout uses the same stop path with its own reason.
    server.move_card(queued, {"status": "todo"})
    with patch.dict(os.environ, {"PATH": str(fake_bin) + os.pathsep + os.environ["PATH"]}), \
            patch("server.RUN_TIMEOUT_SECONDS", 1):
        server.execute_card(queued)
        started = time.time()
        while server.RUN_LOCK.locked() and time.time() - started < 10:
            time.sleep(0.1)
    card = next(c for c in server.state()["cards"] if c["id"] == queued)
    assert card["issue"]["title"] == "执行超时", card["issue"]

    # 13. Deletion: cards and projects, never while running; project needs its exact name.
    server.delete_card(legacy)
    expect_error(lambda: server.card_detail(legacy), "不存在")
    with server.db() as con:
        con.execute("UPDATE cards SET status='progress' WHERE id=?", (queued,))
    expect_error(lambda: server.delete_card(queued), "执行中")
    expect_error(lambda: server.delete_project(project, {"confirmName": "评审项目"}), "正在执行")
    with server.db() as con:
        con.execute("UPDATE cards SET status='review' WHERE id=?", (queued,))
    expect_error(lambda: server.delete_project(project, {"confirmName": "评审"}), "项目名称")
    server.delete_project(project, {"confirmName": "评审项目"})
    with server.db() as con:
        assert con.execute("SELECT COUNT(*) FROM cards WHERE project_id=?", (project,)).fetchone()[0] == 0
        assert con.execute("SELECT COUNT(*) FROM runs WHERE card_id=?", (queued,)).fetchone()[0] == 0
    server.delete_project(content, {"confirmName": "内容"})
    for item in server.state()["projects"]:  # The two demo projects from the first init_db().
        server.delete_project(item["id"], {"confirmName": item["name"]})
    server.init_db()  # Demo projects are generated once only.
    assert server.state()["projects"] == []

    # 12. Connections are closed after each use.
    with server.db() as con:
        pass
    try:
        con.execute("SELECT 1")
        raise AssertionError("连接应已关闭")
    except sqlite3.ProgrammingError:
        pass

print("需处理并入审阅、停止与超时、模型缓存降级、验收复查、增量版本、删除与连接关闭检查通过")
