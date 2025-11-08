# Pending Update

version: 1.1.6

## Changes

<!-- Add one bullet per noteworthy change below. Example: - Improved chip payout handling -->
- Added an automated “champion” role sync that keeps the top home-guild leaderboard player wearing role `1436737307591049308`.
- Created a dedicated champion-role service and wired it into the ready lifecycle so the home guild is checked on startup and on an interval.
- Leaderboard queries now ignore players listed on the global staff roster (admins or moderators), keeping staff off the public rankings.
- Champion changes now queue personal notifications: players are alerted the next time they use a command, and off-server champions receive a DM invite to claim the custom role in the primary guild.
- Reworked the `/help` menu to split server-admin setup commands, hide mod/admin sections from regular guild staff, and document the primary-guild-only request intake controls.
- Locked `/setrequestchannel` to bot admins inside the configured primary guild so request funnels can only be moved from the home server.
- Added `/8ball` — a public magic 8-ball that only the reigning #1 High Roller can use, complete with question validation and themed responses.

## Bug Fixes

<!-- Add one bullet per bug fix below. Example: - Fixed crash when playing blackjack in DMs -->
