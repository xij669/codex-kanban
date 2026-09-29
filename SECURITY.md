# Security and privacy

This is a local, single-user prototype capable of launching a code-writing agent. It has no application login, user isolation or public-hosting hardening. Use loopback or a restricted private network only. Host/Origin checks are not authentication.

Codex login material remains under the CLI's own management and must never be packaged with this project. Local tasks, comments, model output, directory paths and thread identifiers live in SQLite and may be sensitive. Database backups and logs must remain private. CLI/model providers receive context used for execution; follow your data policies.

Do not attach production databases, credential files, `.remote/`, complete model transcripts or unredacted screenshots to public issues. Report bugs with a minimal synthetic example. For a sensitive vulnerability, use GitHub's private vulnerability reporting if the repository owner has enabled it. Otherwise ask the maintainer for a private channel without posting exploit details or secrets publicly.

The repository owner should enable secret scanning / push protection where available and private vulnerability reporting before announcing the project. Scanners reduce risk; they cannot prove the absence of all private information.
