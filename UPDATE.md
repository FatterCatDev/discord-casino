# Pending Update

version: 1.0.6

## Changes
- Blackjack UI now uses the new custom card emoji set for titles and hand labels.
- Horse Race settlement embeds highlight winners alongside house net and burned credits.
- `/leaderboard` responses are now ephemeral and display player names instead of mentions.
- Game and cash logs share the same display-name formatting, removing noisy @mentions.
- Emoji usage is centralized via `src/lib/emojis.mjs`, deploying the casino’s custom set across commands and games while race tracks stick to Unicode blocks.
- Update push tooling locks in the shared announcement channel before broadcasting version notes.
- Minor tweaks to all emojis being used by all games and UI's.