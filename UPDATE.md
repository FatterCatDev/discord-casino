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
- Dealer mini game shifts now surface the community board in a dedicated pre-stage embed for faster visual parsing during each table.
- Bartender shifts feature a stripped down order ticket plus a full nightly menu listing, keeping recipe details in one place while tightening the main gameplay embed.
- Bouncer checkpoints present the guest lineup in its own embed while keeping the checklist in the core stage embed, eliminating redundant rest/cooldown copy and focusing players on admission decisions.
- Horse race flow now renders the track in its own embed with a bar-style progress display (no code blocks) stacked above the primary game embed.
- Swapped every remaining horse race unicode icon for the bot’s custom emoji inventory, including button labels, notices, and slash replies.
- Horse race progress counters report their actual totals, allowing distances beyond 100 to surface during late-stage ties.
