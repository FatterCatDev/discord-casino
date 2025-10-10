# Pending Update

version: 1.0.4

## Changes

- `/vote` now pays out both Top.gg and DiscordBotList votes automatically via webhooks, drops the claim button, and DMs players with the credited amount.
- Added DiscordBotList webhook endpoint (`/api/v1/webhooks/dbl`) plus new env toggles (`DBL_WEBHOOK_AUTH`, `DBL_VOTE_REWARD`, `DBL_VOTE_REWARD_REASON`).
- Help menu, README, and player guide refreshed to highlight automated vote rewards and onboarding steps.
- Interaction DM copy now reflects the actual vote sources instead of always mentioning Top.gg.
