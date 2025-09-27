# Pending Update

version: 1.0.1

## Changes

- Globalized the casino economy: merged per-server balances into a shared house bank and wallet ledger, with migrations for both SQLite and Postgres stores.
- Recognize Discord user `94915805375889408` as the built-in economy owner (also treated as admin for slash commands) and refreshed in-bot messaging to highlight the global scope.
- Replaced role/permission based access checks with explicit `/addmod`, `/removemod`, `/addadmin`, and `/removeadmin` commands; moderator/admin gates now read solely from those user lists.
