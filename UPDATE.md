# Update

version: 1.0.7

## Changes

- Added `/status` command to show bot version, gateway status, and global player/server counts, backed by a new global player tally helper.
- Overhauled all `/job` mini-games to send public responses (no longer ephemeral) and added `/job cancel` to abort the current shift.
- Revamped the Bartender shift scoring (timed streak penalties, auto-complete on Shake/Stir) and introduced a richer Bouncer shift flow with guest lists, multi-select approvals, and randomized parties.
- Expanded the guest-name library, added DOB-based age checks, and ensured all bouncer lineups include readable guest lists.
- Updated `/job stats` to accept an optional target user and display results publicly for easier moderation.

## Job System Overview

The casino job system lets players run shift-based mini-games for XP, ranks, and chip rewards. Key commands:

1. `/job overview` — Shows the current rest tracker, tonight’s job roster, and personal progress.
2. `/job start <job>` — Launches a shift (Bartender, Bouncer, or Dealer). Shifts now appear publicly so the whole channel can watch.
3. `/job cancel` — Immediately ends your active shift with no payout or penalties.
4. `/job stats [user]` — Displays recent shifts, rank info, and rest timers for yourself or another player.
5. `/job reset / resetstats` — Admin tools to clear cooldowns or reset ranks across all jobs.

Mini-game highlights:

- **Bartender**: Select ingredients in order, manage time between steps, then finish with Shake/Stir. Penalties stack if you pause and the shift ends as soon as you choose the correct technique.
- **Bouncer**: Review the nightly checklist (guest list, age, dress code, wristband) and select which names to admit before hitting Continue. Parties can include multiple guests; only listed, fully compliant patrons should get through.
- **Dealer**: Classic poker-hand calls remain unchanged, but results are broadcast publicly for spectators.

Ranks increase with XP earned per shift, while rest streaks limit players to five consecutive shifts before a cooldown triggers. All shifts now surface timers, penalties, and history within the embeds so players know when they can jump back in.
