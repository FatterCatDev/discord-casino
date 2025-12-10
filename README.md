# Semuta Casino — Discord Casino Bot
Last update: 1.2.9


Bring a living casino floor to your Discord server. Semuta’s shared house vault, interactive slash commands, and global ledgers mean your chips, credits, and job ranks follow you anywhere the bot is invited.

- **Invite link:** https://discord.com/oauth2/authorize?client_id=1415454565687492780
- **Supported tiers:** Works in any community that wants casino-style games, daily rewards, and lightweight roleplay jobs.
- **No setup drama:** Once staff pick a casino category, players can run every command themselves—no prefixes, just `/play`.

---

## Jump In
1. Invite the bot with the link above and hop into your server’s casino channels.
2. Type `/balance` to see your starting stack, `/dailyspin` for a free wheel, and `/vote` if you want extra chips right away.
3. Start a minigame (`/blackjack`, `/slots`, `/ridebus`, `/roulette`, `/horserace`, `/holdem`, `/dicewar`) or clock into `/job` for a shift.
4. Track your progress with `/leaderboard`, check `/job stats`, and cash out or buy in with `/request` when you need staff attention.

Everything runs through slash commands with responsive embeds, timers, and “play again” buttons, so you always know what’s happening.

---

## Shared Economy Basics
- **Chips** are the main payout currency. Wins land in chips straight from the Semuta House vault.
- **Credits** are your personal stake. Games always burn credits first on losses, then chips if needed.
- **Global ledger:** Your wallet, job data, and achievements sync instantly across every guild using the bot. Jump servers without losing progress.
- **Coverage checks:** The house won’t start a session unless it can pay the maximum possible win, so you never worry about IOUs.

### Easy Ways to Earn
- `/dailyspin` — Free reward wheel every 24 hours, with jackpots in chips.
- `/vote` — Support the bot on Top.gg/DiscordBotList and get automatic chip drops via DM.
- `/job` — Work interactive shifts (Dealer, Bartender, Bouncer, and more). Good runs pay chips, XP, and streak bonuses.
- `/request type:buyin amount:<chips>` — Ask moderators for a manual bankroll when events call for it.

---

## Casino Floor Highlights
All games (besides Hold’em buy-ins) use credits-first staking and pay chips on wins. Sessions time out after two minutes of inactivity, swapping your message with a recap.

- **Ride the Bus** — Clear four card prompts to earn up to 10× your bet. Cash out after the third round if you’re nervous.
- **Blackjack** — Two tables (Low stakes S17, High stakes H17). Split, double, and beat the house with slick reactions and H/ S text guidance.
- **Slots** — 5×3 video slot with 20 fixed lines, wilds, scatters, and quick “Spin Again” buttons.
- **Roulette (American)** — Stack inside/outside bets, confirm the board, and watch a detailed reveal that breaks down every wager.
- **Dice War** — Roll 2d6 vs. the house. Win with doubles and your payout doubles too.
- **Horse Race** — Bet on five horses sprinting over ten stages. Animated embeds narrate the countdown, swap fees, and final placements.
- **Texas Hold’em** — Host a full table with auto-created channels, private cards, turn timers, side pots, and rake tracking. Presets (1/2, 5/10, 20/40) or custom blinds supported.

Need channel structure? Staff run `/setcasinocategory` once and the bot enforces that games stay inside those channels. Hold’em tables spawn temporary text channels there and clean themselves up when idle.

---

## Jobs & Long-Term Progression
- Run `/job` anywhere to open the Semuta Career Board. Stamina, cooldowns, and XP sync globally.
- Each shift is a short interactive scenario. Answer before the timer expires to keep your streak alive.
- Stamina caps at five charges; you regenerate one every two hours. Finishing five shifts triggers a short rest before you can grind again.
- XP ranks unlock better chip bonuses. `/job stats` shows your history, ranks, and timers (yours or a friend’s).
- Staff helpers get `/job reset` (refill stamina) and `/job resetstats` for appeals—but the default flow keeps progress honest.

---

## Requests, Cash Outs, and Logs
- **Player requests:** `/request type:<Buy In|Cash Out|Erase Account Data> ...` Posts a detailed ticket in the primary review guild so staff can approve it. Optional timers keep spam down.
- **Channels:** `/setrequestchannel`, `/setcashlog`, and `/setgamelogchannel` route tickets, withdrawals, and session summaries where your community can review them.
- **Leaderboards:** `/leaderboard [limit]` shows global chip whales. `/stafflist` lists the humans you can ping for help.

When you ask for a data wipe, staff use secure buttons to purge balances, job stats, requests, vote history, and table escrow everywhere—then you get an automatic DM confirming the wipe.

---

## Commands You’ll Actually Use
- `/help` — In-Discord command index and explanations.
- `/balance [user]` — Peek at your wallet or flex on friends.
- `/dailyspin` / `/vote` — Consistent passive income.
- `/job`, `/job start job:<id>`, `/job cancel`, `/job stats [user]` — Manage shifts, stamina, and bragging rights.
- Gameplay: `/ridebus`, `/blackjack`, `/slots`, `/roulette`, `/horserace`, `/holdem`, `/dicewar`.
- `/request type:<Buy In|Cash Out|Erase Account Data>` — Work directly with staff for bankroll moves or privacy actions.
- `/givechip user:<@> amount:<int>` — Send chips directly from your stack to another player.
- `/housebalance`, `/mintchip`, `/setmaxbet`, `/setrake`, etc. remain available to moderators/admins, but regular players never need to touch them.

---

## Fair Play & Safety
- Sessions auto-close after two minutes of silence so stale bets never linger.
- Every payout, request, and job result writes to shared log channels. Communities can audit the action whenever they like.
- Unicode-only buttons and icons keep interactions consistent across guilds, devices, and themes.
- Privacy-first workflow: Erasure requests scrub your ledger data, job records, daily spins, vote rewards, table escrows, and staff roles across every server synchronized with the bot.

---

## Need Help?
- Ping a staff member listed in `/stafflist` or use `/request` to open a ticket in the Semuta hub.
- Want to check uptime or recent changes? Servers configured with `/setupdatech` receive patch notes straight from `UPDATE.md` whenever the owner runs the broadcast script.
- Bugs or ideas? Drop them where your community collects feedback—the Semuta team watches the global ledger for anything suspicious, but moderators remain your first contact.

Pull up a chair, set your status to “In the Casino,” and let Semuta’s Discord Casino Bot keep the cards, wheels, and job boards spinning 24/7. Good luck at the tables!
