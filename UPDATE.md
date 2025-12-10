# Pending Update

version: 1.2.6

## Changes

- Added a centralized chip formatter so every player-facing chip amount now renders with the :chips: emoji and updated all embeds, system replies, and docs to use it.
- Simplified the `/cartel dealers` list UI by removing IDs/status/upkeep text, showing only essential stats, surfacing dealer slot usage at the top, and auto-graying inactive dealers.
- Cartel sell mini-game ticks now fire every 1.5 seconds for faster runs.
- Renamed `/givechips` to `/mintchip` with the same permissions and behavior so the command better reflects its purpose.
- Added `/givechip user:<@> amount:<int>` so players can tip or pay each other directly from their own chip balances.
- `/mintchip` now DMs recipients so they know who granted them chips and how much landed in their wallet, and `/givechip` sends a DM to the recipient whenever another player transfers chips to them.
- Semuta market floors (auto buy/sell prices) now scale 100× more aggressively with total shares, so booming cartels see much higher sell prices and buybacks.
- Removed the legacy per-guild economy switches—every chip and credit ledger now always uses the single global economy ID with no opt-out.

## Bug Fixes

<!-- Add one bullet per bug fix below. Example: - Fixed crash when playing blackjack in DMs -->
