#!/usr/bin/env python3
"""Install a downloaded release over an existing copy without touching user data.

Run from the NEW release: python3 -B update.py /path/to/existing/codex-kanban
Stop the existing server and its active tasks first. Keep its URL/port unchanged to
retain browser-local language and selected-project preferences.
"""

import argparse
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime
from pathlib import Path
from uuid import uuid4


APP_FILES = ("VERSION", "server.py", "board_state.py", "codex_usage.py", "app.js", "i18n.js", "index.html", "style.css")


def update_to(target, source=None):
    source = (Path(source) if source is not None else Path(__file__).parent).resolve()
    target = Path(target).expanduser().resolve()
    if source == target:
        raise ValueError("Source and existing installation must be different directories")
    if not target.is_dir() or not (target / "server.py").is_file() or not (target / "index.html").is_file():
        raise ValueError("Target must be an existing Codex Kanban installation")
    for name in APP_FILES:
        incoming, existing = source / name, target / name
        if not incoming.is_file() or incoming.is_symlink() or existing.is_symlink() or (existing.exists() and not existing.is_file()):
            raise ValueError("Missing or linked application file: " + name)

    database = target / "board.sqlite3"
    backup = None
    if database.is_symlink():
        raise ValueError("Refusing to update an installation with a linked database")
    if database.exists():
        # Replacing program files under a live run would orphan its Codex process.
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as current:
            has_runs = current.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='runs'").fetchone()
            if has_runs and current.execute("SELECT 1 FROM runs WHERE status='running' LIMIT 1").fetchone():
                raise ValueError("A task is still running. Stop it and the board server, then run the update again")
        backup_dir = target / "backups"
        if backup_dir.is_symlink():
            raise ValueError("Refusing to write backups through a linked directory")
        backup_dir.mkdir(mode=0o700, exist_ok=True)
        backup_dir.chmod(0o700)
        backup = backup_dir / ("board-" + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid4().hex[:8] + ".sqlite3")
        # SQLite's backup API also includes committed data held in WAL files.
        descriptor = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(descriptor)
        try:
            with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as current:
                with closing(sqlite3.connect(backup)) as saved:
                    current.backup(saved)
                    if saved.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise RuntimeError("Database backup failed integrity check")
        except BaseException:
            backup.unlink(missing_ok=True)
            raise
        backup.chmod(0o600)

    # Each program file is replaced atomically; databases, backups, project
    # folders, .remote/, browser preferences and unknown user files are untouched.
    for name in APP_FILES:
        incoming = source / name
        with tempfile.NamedTemporaryFile(dir=target, prefix=".codex-kanban-update-", delete=False) as stage:
            staged = Path(stage.name)
            try:
                stage.write(incoming.read_bytes())
                stage.flush()
                os.fsync(stage.fileno())
            except BaseException:
                staged.unlink(missing_ok=True)
                raise
        try:
            staged.chmod(0o644)
            os.replace(staged, target / name)
        finally:
            staged.unlink(missing_ok=True)
    return backup


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("existing_installation", help="existing Codex Kanban folder to update")
    args = parser.parse_args()
    try:
        backup_path = update_to(args.existing_installation)
    except (OSError, sqlite3.Error, RuntimeError, ValueError) as error:
        parser.exit(1, "Update stopped: " + str(error) + "\n")
    print("Updated application to v" + (Path(__file__).parent / "VERSION").read_text().strip())
    if backup_path:
        print("Existing database preserved; private backup: " + str(backup_path))
