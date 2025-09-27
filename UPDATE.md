# Pending Update

version: 1.0.1

## Changes

- Globalized the casino economy: merged per-server balances into a shared house bank and wallet ledger, with migrations for both SQLite and Postgres stores.
- Recognize Discord user `94915805375889408` as the built-in economy owner (also treated as admin for slash commands) and refreshed in-bot messaging to highlight the global scope.
- Replaced role/permission based access checks with explicit `/addmod`, `/removemod`, `/addadmin`, and `/removeadmin` commands; moderator/admin gates now read solely from those user lists.
- Added `/stafflist` so anyone can review the current casino admins and moderators.
- Added a “Setup” help tab (visible to guild admins) with step-by-step onboarding instructions.
- Restored Discord Administrator overrides for configuring casino category and log channels, alongside the new staff lists.
