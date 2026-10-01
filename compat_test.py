"""Upgrades never lose a user's projects, tasks, comments, runs or preferences.

A database created by the first public preview (oldest schema, legacy `blocked`
status, global auto setting) is opened by the current server twice. Everything the
user created must survive, demo data must not be added, and the browser storage keys
that hold the language and selected project must keep their names.
"""
import re
import sqlite3
import tempfile
from pathlib import Path

import server

ROOT = Path(__file__).resolve().parent

OLD_SCHEMA = """
CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
                       workflow TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE cards (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
                    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', acceptance TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', tags TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE comments (id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id),
                       body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE runs (id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id), status TEXT NOT NULL,
                   thread_id TEXT NOT NULL DEFAULT '', output TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
                   started_at TEXT NOT NULL, ended_at TEXT NOT NULL DEFAULT '');
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings VALUES ('auto_enabled', 'true');
INSERT INTO projects VALUES (7, 'Customer project', '/tmp/somewhere', 'development', '2026-09-01T00:00:00+00:00');
INSERT INTO projects VALUES (8, '内容计划', '', 'content', '2026-09-01T00:00:00+00:00');
INSERT INTO cards VALUES (21, 7, 'Keep me', 'desc', 'criteria', 'blocked', 'high', 'a,b', '', '2026-09-01T00:00:00+00:00', '2026-09-02T00:00:00+00:00');
INSERT INTO cards VALUES (22, 7, 'Queued', '', 'criteria', 'todo', 'urgent', '', '', '2026-09-01T00:00:00+00:00', '2026-09-02T00:00:00+00:00');
INSERT INTO cards VALUES (23, 8, '选题', '', '', 'done', 'normal', '', '', '2026-09-01T00:00:00+00:00', '2026-09-02T00:00:00+00:00');
INSERT INTO comments VALUES (31, 21, 'user comment', '2026-09-02T00:00:00+00:00');
INSERT INTO runs VALUES (41, 21, 'failed', 't-1', '', 'permission denied', '2026-09-02T00:00:00+00:00', '2026-09-02T00:01:00+00:00');
"""


def snapshot(con):
    return {
        "projects": con.execute("SELECT id,name,path,workflow FROM projects ORDER BY id").fetchall(),
        "cards": con.execute("SELECT id,project_id,title,description,acceptance,priority,tags FROM cards ORDER BY id").fetchall(),
        "comments": con.execute("SELECT id,card_id,body FROM comments ORDER BY id").fetchall(),
        "runs": con.execute("SELECT id,card_id,status,thread_id,error FROM runs ORDER BY id").fetchall(),
    }


with tempfile.TemporaryDirectory() as folder:
    server.DB_PATH = Path(folder) / "board.sqlite3"
    with sqlite3.connect(server.DB_PATH) as con:
        con.executescript(OLD_SCHEMA)
        before = snapshot(con)
    for _ in range(2):   # migrations are repeatable
        server.init_db()
    with sqlite3.connect(server.DB_PATH) as con:
        assert snapshot(con) == before, "user data changed during upgrade"
        assert con.execute("SELECT workspace_path FROM runs WHERE id=41").fetchone()[0] == "", "legacy run history must remain unchanged"
        assert con.execute("SELECT status FROM cards WHERE id=21").fetchone()[0] == "review"
        assert con.execute("SELECT count(*) FROM projects").fetchone()[0] == 2, "demo data must not be added"
        assert con.execute("SELECT auto_enabled FROM projects WHERE id=7").fetchone()[0] == 1
    state = server.state()
    assert {c["id"]: c["task_number"] for c in state["cards"]} == {21: 1, 22: 2, 23: 1}
    card = next(c for c in state["cards"] if c["id"] == 21)
    assert card["issue"]["code"] == "permission" and card["commentCount"] == 1

# Browser preferences survive updates only if these keys never change.
assert 'LOCALE_STORAGE_KEY = "codexKanbanLocale"' in (ROOT / "i18n.js").read_text(encoding="utf-8")
assert re.search(r'storage\("get",\s*"boardProject"\)', (ROOT / "app.js").read_text(encoding="utf-8"))

# Repository and release never ship user data.
ignored = (ROOT / "public-docs" / ".gitignore").read_text(encoding="utf-8") if (ROOT / "public-docs").exists() else (ROOT / ".gitignore").read_text(encoding="utf-8")
for pattern in ("*.sqlite*", "backups/", ".remote/"):
    assert pattern in ignored, pattern

print("旧版数据库升级保留全部用户数据、不重复生成演示数据、浏览器偏好键名不变检查通过")
