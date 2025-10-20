# Pending Update

version: 1.1.3

## Changes
- Added reusable thumbnail helper so game embeds attach their PNG artwork without posting separate files.
- Wired Blackjack, Dice War, Hold’em, Horse Race, Ride the Bus, Roulette, and Slots embeds to use their new thumbnails across initial replies and play-again flows.
- Updated timeout handling for Blackjack and Ride the Bus to show an embedded expiration message that keeps the game thumbnail in-place.
- Session summary embeds now attach the corresponding game thumbnail so wrap-up messages keep their art.
- Escaped literal `/slots` in the Slots button expiry message to avoid runtime `ReferenceError` exceptions.
- Rebalanced the bouncer shift mini-game to enforce the new checklist match rates, stage sizes, and occasionally send multiple guests through.
- Added global interaction logging (commands, buttons, selects, etc.) with per-user stats so we can understand engagement across the bot.
- Introduced automatic Top.gg review prompts: once a player hits 100 interactions they receive a DM asking for feedback and a review link, with retry safeguards for failed deliveries.
- Rebalanced the bouncer shift mini-game to enforce the new checklist match rates, stage sizes, and occasionally send multiple guests through.
- Migrated production storage from Cloud SQL to DigitalOcean managed Postgres, removed the proxy tooling, and refreshed docs/env samples with the new connection flow.
- Added a `scripts/transfer-postgres.sh` helper so we can dump from older Postgres hosts and restore into the new cluster in one step.
- Cleaned up repo secrets and binaries (Cloud SQL proxy, old credentials) and ignored Google Cloud SDK artifacts to keep the workspace lean.

## Bug Fixes

- Fixed some unexpected crashes.
- Resolved `SELF_SIGNED_CERT_IN_CHAIN` errors by loading the DigitalOcean CA bundle instead of disabling verification.
