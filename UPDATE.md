# Pending Update

version: 1.0.9

## Changes

- Rebuilt `/help` with a splash overview, category select, and dedicated Job section shared across slash replies and select-menu updates.
- Documented the global job system, paginated help content, and clarified always-on global economy behavior throughout the README.
- Swapped every custom emoji reference to the new application emoji IDs uploaded in the developer portal.
- Added `scripts/list-application-emojis.mjs` to dump the bot’s application emoji inventory from the CLI.
- Introduced paginated `/leaderboard` output (10 pages × 10 players) with interactive navigation buttons backed by a session cache.
- Defers leaderboard replies and ignores expired interaction errors to eliminate recurring Discord `10062` Unknown interaction logs.
- Published `docs/tos.md` and `docs/privacy-policy.md`, and wired `/request` erasure tickets through the global review flow with a one-click purge for moderators.
