# Codex Kanban

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

A local-first task board for human-reviewed Codex CLI work. You approve each task, the agent runs it on your own computer, and you review the result before it counts as done. Personal project; not an official OpenAI product.

**Single-user preview, macOS first.** Python standard library, SQLite and plain JavaScript: no pip/npm dependencies and no build step. Windows is not supported as an executor yet; Linux is not fully tested. Your phone can operate the board through a browser, but tasks always run on the host computer.

The interface is available in English, 简体中文 and 日本語 (switch in the sidebar, or in Project settings on a phone). The choice is stored in your browser. Your own content — project names, tasks, comments and agent output — is never translated.

## Quick start

1. Download: **Code → Download ZIP** and unzip it, or `git clone https://github.com/xij669/codex-kanban.git`.
2. In that folder, check Python 3.9+ and start the board:
   ```sh
   python3 --version
   python3 -B server.py
   ```
3. Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The first start creates demo projects. Stop with `Ctrl+C`.
4. If the port is taken: `BOARD_PORT=8766 python3 -B server.py`, then open that port.

You can try the board without Codex. To run tasks, install and sign in to the [Codex CLI](https://developers.openai.com/codex/cli/) and check that `codex --version` and `codex exec --help` work in the same terminal. The CLI must support `--json`, `--approve-for-me`, `--cd` and `--skip-git-repo-check`. Models are read from the local Codex cache; without it the CLI default is used.

## How it works

| Column | Who acts | What happens |
| --- | --- | --- |
| Backlog | You | Ideas and drafts. Never run automatically. Add acceptance criteria to move a task on. |
| To do | Agent | Queued in the order shown: Urgent → High → Medium → Low, then oldest first. |
| In progress | Agent | Elapsed time and the agent's current step are shown; you can stop it. |
| In review | You | **Approve**, or write a change request and **Submit changes** to send it back to To do. Failed, stopped and timed-out runs also land here with the reason. |
| Done / Cancelled | — | Hidden by default. |

One task runs at a time; urgent tasks do not interrupt a running one. A run stops after 60 minutes by default (`BOARD_RUN_TIMEOUT_MINUTES`, `0` for no limit). **Auto-run** is off by default and set per project.

### Your first run

1. Create an empty test folder, create a development project and link that folder.
2. Create a task with a goal and acceptance criteria. It starts in Backlog.
3. Move it to To do and click **Run now**. Turn on Auto-run only after you trust the flow.
4. When it reaches In review, check the real files, then Approve or submit a change request.

### Duplicate a task

Open an existing task and click the copy icon in the top-right corner (**Duplicate task**). One click creates and opens a new task in the same project, with a fresh task number in Backlog. It keeps the saved title, description, acceptance criteria, priority, tags, source link, model and thinking setting. Comments, replies, run history, rounds, failures and the original status are not copied. Save any unsaved edits or comments first. The copy will not run until you move it to To do.

## Updating without losing your data

Your projects, tasks, comments, run history and per-project settings live in `board.sqlite3` inside the folder you run the board from. Your language and selected project live in the browser. **Updates never replace any of these.**

Before updating: let running tasks finish (or stop them), then stop the board server. Keep using the same address and port afterwards so the browser keeps your language and selected project.

- **Installed with Git:** in the existing folder run `git pull --ff-only`. `board.sqlite3`, `backups/` and `.remote/` are ignored by Git and are never overwritten. If you edited program files yourself, resolve conflicts normally; never force-reset over your data.
- **Installed from a ZIP:** unzip the new version into a **different** folder, then from the new folder run:

  ```sh
  python3 -B update.py "/full/path/to/your/existing/codex-kanban"
  ```

  It replaces only `VERSION` and the seven program files, makes a private SQLite backup in `backups/` of the existing folder first, and refuses to run while a task is still running. Your database, projects, `.remote/` and other files are not touched. Start the board again **from the existing folder**. Never copy a new ZIP over the old folder.

Database migrations run automatically on start, only add structure, and are tested against databases from the first preview (`compat_test.py`). To roll back, stop the server and restore a copy from `backups/`; changes made after that backup are lost.

## Data and security

- Listens on `127.0.0.1` only and has **no login**. Do not expose it to the internet, GitHub Pages or a public proxy, and do not enable Tailscale Funnel. Phone access: see [REMOTE.md](REMOTE.md).
- The board launches an agent that reads and writes project folders. Start with a test folder or version control. Sandboxing is not a backup.
- Codex sends task context and files it reads to the configured model provider. Do not include data you may not share with it. Credentials stay with the CLI.
- A restart cannot reattach to a running task: stop tasks before quitting the server.
- Not included yet: automatic resume after usage limits, multi-user access, automatic backups, a Claude executor.

More: [SECURITY.md](SECURITY.md).

## Using an AI agent to install it

Give an agent the repository link or the unzipped folder together with this request:

> Read AGENTS.md, README.md and SECURITY.md in this repository, then follow "Import / run" in AGENTS.md step by step. If the folder already contains `board.sqlite3`, treat it as an update and keep all my data. Start the board in the background, confirm that `/api/state` reports the same version as the `VERSION` file, and give me the link and the command to stop it. Only start the board: do not create real tasks, turn on Auto-run, change existing project files, or read or upload credentials. If I ask to run tasks, check the Codex CLI first and ask me for a test folder. Do not expose the service to the network or change Tailscale or login items.

Agent guide: [AGENTS.md](AGENTS.md). No personal Codex configuration, database, API key or Tailscale file is needed.

## Development

```sh
fail=0; for t in *_test.py; do python3 -B "$t" >/dev/null 2>&1 || { echo "FAILED: $t"; fail=1; }; done; [ "$fail" = 0 ] && echo "ALL TESTS PASSED"
```

Tests use temporary databases and a fake executor; no model is called. `server.py` serves the API and runs tasks, `board_state.py` builds the board summary, and `app.js` / `i18n.js` / `index.html` / `style.css` are the interface. Interface text is looked up by key in `i18n.js`; `i18n_test.py` fails if any language or key is missing. Shortcuts: `N` new task, `/` search, `Esc` close. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 xij669.

Task numbers are local to each project, starting at `TASK-001`. Upgrades preserve database IDs and history; deleted numbers are not reused and padding grows beyond three digits. Search matches the current project’s number, title, description and tags, case-insensitively; `#` searches tags only. Comments and run output are excluded. Search includes done/cancelled tasks automatically; clearing it restores the previous visibility setting.

The footer shows account-wide Codex limits (available five-hour/weekly windows), remaining percentages and reset times in your device time zone. It refreshes every minute using the local Codex CLI ChatGPT login; it does not run a model. Missing/unsupported access is shown as unavailable. Limits are shared across projects, not a per-project budget.
