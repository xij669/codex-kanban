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
- Tasks execute real commands. Never weaken sandboxing to solve an installation problem.
- Backlog never runs automatically. Success/failure returns to review. Only user approval marks done. State `blocked` is legacy and must not be reintroduced.
- Keep automatic claiming project-specific; one global executor slot; no preemption.

## Contributing

- `server.py`: HTTP, SQLite migrations, executor. `app.js`, `style.css`, `index.html`: UI. `*_test.py`: no real model calls.
- SQLite migrations must be idempotent and support existing data. Add focused tests for behavior changes.
- Run all tests after changes. Check desktop (≥1280px) and mobile (390×844) after UI changes.
- Main actions black/white; secondary paired actions outlined; destructive confirmation dark red. Same-level controls share sizes. Preserve unsaved form text during polling.
- Keep pull requests and bug reports free of personal paths, tokens, private domains, task contents and raw logs. Use synthetic reproductions.
