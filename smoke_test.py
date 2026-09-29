"""Small persistence and workflow check for the prototype backend."""

import json
import os
import tempfile
from pathlib import Path

# Hermetic model catalog: never depend on the real ~/.codex cache.
_codex_home = tempfile.mkdtemp(prefix="codex-home-")
Path(_codex_home, "models_cache.json").write_text(json.dumps({"models": [{
    "slug": "test-model", "display_name": "Test", "visibility": "list",
    "supported_reasoning_levels": [{"effort": "low"}, {"effort": "medium"}, {"effort": "high"}],
    "default_reasoning_level": "medium"}]}))
Path(_codex_home, "config.toml").write_text('model = "test-model"\nmodel_reasoning_effort = "medium"\n')
os.environ["CODEX_HOME"] = _codex_home

import server


with tempfile.TemporaryDirectory() as directory:
    server.DB_PATH = Path(directory) / "test.sqlite3"
    server.init_db()
    project = server.create_project({"name": "验证项目", "path": directory, "workflow": "development"})
    card = server.create_card({"projectId": project["id"], "title": "验证任务"})
    try:
        server.move_card(card["id"], {"status": "todo"})
        raise AssertionError("缺少验收标准时不能进入待办")
    except ValueError as error:
        assert "验收标准" in str(error)
    server.update_card(card["id"], {"acceptance": "结果可检查"})
    server.move_card(card["id"], {"status": "todo"})
    server.add_comment(card["id"], {"body": "检查边界情况"})
    snapshot = server.state()
    assert next(c for c in snapshot["cards"] if c["id"] == card["id"])["status"] == "todo"
    assert any(c["body"] == "检查边界情况" for c in server.card_detail(card["id"])["comments"])
    server.move_card(card["id"], {"status": "review"})
    before = len(server.card_detail(card["id"])["comments"])
    with server.db() as con:  # The existing comment was already handed to an earlier run.
        con.execute("INSERT INTO runs(card_id,status,started_at,comment_through_id) VALUES (?,?,?,?)",
                    (card["id"], "completed", server.now(), max(c["id"] for c in server.card_detail(card["id"])["comments"])))
    try:
        server.submit_feedback(card["id"], {"body": " "})
        raise AssertionError("没有待交付评论时，空反馈不能返工")
    except ValueError:
        pass
    assert len(server.card_detail(card["id"])["comments"]) == before
    server.submit_feedback(card["id"], {"body": "请缩短欢迎语"})
    snapshot = server.state()
    assert next(c for c in snapshot["cards"] if c["id"] == card["id"])["status"] == "todo"
    assert len(server.card_detail(card["id"])["comments"]) == before + 1
    try:
        server.submit_feedback(card["id"], {"body": "重复提交"})
        raise AssertionError("不能重复返工")
    except ValueError:
        pass
    assert len(server.card_detail(card["id"])["comments"]) == before + 1
    # Exact comment IDs distinguish feedback even when timestamps share a second.
    def pending():
        return next(c for c in server.state()["cards"] if c["id"] == card["id"])["pendingFeedbackCount"]
    consumed = max(c["id"] for c in server.card_detail(card["id"])["comments"] if c["card_id"] == card["id"])
    with server.db() as con:
        con.execute("INSERT INTO runs(card_id,status,started_at,comment_through_id) VALUES (?,?,?,?)", (card["id"], "completed", server.now(), consumed))
    server.move_card(card["id"], {"status": "review"})
    assert pending() == 0
    server.add_comment(card["id"], {"body": "这一轮仍需修改"})
    assert pending() == 1
    server.move_card(card["id"], {"status": "todo"})
    assert pending() == 0
    server.move_card(card["id"], {"status": "review"})
    assert pending() == 1  # Moving alone does not consume the feedback.
    with server.db() as con:
        consumed = con.execute("SELECT MAX(id) FROM comments WHERE card_id=?", (card["id"],)).fetchone()[0]
        con.execute("INSERT INTO runs(card_id,status,started_at,comment_through_id) VALUES (?,?,?,?)", (card["id"], "completed", server.now(), consumed))
    assert pending() == 0
    server.add_comment(card["id"], {"body": "新的审阅意见"})
    assert pending() == 1
    for status in ("done", "cancelled"):
        if status == "done":
            server.approve_card(card["id"])
        else:
            server.move_card(card["id"], {"status": status})
        assert pending() == 0
    from unittest.mock import patch
    for operation in (lambda: server.move_card(card["id"], {"status":"done"}), lambda: server.approve_card(card["id"])):
        try:
            operation()
            raise AssertionError("非审阅状态不能直接完成")
        except ValueError:
            pass
    catalog = server.execution_catalog()
    chosen = catalog[0]
    config = {"model":chosen["id"], "thinking":chosen["efforts"][-1]}
    server.set_execution(card["id"], config)
    try:
        server.set_execution(card["id"], {"model":chosen["id"], "thinking":"invalid"})
        raise AssertionError("非法档位应拒绝")
    except ValueError:
        pass
    server.move_card(card["id"], {"status":"todo"})
    with patch("server.shutil.which", return_value="/test/codex"):
        claimed, run_id = server.claim_card(card["id"])
    run = next(r for r in server.card_detail(card["id"])["runs"] if r["id"] == run_id)
    assert (run["model"],run["thinking"]) == (config["model"],config["thinking"])
    command = server.execution_command(claimed)
    assert command[command.index("--model")+1] == config["model"]
    assert command[command.index("-c")+1] == 'model_reasoning_effort="' + config["thinking"] + '"'
    try:
        server.set_execution(card["id"], config)
        raise AssertionError("运行中配置不能改")
    except ValueError:
        pass
    server.update_project(project["id"], {"name": "更新后的项目", "path": directory})
    assert next(p for p in server.state()["projects"] if p["id"] == project["id"])["name"] == "更新后的项目"

print("后端流程与持久化检查通过")
