# Pending Update

version: 1.0.6

## Changes
- Horse Race overhaul: randomized horse names with color + horse emoji labels, right-aligned progress meters, persistent previous-race summaries, and refreshed stage timing text.
- Horse Race settlement embeds now highlight winners alongside house net and any burned credits.
- `/leaderboard` responses are now ephemeral and show player display names instead of raw mentions.
- Game and cash logs share the same display-name formatting, removing noisy @mentions.
- Emoji usage is centralized via `src/lib/emojis.mjs`, swapping in the casino’s custom emoji set across commands.
- Update push tooling locks in the shared announcement channel before broadcasting version notes.
