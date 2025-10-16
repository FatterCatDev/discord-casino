# Pending Update

version: 1.0.10

## Changes

- Game and cash logs now forward to both the originating guild and the primary guild channels.
- Economy tweaks: Top.gg vote rewards default to 200 chips and job shift payouts are reduced to one-fifth.
- New-player flow: onboarding prompt now auto-grants 200 chips, tracks acknowledgements, and survives across database backends.
- Erasing an account now clears onboarding state so returning players start fresh.
- Casino games (except Hold’em) can run in any channel when no casino category is configured; Hold’em now explains how to set `/setcasinocategory`.
- `/help` overview card now highlights quick commands such as `/balance`, `/dailyspin`, and `/status`.
- Insufficient-funds warnings now include guidance to restock via `/dailyspin`, `/vote`, `/job`, or `/request type:buyin`.
