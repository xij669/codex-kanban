"""A ZIP-style upgrade must preserve existing project, task and settings data."""

import sqlite3
import tempfile
from pathlib import Path

from update import update_to


with tempfile.TemporaryDirectory() as folder:
    existing = Path(folder) / "installed"
    existing.mkdir()
    (existing / "server.py").write_text("old server")
    (existing / "index.html").write_text("old UI")
    (existing / ".remote").mkdir()
    (existing / ".remote" / "private-state").write_text("keep private")
    (existing / "my-project").mkdir()
    (existing / "my-project" / "work.txt").write_text("do not change")
    database = existing / "board.sqlite3"
    with sqlite3.connect(database) as con:
        con.executescript("""CREATE TABLE projects(id INTEGER, name TEXT);
                           CREATE TABLE cards(id INTEGER, title TEXT);
                           CREATE TABLE settings(key TEXT, value TEXT);
                           INSERT INTO projects VALUES(1, '我的项目');
                           INSERT INTO cards VALUES(2, '我的任务');
                           INSERT INTO settings VALUES('auto_enabled', 'true');""")
    original = database.read_bytes()

    backup = update_to(existing)
    assert database.read_bytes() == original
    assert backup and backup.exists()
    with sqlite3.connect(backup) as con:
        assert con.execute("SELECT name FROM projects").fetchone()[0] == "我的项目"
        assert con.execute("SELECT title FROM cards").fetchone()[0] == "我的任务"
        assert con.execute("SELECT value FROM settings").fetchone()[0] == "true"
    assert (existing / ".remote" / "private-state").read_text() == "keep private"
    assert (existing / "my-project" / "work.txt").read_text() == "do not change"
    assert (existing / "VERSION").read_text().strip() == (Path(__file__).parent / "VERSION").read_text().strip()
    assert (existing / "server.py").read_bytes() == (Path(__file__).parent / "server.py").read_bytes()

    # A repeated update creates a new backup and leaves the same data intact.
    assert update_to(existing) != backup
    assert database.read_bytes() == original

    # A live WAL can contain committed data absent from the main database file.
    with sqlite3.connect(database) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("INSERT INTO cards VALUES(3, 'WAL 中的任务')")
        con.commit()
        wal_backup = update_to(existing)
        with sqlite3.connect(wal_backup) as saved:
            assert saved.execute("SELECT title FROM cards WHERE id=3").fetchone()[0] == "WAL 中的任务"

    # Never update under a running task: nothing is replaced and no backup is made.
    with sqlite3.connect(database) as con:
        con.execute("CREATE TABLE runs(id INTEGER, card_id INTEGER, status TEXT)")
        con.execute("INSERT INTO runs VALUES(1, 2, 'running')")
    (existing / "server.py").write_text("installed server")
    backups_before = sorted((existing / "backups").iterdir())
    try:
        update_to(existing)
        raise AssertionError("update must refuse while a task is running")
    except ValueError as error:
        assert "running" in str(error)
    assert (existing / "server.py").read_text() == "installed server"
    assert sorted((existing / "backups").iterdir()) == backups_before

print("safe update test passed")
