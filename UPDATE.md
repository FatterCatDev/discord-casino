# Pending Update

version: 1.1.1

## Changes

- Rolled back DM session-key refactors so all casino games once again require a guild-scoped session key.
- Added explicit DM guards to game commands and interactions to return a friendly error instead of crashing outside servers.
- Updated job payout summaries so the displayed base cap matches the actual maximum base payout per rank.
