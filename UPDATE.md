# Pending Update

version: 1.0.8

## Changes

<!-- Add one bullet per noteworthy change below. Example: - Improved chip payout handling -->
- Added detailed `/job` briefings for Bartender, Bouncer, and Dealer, including start gating and updated UI hints.
- Refined job shift scoring: dealer stages use tiered timers (20 pts <15s, 18 pts <30s, 15 pts <40s, then 45 − seconds) plus updated tips/prompts.
- Dealer mini-game UI now uses seat summaries for labels, multi-select dropdown, continue flow, and emoji-free text.
- Dealer stages fully randomize board and hands per shift while preserving scoring/evaluation.
- Dealer scoring displays elapsed time in history and correct answers use seat labels.
- Bartender and Bouncer stage embeds show briefing clarifications, ingredient pickers, and Open Bar/Queue gating.
- Briefing cancellations (`/job start` before pressing start) no longer consume shift streaks or rest limits.
- Dealer embeds and logs now include time-based scoring stats and selection summaries.
