# Pending Update

version: 1.1.3

## Changes

- Added reusable thumbnail helper so game embeds attach their PNG artwork without posting separate files.
- Wired Blackjack, Dice War, Hold’em, Horse Race, Ride the Bus, Roulette, and Slots embeds to use their new thumbnails across initial replies and play-again flows.
- Updated timeout handling for Blackjack and Ride the Bus to show an embedded expiration message that keeps the game thumbnail in-place.
- Session summary embeds now attach the corresponding game thumbnail so wrap-up messages keep their art.
- Escaped literal `/slots` in the Slots button expiry message to avoid runtime `ReferenceError` exceptions.
- Rebalanced the bouncer shift mini-game to enforce the new checklist match rates, stage sizes, and occasionally send multiple guests through.

## Bug Fixes

- Fixed some unexpected crashes.
