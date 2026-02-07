# Semuta Casino Bot — Developer Guide

**Purpose**
This guide describes the codebase structure, configuration, and runtime behavior for the Semuta Casino Discord bot. It is intended for developers working on features, infrastructure, or debugging.

**Repository Layout**
Key folders and files.
- `src/index.mjs`: Discord bot entry point.
- `src/cli/deploy-commands.mjs`: Slash command registration.
- `src/api/server.mjs`: HTTP API (OAuth + webhooks).
- `src/commands/`: Slash command handlers.
- `src/games/`: Game engines and session flow.
- `src/jobs/`: Job system + scenarios.
- `src/cartel/`: Semuta Cartel system + background worker.
- `src/db/`: Postgres adapter and query helpers.
- `src/services/`: Integrations and background services (votes, updates, news).
- `src/lib/`: Shared helpers (emojis, casino category utilities, etc).
- `scripts/`: Operational and maintenance scripts.
- `docs/`: Design and feature docs.
- `UPDATE.md` and `news.md`: Update announcements and news items.

**Runtime Entry Points**
- Bot runtime: `node src/index.mjs`
- API runtime: `node src/api/server.mjs`
- Slash commands: `node src/cli/deploy-commands.mjs`

**Node Version**
`package.json` requires Node `>=20`. JSON import assertions used in the repo do not work on Node 18.

**Core Concepts**
- **Chips vs Credits**: Chips are the main currency; credits are a secondary balance used first on losses.
- **Global economy**: Balances and job data are stored in a shared ledger and are scoped by `guild_id`, but can be pinned to a single economy via `GLOBAL_ECONOMY_ID`.
- **Sessions**: Games create active sessions with timeouts and logging.
- **Permissions**: Owners, admins, and moderators are stored in the database and gated in `src/index.mjs`.

**Database**
The bot uses Postgres only.
- Schema file: `scripts/pg-schema.sql`
- Migration script: `scripts/migrate.mjs`
- Adapter: `src/db/db.pg.mjs` (loaded via `src/db/db.auto.mjs`)

Common commands:
1. Create database and user in Postgres.
2. Run migrations:
   - `DOTENV_CONFIG_PATH=debug/.env npm run sql:migrate:node`

**Permissions and Access**
- Owner override: `OWNER_USER_IDS`
- Admin/moderator lists are stored in DB and managed via:
  - `/addadmin`, `/removeadmin`
  - `/addmod`, `/removemod`
- Key checks live in `src/index.mjs` (`hasAdminAccess`, `hasModeratorAccess`).

**Slash Command Registration**
Global commands are registered via `src/cli/deploy-commands.mjs`.
- Deploy:
  - `DOTENV_CONFIG_PATH=debug/.env npm run deploy`
- Global commands can take up to 1 hour to propagate.

**Command Map**
Commands are declared in `src/cli/deploy-commands.mjs` and implemented in `src/commands/`.

Gameplay:
- `/blackjack` → `src/commands/blackjack.mjs`
- `/slots` → `src/commands/slots.mjs`
- `/roulette` → `src/commands/roulette.mjs`
- `/ridebus` → `src/commands/ridebus.mjs`
- `/dicewar` → `src/commands/dicewar.mjs`
- `/horserace` → `src/commands/horserace.mjs`
- `/holdem` → `src/commands/holdem.mjs`

Economy and user tools:
- `/balance` → `src/commands/balance.mjs`
- `/givechip` → `src/commands/givechip.mjs`
- `/givecredits` → `src/commands/givecredits.mjs`
- `/leaderboard` → `src/commands/leaderboard.mjs`
- `/dailyspin` → `src/commands/dailyspin.mjs`
- `/vote` → `src/commands/vote.mjs`
- `/beg` → `src/commands/beg.mjs`
- `/news` → `src/commands/news.mjs`

Jobs:
- `/job` → `src/commands/job.mjs`

Requests and moderation:
- `/request` → `src/commands/request.mjs`
- `/requesttimer` → `src/commands/requesttimer.mjs`
- `/stafflist` → `src/commands/stafflist.mjs`
- `/housebalance` → `src/commands/housebalance.mjs`
- `/houseadd` → `src/commands/houseadd.mjs`
- `/houseremove` → `src/commands/houseremove.mjs`
- `/mintchip` → `src/commands/mintchip.mjs`
- `/buyin` → `src/commands/buyin.mjs`
- `/takechips` → `src/commands/takechips.mjs`
- `/cashout` → `src/commands/cashout.mjs`
- `/givecredits` → `src/commands/givecredits.mjs`
- `/takecredits` → `src/commands/takecredits.mjs`
- `/addadmin` → `src/commands/addadmin.mjs`
- `/removeadmin` → `src/commands/removeadmin.mjs`
- `/addmod` → `src/commands/addmod.mjs`
- `/removemod` → `src/commands/removemod.mjs`
- `/resetallbalance` → `src/commands/resetallbalance.mjs`

Configuration:
- `/setcasinocategory` → `src/commands/setcasinocategory.mjs`
- `/setgamelogchannel` → `src/commands/setgamelogchannel.mjs`
- `/setcashlog` → `src/commands/setcashlog.mjs`
- `/setrequestchannel` → `src/commands/setrequestchannel.mjs`
- `/setupdatech` → `src/commands/setupdatech.mjs`
- `/setrake` → `src/commands/setrake.mjs`
- `/setmaxbet` → `src/commands/setmaxbet.mjs`
- `/kittenmode` → `src/commands/kittenmode.mjs`

Status and misc:
- `/ping` → `src/commands/ping.mjs`
- `/status` → `src/commands/status.mjs`
- `/8ball` → `src/commands/eightball.mjs`

Semuta Cartel system:
- `/cartel` → `src/commands/cartel.mjs`
- `/cartelreset` → `src/commands/cartelreset.mjs`
- `/setcartelshare` → `src/commands/setcartelshare.mjs`
- `/setcartelrate` → `src/commands/setcartelrate.mjs`
- `/setcartelxp` → `src/commands/setcartelxp.mjs`

**Games**
Game engines live in `src/games/`. Sessions, logging, and shared utilities are here.
- Session state: `src/games/session.mjs`
- Logging: `src/games/logging.mjs`
- Cards: `src/games/cards.mjs`
- Blackjack: `src/games/blackjack.mjs`
- Slots: `src/games/slots.mjs`
- Roulette: `src/games/roulette.mjs`
- Ride the Bus: `src/games/ridebus.mjs`
- Dice War: `src/commands/dicewar.mjs`
- Horse Race: `src/games/horserace.mjs`
- Hold’em: `src/games/holdem.mjs`

Most games:
- Check guild category settings before starting.
- Record session activity and timeouts.
- Use credits-first staking (chips are only taken if credits don’t cover the bet).
- Write to game logs when configured.

**Game Mechanics (Detailed)**
Technical flows and rules per game. File references are included for deep dives.

**Blackjack (`/blackjack`)**
Implementation: `src/games/blackjack.mjs`, `src/interactions/blackjackButtons.mjs`, `src/commands/blackjack.mjs`
1. Entry validation: must be in a guild. Table rules: `LOW` max bet `999`, `HIGH` min bet `1000`.
2. Staking model: credits-first. Chips stake is moved to the house on buy‑in; credits are only burned on loss.
3. House cover check: requires `chipStake + (bet * 2)` to cover worst-case payouts.
4. Natural blackjack: if player has 21 on first two cards, payout is `floor(bet * 1.5)` and chip stake is returned.
5. Dealer rules: hits to 17; `HIGH` uses H17 (hits soft 17), `LOW` uses S17.
6. Actions: `Hit`, `Stand`, `Double`, `Split`.
7. Double: only on first decision; adds another full bet, deals one card, then dealer plays.
8. Split: allowed when first two cards share the same value (10/J/Q/K all count as 10). Creates two hands with separate stakes. Double-after-split is disabled.
9. Settlement: win pays `chipStake + bet`; push returns `chipStake`; loss burns credit stake and keeps chip stake.
10. Timeout: inactive hands expire after the shared session timeout and are settled as a loss.

**Slots (`/slots`)**
Implementation: `src/games/slots.mjs`, `src/commands/slots.mjs`
1. Grid: 5 columns × 3 rows. Reels are fixed strips; `X` placeholders are filled with low symbols.
2. Paylines: 20 fixed lines (`SLOTS_LINES`), evaluated left → right.
3. Bet: total bet is spread across paylines. Line bet = `bet / 20`.
4. Symbols: wild (`W`) substitutes for regular symbols; scatter (`S`) pays anywhere.
5. Line wins: 3/4/5 of a kind on a line, payouts are `floor(pay * lineBet)`.
6. Scatter wins: `3/4/5` scatters pay `floor(scatterPay * lineBet)` and are added to line wins.
7. Staking model: credits-first. Chips stake is moved to the house; credits are burned only on a losing spin.
8. Payouts: only the win amount is paid (no stake return). House cover check uses `cover + chipStake >= win`.

**Roulette (`/roulette`)**
Implementation: `src/games/roulette.mjs`, `src/interactions/rouletteTypeSelect.mjs`, `src/interactions/rouletteModal.mjs`, `src/interactions/rouletteButtons.mjs`
1. Session: `/roulette` creates a per-user session and displays bet summary.
2. Bet entry: select a bet type, then fill a modal with amount (min `5`). Straight bets accept `0`, `00`, or `1–36`.
3. Bets are stored in-order and confirmed via a “Confirm” button.
4. Staking model: credits-first, allocated across bets in order. Credit portions are burned only on losing bets.
5. Payout multipliers: even‑money `1:1`, dozens/columns `2:1`, straight `35:1`.
6. House cover check: requires `chipStake + Σ(betAmount × payoutMult)` before spinning.
7. Spin: American roulette with pockets `0`, `00`, and `1–36`. `00` is represented internally as `37`.
8. Settlement: winning bets pay `betAmount × mult` plus return of their chip stake; losing bets burn their credit part.
9. Timeout: session expires via the shared timeout; expired sessions are closed without a spin.

**Ride the Bus (`/ridebus`)**
Implementation: `src/games/ridebus.mjs`, `src/interactions/ridebusButtons.mjs`
1. Entry: guild‑only; house cover check ensures `bet * 10` is available.
2. Staging: 4 questions with increasing multipliers `2× → 3× → 4× → 10×`.
3. Q1 (Color): red vs black; wrong answer loses.
4. Q2 (Higher/Lower): compare to Q1 card; ties lose.
5. Q3 (Inside/Outside): compare to range of first two cards. If Q1/Q2 are a pair, only “Outside” is legal.
6. Q4 (Suit): guess the suit of the final card.
7. Cash out: available after Q3 for `bet * 4`.
8. Staking model: credits-first. Chips stake is moved to the house; credits are burned only on loss.
9. Settlement: payout is `bet * multiplier` (or cashout), paid in chips.
10. Timeout: expired sessions burn credit stake and keep chip stake.

**Dice War (`/dicewar`)**
Implementation: `src/commands/dicewar.mjs`
1. Entry: guild‑only, bet must be positive integer.
2. Roll: player rolls 2d6, house rolls 2d6.
3. Win: player total > house total. Doubles only double payout on a win.
4. Tie: house wins.
5. Staking model: credits-first. Chips stake is moved to the house; credits are burned only on loss.
6. House cover check: requires `chipStake + (2 * bet)` for a possible double‑win.
7. Settlement: win pays `chipStake + bet` or `chipStake + 2*bet` if doubles.

**Horse Race (`/horserace`)**
Implementation: `src/games/horserace.mjs`
1. One race per channel. `/horserace` creates a race card and controls.
2. Betting stage: players select a horse (1–5) and amount (positive integer). One active bet per user.
3. Staking model: credits-first. Credits are burned; chips are staked to house.
4. House cover: exposure is `Σ(betAmount × 4)` and must be covered by house balance.
5. Countdown: host or moderators must start; a 5‑second countdown locks bets.
6. Running: 10 stages, each 2.5s. Each stage advances horses by `5–15` units on a 0–100 track.
7. Finish: early finish if any horse reaches 100; otherwise a winner is forced at stage 10.
8. Bet changes while running: stake amount is locked; only horse swaps are allowed with a fee of `ceil(originalAmount × max(1, stage/2))`.
9. Payouts: base multiplier is `4×`. Tie of 2 halves the multiplier to `2×`. Tie of 3+ uses `1×` (stake refund).
10. Cancellation and timeout: race can be cancelled before start by host/mod; a betting‑stage timeout refunds all stakes and fees.

**Texas Hold’em (`/holdem`)**
Implementation: `src/games/holdem.mjs`, `src/commands/holdem.mjs`
1. Table creation: `/holdem` offers presets or a custom modal. A new channel `holdem-table-N` is created inside the casino category.
2. Presets: `1/2` (min/max `10/100`), `5/10` (`50/500`), `20/40` (`200/2000`). Default rake is `500` bps (5%) with cap = max buy‑in.
3. Channel permissions: read for everyone, write for host + staff. Table is temporary.
4. Auto‑cleanup: empty tables close after 2 minutes; idle lobby closes after 10 minutes; inactive host is removed after 10 minutes.
5. Joining: buy‑in is chips‑only and escrowed (`escrowAdd`). Seat stack equals buy‑in.
6. Rebuy: allowed only between hands; chips‑only; must keep stack within min/max.
7. Hand flow: button rotates each hand; SB/BB are posted and committed to escrow; two hole cards are dealt.
8. Actions: fold, check/call, bet/raise, all‑in. If a player can’t cover a call, only fold or all‑in are allowed.
9. Timers: 30s action timer with a 10s warning; timeout auto‑folds.
10. Streets: preflop → flop → turn → river → showdown. If all active players are all‑in, remaining streets are run out.
11. Side pots: built from committed stacks. Pots are split evenly among tied winners; odd chips go to the first winner after the button.
12. Rake: computed from total pot as `floor(totalPot × rakeBps / 10000)` capped by `rakeCap`, removed from pots before payouts.
13. Settlement: winners are credited in escrow; rake is settled to house; result card is shown, then next hand auto‑starts.

**Jobs System**
Jobs are defined in `src/jobs/registry.mjs` and executed by `src/jobs/shift-engine.mjs`.
- Profiles and status are persisted in Postgres via `src/db/db.pg.mjs`.
- Job scenarios live in `src/jobs/scenarios/`.
- `/job` handles start, cancel, inspect, and admin resets.

**Semuta Cartel**
Cartel features are under `src/cartel/` and the `cartel` command.
- Passive production and market mechanics.
- Dealer system and upkeep.
- Background worker: `startCartelWorker` in `src/cartel/service.mjs`.

**Logging and Auditing**
These channels are configurable per guild:
- Game log channel: `/setgamelogchannel`
- Cash log channel: `/setcashlog`
- Request channel: `/setrequestchannel`
Each game and admin action writes structured summaries when configured.

**Requests and Privacy**
`/request` supports Buy In, Cash Out, and Erase Account Data.
- Request records are stored in DB.
- Staff approval flow is handled via interaction buttons.

**Votes and Rewards**
Vote integrations are in `src/services/votes.mjs`.
- Top.gg: API posting and webhook verification.
- DiscordBotList: webhook verification and rewards.
- Auto-redeem flow can be enabled via env vars.

**News and Updates**
- Update notes: `UPDATE.md`
- News items: `news.md`
- Update broadcast script: `scripts/updatepush.mjs`
- News service: `src/services/news.mjs`

**Emojis**
The bot uses application emojis declared in `src/lib/emojis.mjs`.
- Base mapping: `BASE_EMOJI`
- Runtime mapping: `EMOJI`

**API Server (OAuth + Webhooks)**
`src/api/server.mjs` provides:
- `/auth/discord` → Discord OAuth start
- `/auth/discord/callback` → OAuth callback
- `/auth/logout` → clear session
- Webhooks for Top.gg and DiscordBotList

OAuth requires:
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `AUTH_SESSION_SECRET`

**Operational Scripts**
Useful scripts in `scripts/`:
- `migrate.mjs`: Postgres migrations.
- `create-db.mjs`: Create DB from `DATABASE_URL`.
- `list-application-emojis.mjs`: Inspect emoji list for a bot.
- `build-emoji-map.mjs`: Generate debug emoji override map.
- `post-message.mjs`: Post a message to a guild channel (admin utility).
- `restart.sh`: Deploy commands and restart via systemd or PM2.

**Troubleshooting**
Common issues and fixes.
- Node syntax errors with `with { type: 'json' }`: upgrade to Node 20+.
- Slash commands missing: global propagation can take up to 1 hour.
