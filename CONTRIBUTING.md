# Contributing

Codex Kanban uses Python 3.9+ and browser-native JavaScript. There is no build step or package installation.

1. Read [AGENTS.md](AGENTS.md) and [SECURITY.md](SECURITY.md).
2. Create a branch and make a focused change.
   - Interface text: add a key to `MESSAGES` in `i18n.js` with `zh`, `en` and `ja`, and use `t("key", {params})`. Never hard-code interface text in `app.js` or `index.html`, and never pass user content (project names, task text, comments, tags, paths, agent output) through `t()` or into a translated sentence.
   - New server errors go in `ERRORS` in `server.py` and are raised as `BoardError("code")`; add `err.<code>` to `i18n.js`. New failure reasons need `issue.<code>.title/short/action`.
   - Labels on cards, chips and tabs must fit on one line in all three languages.
3. Run `for t in *_test.py; do python3 -B "$t" || exit 1; done`.
4. For UI changes, inspect both desktop (at least 1280 px) and phone (390 × 844 px), in Chinese, English and Japanese. `i18n_test.py` must pass.
5. Open a pull request explaining the behavior, verification and any migration or deployment impact.

Never include databases, credentials, private domains, personal paths, logs, private tasks or raw model output in a pull request or issue. Use synthetic examples.

The project is a single-user preview. Preserve the current database schema and task workflow when refactoring; database migrations belong in `init_db()` and must work on existing data.

For each visible release, update `VERSION` and `CHANGELOG.md` together. The version is shown in the sidebar and in Project settings.

**Upgrades must never lose user data.** Migrations in `init_db()` only add structure, run repeatedly, and must pass `compat_test.py`. Never rename the browser storage keys `codexKanbanLocale` and `boardProject`. `update.py` replaces program files only; never ship or replace `board.sqlite3`, `backups/` or `.remote/`.
