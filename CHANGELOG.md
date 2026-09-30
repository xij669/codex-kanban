# Changelog

## 0.2.2

- Add an account-wide Codex usage footer on desktop and mobile: remaining percentages for the available five-hour and weekly windows, with reset times in the viewer's local time zone. Low remaining quota (10% or less) uses a subtle amber label.
- Read the official Codex app-server `account/rateLimits/read` endpoint using the local CLI login. No model turn is started; no credential or raw account response is sent to the browser. API-key-only login, unsupported CLI versions and connection failures show unavailable, never zero.
- Share a one-minute in-memory cache across projects and browser tabs. Missing windows are omitted; expired windows await refreshed data instead of assuming a reset.
- Add quota adapter and UI checks; include the new module in ZIP updates and deployment. Existing projects, tasks, history and preferences are preserved.

## 0.2.1

- Display independent project-local task numbers (`TASK-001`); preserve existing global database IDs, comments and run history during migration.
- Persist numbering high-water marks and allocate in a transaction; deleted numbers are never reused, including internal IDs created after this upgrade. APIs expose a hidden global reference padded to at least 12 digits (`DEV-000000000001`).
- Three digits are minimum padding, not a ceiling. Numbers grow beyond 999; creation rejects values beyond JavaScript's safe integer limit instead of wrapping.
- Include task numbers in Agent context and project-scoped search. Search matches number, title, description and tags (case-insensitive); `#` searches tags only. Comments/run output are excluded. Searching reveals done/cancelled tasks; clearing search restores the previous visibility setting.

## 0.2.0

- **Interface text is looked up by key** (`i18n.js`, `t("key")`). The old page-scanning translation was removed: it could translate parts of user content (for example a project name inside the delete confirmation) and mix languages in one sentence.
- Server errors and run-failure reasons carry stable codes (`code` in error responses, `issue.code` on cards); the browser translates by code. Agent activity is sent as codes plus verbatim details.
- New `i18n_test.py`: every language has every key with the same placeholders; every server error and failure code is translated; no hard-coded interface text in `app.js` / `index.html`.
- Terminology: Backlog, To do, Auto-run, "Needs you" (English); バックログ, 未着手, 自動実行 (Japanese). Language names always appear in their own language.
- Japanese uses Japanese fonts (Hiragino Sans, Yu Gothic UI, Noto Sans CJK JP) instead of Chinese glyph forms; English uses the system UI font.
- Correct plurals in English (1 run / 2 runs), translated durations, and one-line card labels, chips and phone tabs in every language.
- The version is shown in the sidebar and Project settings only. On phones, language moved from the top bar to Project settings.
- Dropdown arrows are visible again in forms and the language selector.
- On phones, showing Done/Cancelled lays the six status tabs out in two rows so all of them stay visible. Long paths and links in card previews wrap instead of being cut off.
- The card button for sending a task back is now "Revise" in English, so it fits narrow columns; the detail panel still says "Submit changes".
- Layout fixes found by checking every screen in all three languages from 360 px phones to 1440 px desktops: long project names no longer squeeze the page title away; phone inputs and selects use 16 px text so iPhone does not zoom; the model picker gets its own row on phones; workflow options show just the name with the columns below; the empty state no longer shows leftover phone controls or a second language picker; the sidebar language picker fits narrow sidebars; running cards show the agent's current step on its own line; priority labels are never cut off (English times are now "25m ago"; after a day cards show just the date).
- Switching language no longer briefly shows "Connecting…".
- `update.py` refuses to update while a task is running. New `compat_test.py` opens a database from the first preview and verifies that every project, task, comment and run survives, that demo data is not added again, and that the browser storage keys for language and selected project keep their names.
- README in English, with Simplified Chinese and Japanese versions.
- AGENTS.md walks an agent through import step by step: new install or update, tests with a clear pass line, background start with a pid file, version check against `VERSION`, stop, and update. All three READMEs include a ready-made request to give an agent. The test command no longer closes an interactive terminal when a test fails.

## 0.1.1

- Overflowing sidebar project names scroll slowly on hover or keyboard focus and reset on leaving. Short names stay still; reduced-motion preferences are respected.

## 0.1.0

- Added a single `VERSION` value shown in the interface.
- Added a ZIP upgrade tool that copies only application files, makes a private SQLite backup, and preserves projects, tasks, settings and other user files. Browser language/selection remains tied to the same origin.
- Added Simplified Chinese, English and Japanese interface selection for desktop and phone.
- Split compact board-summary queries into `board_state.py`, reducing polling work as run history grows.
- Added SQLite indexes for card history and queue access, and ETag revalidation for static assets.
- Auto-run now wakes when work is queued, enabled or a run finishes; a 3-second fallback poll remains.

## Initial public preview

- Local project/task board, human approval, comments and rework.
- Per-project automatic claiming, priority queue, Codex CLI executor.
- Manual stop, execution timeout, bounded retry before tool work begins.
- Desktop and mobile interfaces; lightweight polling and draft protection.
- Portable source distribution with no personal data or machine configuration.

This is a preview, not a declared stable v1.0 release.
