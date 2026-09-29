# Agent import and contributor guide

Read README.md and SECURITY.md first. This is a local single-user Python 3.9+ / vanilla JS task board. No package install or build step is required. macOS is the validated target.

## Import / run

1. Work in the downloaded repository. Check `python3 --version`.
2. Run every `*_test.py`: `for t in *_test.py; do python3 -B "$t" || exit 1; done`.
3. Start `python3 -B server.py` on an unused loopback port; override with `BOARD_PORT` if necessary.
4. Check `GET /api/state`; report the local URL and process lifecycle to the user.
5. Only when the user requests real execution, check `codex` availability/authentication and ask for the target project directory. Start with a disposable test directory. Do not enable automatic claiming on the user's behalf without authorization.

## Boundaries

- Never read, print, copy, commit or upload CLI credentials, `.env`, private task data, databases, `.remote/`, logs or personal machine configuration.
- Do not bind to public interfaces or install startup/network services by default.
- Preserve existing databases and project files. Stop active runs before restarting or upgrading.
- For ZIP upgrades, use `python3 -B update.py /path/to/existing/install` from the new release; never replace the old directory. Keep the browser origin/port unchanged for local language and selected-project preferences. Git upgrades use `git pull --ff-only`, never force-reset user data.
- Tasks execute real commands. Never weaken sandboxing to solve an installation problem.
- Backlog never runs automatically. Success/failure returns to review. Only user approval marks done. State `blocked` is legacy and must not be reintroduced.
- Keep automatic claiming project-specific; one global executor slot; no preemption.

## Contributing

- `server.py`: HTTP, SQLite migrations, executor. `board_state.py`: compact board queries. `app.js`, `i18n.js`, `style.css`, `index.html`: UI and localization. `*_test.py`: no real model calls.
- Interface text lives in `i18n.js` (`t("key")`, keys with zh/en/ja). Server errors use codes (`BoardError`, `ERRORS`) and failure reasons use `issue.code`; the browser translates by code. Never put user content (task titles, comments, project names, tags, paths, run output) into translated text. `i18n_test.py` must pass.
- SQLite migrations must be idempotent, additive and keep existing data (`compat_test.py`). Never rename the browser storage keys `codexKanbanLocale` / `boardProject`. Add focused tests for behavior changes.
- Update `VERSION` and the changelog together for each visible release. The version is shown in the sidebar and Project settings.
- Run all tests after changes. Check desktop (≥1280px) and mobile (390×844) in Chinese, English and Japanese after UI changes.
- Main actions black/white; secondary paired actions outlined; destructive confirmation dark red. Same-level controls share sizes. Preserve unsaved form text during polling.
- Keep pull requests and bug reports free of personal paths, tokens, private domains, task contents and raw logs. Use synthetic reproductions.
