# Agent import and contributor guide

Read README.md and SECURITY.md first. This is a local single-user Python 3.9+ / vanilla JS task board. No package install or build step is required. macOS is the validated target.

## Import / run

All commands run from the repository folder. They work in a non-interactive shell and never close the user's terminal.

### 0. New install or update?

- The folder already contains `board.sqlite3` → it is an **existing install**: go to step 5. Never delete, move or replace `board.sqlite3`, `backups/` or `.remote/`.
- A board may already be running: `curl -s http://127.0.0.1:8765/api/state` answering JSON with a `version` field means it is. Do not start a second copy on the same port.

### 1. Check and test

```sh
python3 --version   # needs 3.9 or newer
fail=0; for t in *_test.py; do python3 -B "$t" >/dev/null 2>&1 || { echo "FAILED: $t"; fail=1; }; done; [ "$fail" = 0 ] && echo "ALL TESTS PASSED"
```

Continue only if the last line is `ALL TESTS PASSED`. Tests use temporary databases and never call a model.

### 2. Start in the background

`server.py` runs until stopped, so start it in the background and keep its process id:

```sh
PORT=8765   # use 8766, 8767 … if step 0 found this port busy
BOARD_PORT=$PORT nohup python3 -B server.py > board.log 2>&1 &
echo $! > board.pid
```

`board.log` and `board.pid` are ignored by Git. The first start creates demo projects.

### 3. Verify

```sh
sleep 2
curl -s "http://127.0.0.1:$PORT/api/state" | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"
cat VERSION
```

Success: both lines print the same version. Then give the user `http://127.0.0.1:$PORT/` and tell them how to stop it (step 4). If the first command prints nothing, read `board.log` (for example, "Address already in use" means pick another port).

### 4. Stop

Ask the user to stop running tasks in the board first (a restart cannot reattach to a running task), then:

```sh
kill "$(cat board.pid)" && rm -f board.pid
```

### 5. Update an existing install

Stop the server first (step 4), then:

- **Git install** (the folder has `.git`): `git pull --ff-only`. Never force-reset; `board.sqlite3`, `backups/` and `.remote/` are ignored by Git.
- **ZIP install:** unzip the new version into a **different** folder and run `python3 -B update.py "/full/path/to/existing/install"` from the new folder. It backs up the database to `backups/`, replaces only `VERSION` and the program files, and refuses to run while a task is running.

Start the board again from the existing folder on the **same port** (steps 2–3), so the browser keeps the user's language and selected project.

### 6. Running real tasks (only when the user asks)

Check `codex --version` and that `codex exec --help` lists `--json`, `--approve-for-me`, `--cd`, `--skip-git-repo-check` and `--model`. Ask the user for the target project folder; start with a disposable test folder. Never turn on Auto-run for the user without their authorization.

## Boundaries

- Never read, print, copy, commit or upload CLI credentials, `.env`, private task data, databases, `.remote/`, logs or personal machine configuration.
- Do not bind to public interfaces or install startup/network services by default.
- Preserve existing databases and project files. Stop active runs before restarting or upgrading.
- For ZIP upgrades, use `python3 -B update.py /path/to/existing/install` from the new release; never replace the old directory. Keep the browser origin/port unchanged for local language and selected-project preferences. Git upgrades use `git pull --ff-only`, never force-reset user data.
- Tasks execute real commands. Never weaken sandboxing to solve an installation problem.
- Backlog never runs automatically. Success/failure returns to review. Only user approval marks done. State `blocked` is legacy and must not be reintroduced.
- Keep automatic claiming project-specific; one global executor slot; no preemption.
- `POST /api/cards/<global-id>/duplicate` creates a same-project Backlog task with a fresh ID/number and saved task inputs/configuration only. It never copies comments or execution history, or starts execution. Use the returned global `id`, not the displayed TASK number.

## Contributing

- `server.py`: HTTP, SQLite migrations, executor. `board_state.py`: compact board queries. `codex_usage.py`: read-only quota RPC and cache (`GET /api/usage`); needs local Codex ChatGPT login, never starts a model turn. `app.js`, `i18n.js`, `style.css`, `index.html`: UI and localization. `*_test.py`: no real model calls.
- Interface text lives in `i18n.js` (`t("key")`, keys with zh/en/ja). Server errors use codes (`BoardError`, `ERRORS`) and failure reasons use `issue.code`; the browser translates by code. Never put user content (task titles, comments, project names, tags, paths, run output) into translated text. `i18n_test.py` must pass.
- SQLite migrations must be idempotent, additive and keep existing data (`compat_test.py`). Never rename the browser storage keys `codexKanbanLocale` / `boardProject`. Add focused tests for behavior changes.
- Update `VERSION` and the changelog together for each visible release. The version is shown in the sidebar and Project settings.
- Run all tests after changes (step 1). Check desktop (≥1280px) and mobile (390×844) in Chinese, English and Japanese after UI changes.
- Main actions black/white; secondary paired actions outlined; destructive confirmation dark red. Same-level controls share sizes. Preserve unsaved form text during polling.
- Keep pull requests and bug reports free of personal paths, tokens, private domains, task contents and raw logs. Use synthetic reproductions.
